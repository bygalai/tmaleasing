/**
 * Газпромбанк Автолизинг (autogpbl.ru) — парсер автомобилей и техники с пробегом.
 * Каталоги: filter-type=4 — легковые, filter-type=6 — грузовые, filter-type=2 — спецтехника, filter-type=8 — прицепы.
 * Пишет в таблицу listings (source='gazprom', category='legkovye' | 'gruzovye' | 'speztechnika' | 'pricepy').
 *
 * Env (для GitHub Actions workflow_dispatch):
 *   GAZPROMP_MAX_PER_SECTION — макс объявлений на категорию (0 = без лимита)
 *   GAZPROMP_MAX_PAGES      — точное число страниц на категорию (0 = авто)
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

import dotenv from 'dotenv'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Page } from 'puppeteer'

dotenv.config({ path: pathResolve(process.cwd(), '.env') })
puppeteer.use(StealthPlugin())

let shutdownRequested = false

process.on('SIGTERM', () => {
  shutdownRequested = true
  console.log('Received SIGTERM, will finish current work and save partial results')
})
process.on('SIGINT', () => {
  shutdownRequested = true
  console.log('Received SIGINT, will finish current work and save partial results')
})

function isShutdownError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  const s = msg.toLowerCase()
  return (
    s.includes('canceled') ||
    s.includes('cancelled') ||
    s.includes('target closed') ||
    s.includes('target has been closed') ||
    s.includes('protocol error') ||
    s.includes('session closed')
  )
}

const SOURCE = 'gazprom'
const GAZPROM_BASE_URL = 'https://autogpbl.ru'
const ALLOWED_DOMAIN = 'autogpbl.ru'

/**
 * Секции каталога: легковые, грузовые, спецтехника, прицепы.
 * condition=100000002 — «с пробегом», даёт пагинацию ?page=1,2,... (12 лотов на страницу).
 * Без condition — load-more, нестабильно и меньше лотов.
 */
const GAZPROM_SECTIONS: Array<{ catalogUrl: string; category: string }> = [
  {
    catalogUrl: 'https://autogpbl.ru/avtomobili-i-tekhnika-s-probegom/?condition=100000002&filter-type=4',
    category: 'legkovye',
  },
  {
    catalogUrl: 'https://autogpbl.ru/avtomobili-i-tekhnika-s-probegom/?condition=100000002&filter-type=6',
    category: 'gruzovye',
  },
  {
    catalogUrl: 'https://autogpbl.ru/avtomobili-i-tekhnika-s-probegom/?condition=100000002&filter-type=2',
    category: 'speztechnika',
  },
  {
    catalogUrl: 'https://autogpbl.ru/avtomobili-i-tekhnika-s-probegom/?condition=100000002&filter-type=8',
    category: 'pricepy',
  },
]

/** Паттерн URL карточки: /avtomobili-i-tekhnika-s-probegom/{brand}/{model}/{id}/ */
const DETAIL_PATH_REGEX = /^\/avtomobili-i-tekhnika-s-probegom\/[^/]+\/[^/]+\/\d+\/?$/

const BAD_IMAGE_SUBSTRINGS = [
  'logo',
  'favicon',
  'sprite',
  'icon',
  'apple-touch-icon',
  'button',
  'banner',
  'cookie',
  'telegram',
  'yandex',
  'captcha',
  '1x1',
  'pixel',
]

/**
 * Позитивная валидация заголовка: принимаем ТОЛЬКО то, что похоже на название техники.
 * Вместо бесконечного blacklist — чёткие признаки «мусора» и требования к форме.
 */
const TITLE_MIN_LEN = 4
const TITLE_MAX_LEN = 90

/** Признаки мусора: код, аналитика, UI, маркетинг. Один матч = отклоняем. */
const JUNK_INDICATORS = [
  /\bкод\b/i,
  /\bскрипт/i,
  /\bдолжен\b/i,
  /загрузк/i,
  /\bметрик/i,
  /\bпользователь\b/i,
  /\bфоллбэк\b/i,
  /\s--\s/, // комментарии в коде
  /\|\s*[а-яё]/i, // "title | какой-то текст"
  /для\s+юридических\s+лиц/i,
  /с\s+пробегом\s+в\s+лизинг\s+для/i,
  /лизинг\s+для\s+юр/i,
  /с\s+экономией\s+средств/i,
  /оформить\s+заявку/i,
  /оставить\s+заявку/i,
  /купить\s+на\s+выгодных/i,
  /ежемесячным\s+платежом/i,
  /при\s+полной\s+загрузке/i,
  /подключаем\s+метрику/i,
  /яндекс[.\s]*метрика/i,
  /google\s+analytics/i,
]

const TITLE_BLOCKLIST = new Set([
  'каталог',
  'газпромбанк',
  'автолизинг',
  'лизинг',
  'с пробегом',
  'автомобили с пробегом',
  'автомобили и техника с пробегом',
])

const CITY_BLOCKLIST = new Set([
  'оборудование',
  'недвижимость',
  'подвижной состав',
  'объем', // «Объем двигателя» — частый ложный матч при неверном порядке полей
])

/** Слаг типа кузова из заголовка → русское название (для body_type) */
const BODY_TYPE_SLUG_TO_RU: Record<string, string> = {
  'sedelnyy-tyagach': 'Седельный тягач',
  'ekskavator-pogruzchik': 'Экскаватор-погрузчик',
  'musorovoz': 'Мусоровоз',
  'bortovoy': 'Бортовой',
  'bortovoy-s-gp': 'Бортовой с ГП',
  'bortovoy-s-kmu': 'Бортовой с КМУ',
  'samosval': 'Самосвал',
  'tsisterna': 'Цистерна',
  'refrizherator': 'Рефрижератор',
  'rephrizherator': 'Рефрижератор',
  'furgon': 'Фургон',
  'avtokran': 'Автокран',
  'buldozer': 'Бульдозер',
  'ekskavator': 'Экскаватор',
  'frontalnyy': 'Фронтальный',
  'vnedorozhnik': 'Внедорожник',
  'sedan': 'Седан',
  'universal': 'Универсал',
  'pickup': 'Пикап',
  'polupricep': 'Полуприцеп',
  'pricep': 'Прицеп',
  'izotermicheskiy': 'Изотермический',
  'shornyy': 'Шторный',
}

/** Жёсткий blacklist конкретных проблемных карточек Gazprom (ломают / зависают при загрузке). */
const PROBLEM_DETAIL_URLS = new Set<string>([
  'https://autogpbl.ru/avtomobili-i-tekhnika-s-probegom/prolift/rv-richtrak-1/789360/',
  'https://autogpbl.ru/avtomobili-i-tekhnika-s-probegom/prolift/rv-richtrak-1/789360',
])

type ScrapedListing = {
  external_id: string
  title: string
  price: number | null
  original_price: number | null
  mileage: number | null
  year: number | null
  images: string[]
  listing_url: string
  source: string
  category: string
  city: string | null
  vin: string | null
  engine: string | null
  transmission: string | null
  drivetrain: string | null
  body_color: string | null
  body_type: string | null
}

function listingToRow(listing: ScrapedListing): Record<string, unknown> {
  const row: Record<string, unknown> = {
    external_id: listing.external_id,
    title: listing.title,
    listing_url: listing.listing_url,
    source: listing.source,
    category: listing.category,
    images: listing.images,
  }
  if (listing.price != null) row.price = listing.price
  if (listing.original_price != null) row.original_price = listing.original_price
  if (listing.mileage != null) row.mileage = listing.mileage
  if (listing.year != null) row.year = listing.year
  if (listing.city != null) row.city = listing.city
  if (listing.vin != null) row.vin = listing.vin
  if (listing.engine != null) row.engine = listing.engine
  if (listing.transmission != null) row.transmission = listing.transmission
  if (listing.drivetrain != null) row.drivetrain = listing.drivetrain
  if (listing.body_color != null) row.body_color = listing.body_color
  if (listing.body_type != null) row.body_type = listing.body_type
  return row
}

const UPSERT_BATCH_SIZE = 500

async function upsertListings(
  supabase: SupabaseClient,
  listings: ScrapedListing[]
): Promise<void> {
  if (listings.length === 0) return
  for (let i = 0; i < listings.length; i += UPSERT_BATCH_SIZE) {
    const batch = listings.slice(i, i + UPSERT_BATCH_SIZE).map(listingToRow)
    const { error } = await supabase.from('listings').upsert(batch, { onConflict: 'external_id' })
    if (error) throw error
  }
}

// --- env & supabase ---

function decodeEnvFile(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le')
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length)
    for (let i = 0; i < buffer.length - 1; i += 2) {
      swapped[i] = buffer[i + 1]
      swapped[i + 1] = buffer[i]
    }
    return swapped.toString('utf16le')
  }
  let zeroBytes = 0
  for (const byte of buffer) {
    if (byte === 0) zeroBytes += 1
  }
  if (buffer.length > 0 && zeroBytes / buffer.length > 0.2) {
    return buffer.toString('utf16le')
  }
  return buffer.toString('utf8')
}

function parseAndInjectEnv(filePath: string): void {
  if (!existsSync(filePath)) return
  const decoded = decodeEnvFile(readFileSync(filePath)).replace(/^\uFEFF/, '')
  const lines = decoded.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) continue
    const key = trimmed
      .slice(0, separatorIndex)
      .trim()
      .replace(/\uFEFF/g, '')
      .replaceAll('\u0000', '')
    let value = trimmed.slice(separatorIndex + 1).trim()
    value = value.replace(/^['"]|['"]$/g, '').replaceAll('\u0000', '')
    if (!key || process.env[key]) continue
    process.env[key] = value
  }
}

function ensureEnvLoaded(): void {
  for (const name of ['.env', '.env.local', '.env.production']) {
    parseAndInjectEnv(pathResolve(process.cwd(), name))
  }
}

function resolveSupabaseCredentials(): { url: string | null; key: string | null } {
  const url =
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    null
  const key =
    process.env.SUPABASE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.VITE_SUPABASE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    null
  return { url, key }
}

// --- helpers ---

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function randomDelay(minMs = 400, maxMs = 1200): Promise<void> {
  await sleep(randomInt(minMs, maxMs))
}

function toAbsoluteUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const absolute = new URL(value, GAZPROM_BASE_URL)
    if (!absolute.hostname.includes(ALLOWED_DOMAIN)) return null
    return absolute.toString()
  } catch {
    return null
  }
}

function buildExternalId(listingUrl: string): string {
  return createHash('sha256').update(listingUrl).digest('hex')
}

/** Типы кузова в конце заголовка (кириллица). Сначала длинные — «Седельный тягач» до «тягач». */
const CYRILLIC_BODY_TYPE_SUFFIXES = [
  'Седельный тягач',
  'Экскаватор-погрузчик',
  'Буровая установка',
  'Изотермический/рефрижератор',
  'Бортовой с ГП',
  'Бортовой с КМУ',
  'Мусоровоз',
  'Экскаватор',
  'Бульдозер',
  'Автокран',
  'Форвардер',
  'Самосвал',
  'Бортовой',
  'Цистерна',
  'Рефрижератор',
  'Фронтальный',
  'Полуприцеп',
  'Прицеп',
  'Седельный',
  'Тягач',
]

/** Извлекает тип кузова из заголовка (латинский слаг или кириллица в конце). Возвращает очищенный заголовок и body_type. */
function extractBodyTypeSuffixFromTitle(value: string): {
  cleanedTitle: string
  bodyTypeRu: string | null
} {
  const fallback = 'Легковой автомобиль'
  let cleaned = value.replace(/\s+/g, ' ').trim()
  let bodyTypeRu: string | null = null

  // Кириллица в конце: "Hyundai R380 Экскаватор", "КАМАЗ 65117 Мусоровоз"
  for (const bt of CYRILLIC_BODY_TYPE_SUFFIXES) {
    const re = new RegExp(`\\s+${bt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    if (re.test(cleaned)) {
      bodyTypeRu = bt
      cleaned = cleaned.replace(re, '').trim()
      break
    }
  }

  // Суффикс-слаг: " - -SEDELNYY-TYAGACH-1" или "-EKSKAVATOR-POGRUZCHIK-1"
  const suffixMatch = !bodyTypeRu && cleaned.match(/[-\s]*-([A-Z][A-Za-z0-9\-]+)$/i)
  if (suffixMatch) {
    let slug = suffixMatch[1].replace(/-?\d+$/, '').toLowerCase()
    bodyTypeRu = BODY_TYPE_SLUG_TO_RU[slug] ?? null
    if (!bodyTypeRu && slug.length > 2) {
      const parts = slug.split('-').map((p) => {
        const m: Record<string, string> = {
          ekskavator: 'Экскаватор',
          pogruzchik: 'погрузчик',
          sedelnyy: 'Седельный',
          tyagach: 'тягач',
          musorovoz: 'Мусоровоз',
          bortovoy: 'Бортовой',
          frontalnyy: 'Фронтальный',
        }
        return m[p] ?? p.charAt(0).toUpperCase() + p.slice(1)
      })
      bodyTypeRu = parts.join('-')
    }
    cleaned = cleaned.slice(0, suffixMatch.index).replace(/[-\s]+$/, '').trim()
  }

  cleaned = cleaned.replace(/\s*\d+[xхX]\d+\s*/gi, ' ').replace(/\s+/g, ' ').trim()
  cleaned = cleaned.replace(/\s*\*\s*/g, ' ').replace(/\s+/g, ' ').trim()
  cleaned = cleaned.replace(/[-\s]+$/, '').trim()
  return { cleanedTitle: cleaned.length > 0 ? cleaned : fallback, bodyTypeRu }
}

function sanitizeTitle(value: string | null | undefined): string {
  if (!value) return 'Легковой автомобиль'
  const { cleanedTitle } = extractBodyTypeSuffixFromTitle(value)
  return cleanedTitle
}

/**
 * Позитивная проверка: похоже ли на название техники.
 * Должно: содержать латиницу или цифры (бренд/модель), длина 4-90, без признаков мусора.
 */
function looksLikeVehicleTitle(
  value: string | null | undefined,
  brandFromUrl?: string | null
): boolean {
  if (!value) return false
  const n = value.replace(/\s+/g, ' ').trim()
  if (n.length < TITLE_MIN_LEN || n.length > TITLE_MAX_LEN) return false
  if (TITLE_BLOCKLIST.has(n.toLowerCase())) return false
  if (JUNK_INDICATORS.some((re) => re.test(n))) return false
  if (!/[A-Za-z0-9]/.test(n)) return false // бренд/модель — обычно латиница или цифры
  if (brandFromUrl && !new RegExp(brandFromUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(n)) {
    return false
  }
  return true
}

function isDetailUrl(url: string): boolean {
  try {
    const parsed = new URL(url, GAZPROM_BASE_URL)
    if (!parsed.hostname.includes(ALLOWED_DOMAIN)) return false
    return DETAIL_PATH_REGEX.test(parsed.pathname)
  } catch {
    return false
  }
}

// --- page: extract detail URLs from catalog ---

async function configurePageForStealth(page: Page): Promise<void> {
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  })
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const type = request.resourceType()
    if (type === 'font' || type === 'stylesheet' || type === 'image') {
      request.abort()
      return
    }
    request.continue()
  })
}

/** Паттерн пути карточки в HTML: /avtomobili-i-tekhnika-s-probegom/brand/model/id */
const DETAIL_PATH_IN_HTML_RE = /\/avtomobili-i-tekhnika-s-probegom\/[^"'>\s]+\/[^"'>\s]+\/\d+/g

/** Извлекает ссылки на карточки из HTML каталога. */
function extractDetailUrlsFromHtml(html: string, baseUrl: string): string[] {
  const out = new Set<string>()
  let m: RegExpExecArray | null
  DETAIL_PATH_IN_HTML_RE.lastIndex = 0
  while ((m = DETAIL_PATH_IN_HTML_RE.exec(html)) !== null) {
    const path = m[0].replace(/\/$/, '') || m[0]
    if (!DETAIL_PATH_REGEX.test(path)) continue
    try {
      const full = new URL(path, baseUrl)
      if (full.hostname.includes(ALLOWED_DOMAIN)) out.add(full.toString().replace(/\/$/, ''))
    } catch {
      /* ignore */
    }
  }
  return [...out].filter((u) => isDetailUrl(u))
}

/** Собирает ссылки через page.evaluate (fallback). */
async function extractDetailUrlsFromPage(page: Page): Promise<string[]> {
  const urls = await page.evaluate((baseUrl: string) => {
    const out = new Set<string>()
    const re = /^\/avtomobili-i-tekhnika-s-probegom\/[^/]+\/[^/]+\/\d+\/?$/
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    for (const a of anchors) {
      const href = a.getAttribute('href')
      if (!href) continue
      try {
        const full = new URL(href, baseUrl)
        if (full.hostname !== new URL(baseUrl).hostname) continue
        const path = full.pathname.replace(/\/$/, '') || '/'
        if (!re.test(path)) continue
        out.add(full.toString())
      } catch {
        /* ignore */
      }
    }
    return [...out]
  }, GAZPROM_BASE_URL)
  return urls.filter((u) => isDetailUrl(u))
}

/** Добавляет параметр пагинации. Bitrix: PAGEN_1. Некоторые сайты: page. */
function withPagination(baseUrl: string, pageNum: number, param: 'PAGEN_1' | 'page' = 'PAGEN_1'): string {
  try {
    const u = new URL(baseUrl, GAZPROM_BASE_URL)
    u.searchParams.set(param, String(pageNum))
    return u.toString()
  } catch {
    return baseUrl
  }
}

/** Прокрутка + клик «Показать еще» — один проход. */
async function scrollAndClickLoadMore(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    for (let i = 0; i < 12; i += 1) {
      window.scrollBy(0, 600)
      await new Promise((r) => setTimeout(r, 400))
    }
    const btns = Array.from(document.querySelectorAll('button, a[href], [role="button"], .show-more, [data-action="load-more"]'))
    for (const btn of btns) {
      const text = (btn?.textContent || '').toLowerCase()
      if (
        text.includes('показать') ||
        text.includes('еще') ||
        text.includes('загрузить') ||
        text.includes('ещё')
      ) {
        ;(btn as HTMLElement)?.click()
        await new Promise((r) => setTimeout(r, 2500))
        return true
      }
    }
    window.scrollTo(0, document.body.scrollHeight)
    await new Promise((r) => setTimeout(r, 1500))
    return false
  })
}

/** Раскрывает весь каталог на странице: скролл + «Показать еще», пока не перестанут появляться ссылки. */
async function expandCatalogUntilStable(
  page: Page,
  extractUrls: () => Promise<string[]>,
  maxRounds = 8
): Promise<string[]> {
  let prevCount = 0
  let stableRounds = 0
  const all = new Set<string>()

  for (let round = 0; round < maxRounds; round += 1) {
    const clicked = await scrollAndClickLoadMore(page)
    await sleep(800)
    const urls = await extractUrls()
    urls.forEach((u) => all.add(u))

    if (all.size === prevCount) {
      stableRounds += 1
      if (stableRounds >= 2 || !clicked) break
    } else {
      stableRounds = 0
    }
    prevCount = all.size
  }
  return [...all]
}

/** Картинка из живой DOM. Только из зоны: после h1 и до «Похожие предложения» — баннеры/акции (LEASING, автомобиль) выше h1. */
const EXTRACT_IMAGE_SCRIPT = `
(function() {
  var bad = ['logo', 'favicon', 'icon', 'sprite', 'button', 'banner', 'cookie', '1x1', 'pixel', 'akcii', 'aktsii', 'promo'];
  function isBad(src) {
    if (!src) return true;
    var s = src.toLowerCase();
    return bad.some(function(p) { return s.indexOf(p) >= 0; }) || s.indexOf('.svg') === s.length - 4 || s.indexOf('data:') === 0;
  }
  var h1 = document.querySelector('h1');
  var afterH1 = h1 || document.body;
  var cutOff = null;
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  var el;
  while ((el = walker.nextNode())) {
    var txt = (el.textContent || '').trim();
    if (txt === 'Похожие предложения' || txt.indexOf('Похожие предложения') === 0) {
      cutOff = el;
      break;
    }
  }
  function inValidZone(img) {
    if (afterH1 && (afterH1.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) return false;
    if (cutOff && (cutOff.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_PRECEDING) === 0) return false;
    return true;
  }
  var imgs = Array.from(document.querySelectorAll('img'));
  for (var i = 0; i < imgs.length; i++) {
    var img = imgs[i];
    if (!inValidZone(img)) continue;
    var src = (img.src || img.getAttribute('data-src') || '').trim();
    if (!src || isBad(src)) continue;
    var rect = img.getBoundingClientRect();
    if (rect.width >= 200 && rect.height >= 120 && /\\.(jpe?g|png|webp)/i.test(src)) return src;
  }
  for (var j = 0; j < imgs.length; j++) {
    if (!inValidZone(imgs[j])) continue;
    var s = (imgs[j].src || imgs[j].getAttribute('data-src') || '').trim();
    if (!s || isBad(s)) continue;
    if (/\\.(jpe?g|png|webp)/i.test(s) || /upload|media|photo|image/i.test(s)) return s;
  }
  return null;
})();
`

// DOM‑скрипты оставлены выше на случай будущего использования в браузере,
// но для надёжности парсера ГАЗПРОМа сейчас не используются.

// --- enrich one detail page and build ScrapedListing ---

const FALLBACK_IMAGE = 'https://dummyimage.com/1200x800/1f2937/e5e7eb&text=Vehicle+Photo+Pending'

/** Извлечение в child process — при зависании (ReDoS и т.п.) убиваем процесс, скипаем карточку. */
const PARSE_CHILD_SCRIPT = pathResolve(dirname(fileURLToPath(import.meta.url)), 'gazprom-parse-child.ts')
const PARSE_TIMEOUT_MS = 25_000

async function extractInChildProcess(
  html: string,
  pageUrl: string
): Promise<{
  title: string | null
  price: number | null
  originalPrice: number | null
  mileage: number | null
  year: number | null
  imageUrl: string | null
  city: string | null
  bodyColor: string | null
  bodyType: string | null
  engine: string | null
  drivetrain: string | null
  transmission: string | null
} | null> {
  return new Promise((resolve) => {
    const tsxCli = pathResolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs')
    const child = spawn(process.execPath, [tsxCli, PARSE_CHILD_SCRIPT], {
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(null)
    }, PARSE_TIMEOUT_MS)
    let resolved = false
    const finish = (result: Awaited<ReturnType<typeof extractInChildProcess>>) => {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      resolve(result)
    }
    child.on('error', () => finish(null))
    child.on('exit', (code) => {
      if (!resolved) finish(null)
    })
    let buf = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      if (buf.includes('\n')) {
        const line = buf.split('\n')[0]
        try {
          const parsed = JSON.parse(line) as { ok?: boolean; data?: unknown; error?: string }
          if (parsed.ok && parsed.data) finish(parsed.data as Awaited<ReturnType<typeof extractInChildProcess>>)
          else finish(null)
        } catch {
          finish(null)
        }
      }
    })
    child.stdin?.write(JSON.stringify({ html, pageUrl }) + '\n', (err) => {
      if (err) finish(null)
    })
    child.stdin?.end()
  })
}

const CATALOG_FETCH_TIMEOUT_MS = 45_000
const DETAIL_FETCH_TIMEOUT_MS = 35_000
const DETAIL_NAV_TIMEOUT_MS = 50_000

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
      redirect: 'follow',
    })
    clearTimeout(t)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function fetchDetailHtml(detailUrl: string): Promise<string | null> {
  const html = await fetchWithTimeout(detailUrl, DETAIL_FETCH_TIMEOUT_MS)
  return html && html.length > 3000 ? html : null
}

async function enrichAndCollectListing(
  page: Page,
  detailUrl: string,
  category: string
): Promise<ScrapedListing | null> {
  try {
    let html: string | null = await fetchDetailHtml(detailUrl)
    if (!html) {
      await page.goto(detailUrl, {
        waitUntil: 'domcontentloaded',
        timeout: DETAIL_NAV_TIMEOUT_MS,
      })
      await sleep(process.env.CI ? 1000 : 1500)
      html = await page.content()
    }
    const MAX_HTML_LEN = 150_000
    if (html.length > MAX_HTML_LEN) html = html.slice(0, MAX_HTML_LEN)
    const data = await extractInChildProcess(html, detailUrl)
    if (!data) {
      console.warn(`  skip (parse timeout/bug): ${detailUrl}`)
      return null
    }

    const title = data.title && looksLikeVehicleTitle(data.title) ? data.title : null
    if (!title) {
      console.warn(`  skip (no title): ${detailUrl}`)
      return null
    }

    const wheelFormulaFromTitle = title.match(/\d+[xхX]\d+/)?.[0] ?? null
    const drivetrain = data.drivetrain?.trim() || wheelFormulaFromTitle || null

    const { cleanedTitle, bodyTypeRu } = extractBodyTypeSuffixFromTitle(title)
    const bodyType = data.bodyType?.trim() || bodyTypeRu || null

    const MIN_VEHICLE_PRICE = 100_000
    if (!data.price || data.price < MIN_VEHICLE_PRICE) {
      console.warn(`  skip (no/implausible price): ${title.slice(0, 40)}...`)
      return null
    }

    let absoluteImage: string | null = data.imageUrl ? toAbsoluteUrl(data.imageUrl) : null
    if (!absoluteImage) absoluteImage = FALLBACK_IMAGE

    const listing: ScrapedListing = {
      external_id: buildExternalId(detailUrl),
      title: cleanedTitle,
      price: data.price,
      original_price: data.originalPrice ?? null,
      mileage: data.mileage,
      year: data.year,
      images: [absoluteImage],
      listing_url: detailUrl,
      source: SOURCE,
      category,
      city: data.city,
      vin: null,
      engine: data.engine,
      transmission: data.transmission ?? null,
      drivetrain,
      body_color: data.bodyColor,
      body_type: bodyType,
    }

    return listing
  } catch (err) {
    if (isShutdownError(err)) throw err
    console.warn(`  enrich failed for ${detailUrl}:`, err instanceof Error ? err.message : err)
    return null
  }
}

const DETAIL_PAGE_TIMEOUT_MS = 55_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => {
        console.warn(`  skip (timeout ${ms / 1000}s): ${label}`)
        resolve(null)
      }, ms)
    }),
  ])
}

// --- main scrape loop ---

async function scrapeListings(supabase: SupabaseClient): Promise<Set<string>> {
  const isCI = !!process.env.CI
  const browser = await puppeteer.launch({
    headless: isCI,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      ...(isCI ? ['--disable-dev-shm-usage', '--disable-gpu'] : []),
    ],
  })

  let page = await browser.newPage()
  await configurePageForStealth(page)
  page.setDefaultNavigationTimeout(90_000)
  page.setDefaultTimeout(45_000)

  const collected = new Map<string, ScrapedListing>()
  const allScrapedIds = new Set<string>()

  // Временный фильтр разделов по умолчанию: спецтехника + прицепы.
  const sectionFilterRaw = process.env.GAZPROMP_SECTIONS ?? 'speztechnika,pricepy'
  const sectionFilter = sectionFilterRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const sectionsToProcess =
    sectionFilter.length > 0
      ? GAZPROM_SECTIONS.filter((s) => sectionFilter.includes(s.category))
      : GAZPROM_SECTIONS

  const refreshPage = async (): Promise<void> => {
    await page.close().catch(() => {})
    page = await browser.newPage()
    await configurePageForStealth(page)
    page.setDefaultNavigationTimeout(90_000)
    page.setDefaultTimeout(45_000)
  }

  try {
    for (const section of sectionsToProcess) {
      if (shutdownRequested) break
      console.log(`\n=== Section: ${section.category} (${section.catalogUrl}) ===`)

      try {
        const maxPerSectionRaw = Number(process.env.GAZPROMP_MAX_PER_SECTION ?? '0')
        const maxPerSection =
          Number.isFinite(maxPerSectionRaw) && maxPerSectionRaw > 0 ? maxPerSectionRaw : 0
        const maxPagesRaw = Number(process.env.GAZPROMP_MAX_PAGES ?? '0')
        const maxPagesLimit =
          Number.isFinite(maxPagesRaw) && maxPagesRaw > 0 ? Math.min(maxPagesRaw, 50) : 0
        // С condition=100000002 каталог пагинируется через ?page=N, по 12 лотов на страницу. Load-more нет.
        const maxPages =
          maxPagesLimit > 0 ? maxPagesLimit : 60

        const allUrls = new Set<string>()
        let emptyPagesInARow = 0
        for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
          const url =
            pageNum === 1
              ? section.catalogUrl
              : withPagination(section.catalogUrl, pageNum, 'page')
          let pageUrls: string[]
          const catalogHtml = await fetchWithTimeout(url, CATALOG_FETCH_TIMEOUT_MS)
          if (catalogHtml && catalogHtml.length > 5000) {
            pageUrls = extractDetailUrlsFromHtml(catalogHtml, GAZPROM_BASE_URL)
          } else {
            try {
              await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
            } catch (navErr) {
              if (isShutdownError(navErr)) break
              if (pageNum > 1) break
              throw navErr
            }
            await sleep(process.env.CI ? 2000 : 3000)
            pageUrls = await extractDetailUrlsFromPage(page)
          }
          const before = allUrls.size
          for (const u of pageUrls) allUrls.add(u)
          const added = allUrls.size - before
          console.log(`  Page ${pageNum}: +${added} links (total ${allUrls.size})`)

          emptyPagesInARow = added === 0 ? emptyPagesInARow + 1 : 0
          if (emptyPagesInARow >= 2) break
          if (maxPagesLimit > 0 && pageNum >= maxPagesLimit) break
          await randomDelay(800, 1500)
        }

        const detailUrls = [...allUrls].filter((u) => !PROBLEM_DETAIL_URLS.has(u))
        const urlsToProcess = maxPerSection > 0 ? detailUrls.slice(0, maxPerSection) : detailUrls
        if (maxPerSection > 0 || maxPagesLimit > 0) {
          const limits: string[] = []
          if (maxPerSection > 0) limits.push(`max_listings=${maxPerSection}`)
          if (maxPagesLimit > 0) limits.push(`pages=${maxPagesLimit}`)
          console.log(
            `Found ${detailUrls.length} detail links, processing ${urlsToProcess.length} (${limits.join(', ')})`
          )
        } else {
          console.log(`Found ${detailUrls.length} detail links on catalog page`)
        }

        // Последовательно, как Alfaleasing: page.goto вместо fetch — стабильнее, без зависаний
        for (let i = 0; i < urlsToProcess.length; i += 1) {
          if (shutdownRequested) break
          const url = urlsToProcess[i]
          if (collected.has(buildExternalId(url))) continue
          if (/prolift|richtrak/i.test(url)) {
            console.warn(`  skip (known problematic): ${url}`)
            continue
          }

          const listing = await withTimeout(
            enrichAndCollectListing(page, url, section.category),
            DETAIL_PAGE_TIMEOUT_MS,
            url
          )
          if (listing) {
            collected.set(listing.external_id, listing)
            console.log(
              `+ [${section.category}] ${listing.title} | ${listing.price ?? '?'} ₽ | ${listing.year ?? '?'} г. | ${
                listing.city ?? '—'
              }`
            )
          }
          const processed = i + 1
          if (processed % 5 === 0 || processed === urlsToProcess.length) {
            console.log(
              `  progress [${section.category}]: ${processed}/${urlsToProcess.length} detail pages processed`
            )
          }
          await randomDelay(400, 900)
        }

        const sectionListings = [...collected.values()].filter((l) => l.category === section.category)
        if (sectionListings.length > 0) {
          await upsertListings(supabase, sectionListings)
          for (const l of sectionListings) {
            allScrapedIds.add(l.external_id)
            collected.delete(l.external_id)
          }
          console.log(`  [supabase] upserted ${sectionListings.length} ${section.category}`)
        }
        await randomDelay(800, 1800)
      } catch (sectionErr) {
        if (isShutdownError(sectionErr)) throw sectionErr
        console.error(`Section ${section.category} failed:`, sectionErr)
        await refreshPage()
        continue
      }
    }

    console.log(`\nScraped ${allScrapedIds.size} unique listings from Gazprom.`)
    return allScrapedIds
  } finally {
    await page.close()
    await browser.close()
  }
}

// --- run: upsert to Supabase ---

async function run(): Promise<void> {
  ensureEnvLoaded()
  const { url: supabaseUrl, key: supabaseKey } = resolveSupabaseCredentials()

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase credentials. Set SUPABASE_URL + SUPABASE_KEY (or VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).'
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const scrapedIds = await scrapeListings(supabase)
    if (scrapedIds.size === 0) {
      console.log('No listings scraped, skipping cleanup.')
      return
    }

    const { data: existingRows } = await supabase
      .from('listings')
      .select('external_id')
      .eq('source', SOURCE)
    const toRemove = (existingRows ?? [])
      .map((r) => (r as { external_id?: string }).external_id)
      .filter((id): id is string => !!id && !scrapedIds.has(id))

    if (toRemove.length > 0) {
      const REMOVE_BATCH = 500
      for (let i = 0; i < toRemove.length; i += REMOVE_BATCH) {
        const batch = toRemove.slice(i, i + REMOVE_BATCH)
        const { error: removeErr } = await supabase
          .from('listings')
          .delete()
          .eq('source', SOURCE)
          .in('external_id', batch)
        if (removeErr) {
          console.warn(`Sync cleanup warning: ${removeErr.message}`)
          break
        }
      }
      console.log(`Removed ${toRemove.length} old Gazprom listings (sync cleanup).`)
    }
  } catch (error) {
    console.error('Gazprom scraper failed:', error)
    process.exitCode = 1
  }
}

void run()
