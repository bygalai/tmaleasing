/**
 * Газпромбанк Автолизинг (autogpbl.ru) — парсер автомобилей и техники с пробегом.
 * Каталоги: filter-type=4 — легковые, filter-type=6 — грузовые, filter-type=2 — спецтехника, filter-type=8 — прицепы.
 * Пишет в таблицу listings (source='gazprom', category='legkovye' | 'gruzovye' | 'speztechnika' | 'pricepy').
 * В Mini App объявления отображаются в соответствующих разделах.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import dotenv from 'dotenv'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { createClient } from '@supabase/supabase-js'
import type { Page } from 'puppeteer'

dotenv.config({ path: resolve(process.cwd(), '.env') })
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

/** Секции каталога: легковые, грузовые, спецтехника, прицепы. */
const GAZPROM_SECTIONS: Array<{ catalogUrl: string; category: string }> = [
  {
    catalogUrl: 'https://autogpbl.ru/avtomobili-i-tekhnika-s-probegom/?filter-type=4',
    category: 'legkovye',
  },
  {
    catalogUrl: 'https://autogpbl.ru/avtomobili-i-tekhnika-s-probegom/?filter-type=6',
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

const TITLE_BLOCKLIST = new Set([
  'автомобили и техника с пробегом',
  'каталог',
  'газпромбанк',
  'автолизинг',
  'лизинг',
  'с пробегом',
])

/** Шаблоны маркетинговых/финансовых фраз — не названия техники. */
const TITLE_REJECT_PATTERNS = [
  /купить\s+на\s+выгодных/i,
  /ежемесячным\s+платежом/i,
  /платеж\s+от\s+\d{5,}/i,
  /\d{7,}\s*₽?/,
  /оформить\s+заявку/i,
  /оставить\s+заявку/i,
  /в\s+лизинг\s+от/i,
  /финансовы[ем]+\s+услови/i,
  /с\s+пробегом\s+в\s+лизинг\s+для\s+юр/i,
]

const CITY_BLOCKLIST = new Set(['оборудование', 'недвижимость', 'подвижной состав'])

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
    parseAndInjectEnv(resolve(process.cwd(), name))
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

function normalizeNumber(input: string | null | undefined): number | null {
  if (!input) return null
  const digits = String(input).replace(/[\s\u00A0]/g, '').replace(/[^\d]/g, '')
  if (!digits) return null
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? parsed : null
}

function parseYear(input: string | null | undefined): number | null {
  if (!input) return null
  const yearMatch = String(input).match(/\b(19\d{2}|20\d{2})\b/)
  if (!yearMatch) return null
  const year = Number(yearMatch[1])
  if (!Number.isFinite(year) || year < 1990 || year > 2030) return null
  return year
}

function isBadImageCandidate(value: string | null | undefined): boolean {
  if (!value) return true
  const trimmed = value.trim()
  if (!trimmed) return true
  const lowered = trimmed.toLowerCase()
  if (lowered.startsWith('data:')) return true
  if (lowered.endsWith('.svg')) return true
  if (BAD_IMAGE_SUBSTRINGS.some((part) => lowered.includes(part))) return true
  return false
}

function pickBestImageCandidate(candidates: Array<string | null | undefined>): string | null {
  const urls = candidates
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
    .filter((v) => !isBadImageCandidate(v))
  if (urls.length === 0) return null
  const score = (url: string): number => {
    const lowered = url.toLowerCase()
    let points = 0
    if (/\.(jpe?g|png|webp)(\?|#|$)/i.test(lowered)) points += 5
    if (lowered.includes('/upload/') || lowered.includes('/images/') || lowered.includes('/media/')) points += 3
    if (lowered.includes('/img/')) points -= 1
    return points
  }
  urls.sort((a, b) => score(b) - score(a))
  return urls[0]
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

function sanitizeTitle(value: string | null | undefined): string {
  const fallback = 'Легковой автомобиль'
  if (!value) return fallback
  let cleaned = value.replace(/\s+/g, ' ').trim()
  // Убираем колёсную формулу из названия (6х6, 4x2 и т.д.) — она идёт в отдельное поле
  cleaned = cleaned.replace(/\s*\d+[xхX]\d+\s*/gi, ' ').replace(/\s+/g, ' ').trim()
  // Убираем звёздочки в названиях спецтехники (напр. "SL763* Фронтальный")
  cleaned = cleaned.replace(/\s*\*\s*/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : fallback
}

function isRealCarTitle(value: string | null | undefined): boolean {
  if (!value) return false
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length < 4) return false
  if (TITLE_BLOCKLIST.has(normalized.toLowerCase())) return false
  if (TITLE_REJECT_PATTERNS.some((re) => re.test(normalized))) return false
  return /[A-Za-zА-Яа-я0-9]/.test(normalized)
}

function isPlausibleCity(value: string | null | undefined): boolean {
  if (!value) return false
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2 || cleaned.length > 50) return false
  if (/\d{5,}/.test(cleaned)) return false
  const lowered = cleaned.toLowerCase()
  if (CITY_BLOCKLIST.has(lowered)) return false
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
    if (type === 'font' || type === 'stylesheet') {
      request.abort()
      return
    }
    request.continue()
  })
}

/** Собирает ссылки на карточки объявлений со страницы каталога. */
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
        // ignore
      }
    }
    return [...out]
  }, GAZPROM_BASE_URL)
  return urls.filter((u) => isDetailUrl(u))
}

/** Добавляет параметр пагинации к URL. Пробуем PAGEN_1 (Bitrix) и page. */
function withPagination(baseUrl: string, pageNum: number): string {
  try {
    const u = new URL(baseUrl, GAZPROM_BASE_URL)
    u.searchParams.set('PAGEN_1', String(pageNum))
    return u.toString()
  } catch {
    return baseUrl
  }
}

/** Прокрутка для подгрузки ленивого контента на одной странице. */
async function scrollToLoadMorePass(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let i = 0; i < 8; i += 1) {
      window.scrollBy(0, 800)
      await new Promise((r) => setTimeout(r, 600))
    }
    const btns = Array.from(document.querySelectorAll('button, a[href], [role="button"]'))
    for (const btn of btns) {
      const text = (btn?.textContent || '').toLowerCase()
      if (text.includes('показать') || text.includes('еще') || text.includes('загрузить')) {
        ;(btn as HTMLElement)?.click()
        await new Promise((r) => setTimeout(r, 2000))
        break
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
  })
}

/** Из URL карточки достаём бренд и модель: .../volkswagen/tiguan/73154/ → ['volkswagen','tiguan'] */
function getBrandModelFromDetailUrl(detailUrl: string): { brand: string; model: string } | null {
  try {
    const path = new URL(detailUrl, GAZPROM_BASE_URL).pathname
    const parts = path.split('/').filter(Boolean)
    // .../avtomobili-i-tekhnika-s-probegom/{brand}/{model}/{id}
    if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1])) {
      const model = parts[parts.length - 2] ?? ''
      const brand = parts[parts.length - 3] ?? ''
      if (brand && model) return { brand, model }
    }
  } catch {
    // ignore
  }
  return null
}

/** Собираем читаемый заголовок. Приоритет: h1 → поиск по странице → fallback из URL (латиница). */
function extractTitle(html: string, detailUrl: string): string | null {
  const brandModel = getBrandModelFromDetailUrl(detailUrl)
  const brandCap = brandModel
    ? brandModel.brand.charAt(0).toUpperCase() + brandModel.brand.slice(1).toLowerCase()
    : null
  const modelCap = brandModel
    ? brandModel.model.charAt(0).toUpperCase() + brandModel.model.slice(1).toUpperCase()
    : null

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const h1Raw = h1Match?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? null
  const fromH1 = h1Raw
    ?.replace(/\s*с пробегом в лизинг.*$/i, '')
    .replace(/\s*в лизинг.*$/i, '')
    .trim() ?? null

  if (fromH1 && isRealCarTitle(fromH1)) return fromH1

  if (brandCap && modelCap) {
    const re = new RegExp(
      `(${brandCap.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+[A-Za-zА-Яа-я0-9\\s\\-\\.]{2,90})`,
      'i'
    )
    const bodySnippet = html.slice(0, 80000)
    let best: string | null = null
    let match: RegExpExecArray | null
    while ((match = re.exec(bodySnippet)) !== null) {
      const candidate = match[1].replace(/\s+/g, ' ').trim()
      if (candidate.length >= 10 && candidate.length <= 100 && isRealCarTitle(candidate)) {
        if (!best || candidate.length > (best?.length ?? 0)) best = candidate
      }
    }
    if (best) return best

    const ogTitle =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)[^>]+property=["']og:title["'][^>]*>/i)?.[1]
    if (ogTitle) {
      const cleaned = ogTitle
        .replace(/\s*[|\|]\s*.*$/i, '')
        .replace(/\s*с пробегом в лизинг.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (cleaned.length >= 10 && cleaned.length <= 120 && isRealCarTitle(cleaned)) {
        return cleaned
      }
    }

    const headBlock = html.slice(0, 25000)
    const cyrillicRe = /([А-Яа-яЁё][А-Яа-яЁё0-9\s\-\.\*\(\)]{14,100})/g
    let cyrillicBest: string | null = null
    let m: RegExpExecArray | null
    while ((m = cyrillicRe.exec(headBlock)) !== null) {
      const c = m[1].replace(/\s+/g, ' ').trim()
      if (c.length >= 15 && c.length <= 100 && isRealCarTitle(c) && !/^каталог|^акци|^главная/i.test(c)) {
        if (!cyrillicBest || c.length > cyrillicBest.length) cyrillicBest = c
      }
    }
    if (cyrillicBest) return cyrillicBest

    return `${brandCap} ${modelCap}`
  }

  return fromH1
}

// --- detail page: extract data from HTML ---

function extractDetailFromHtml(html: string, pageUrl: string): {
  title: string | null
  price: number | null
  originalPrice: number | null
  mileage: number | null
  year: number | null
  imageUrl: string | null
  city: string | null
  bodyColor: string | null
  engine: string | null
  drivetrain: string | null
  transmission: string | null
} {
  const plainText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const title = extractTitle(html, pageUrl)

  // Цена только из блока «карточки»: сразу после h1 до «Выберите условия» / «технические характеристики» / «Похожие».
  // Так не подхватываем цены из калькулятора, «Похожих предложений» и прочих блоков.
  const EXCLUDE_SNIPPET =
    /мес|месяц|аванс|платеж\s+от|ежемесячный\s+платеж|экономия\s+до|налоговая\s+экономия|экономия\s+по\s+налогу|ндс|на\s+прибыль|сумма\s+договора|полная\s+стоимость\s*—|общая\s+экономия/
  // Число и ₽ могут быть в соседних тегах: «2 340 000</span> ₽»
  const priceRegex = /(\d[\d\s\u00A0.]{2,})\s*(?:<\/[^>]+>[\s\S]{0,30})?(?:₽|&#8381;|руб\.?)/gi
  const MIN_PRICE = 500_000
  const MAX_PRICE = 100_000_000
  const MAX_ORIGINAL_TO_PRICE_RATIO = 1.5

  function collectPricesFromSegment(segment: string, skipExclude = false): number[] {
    const out: number[] = []
    let m: RegExpExecArray | null
    priceRegex.lastIndex = 0
    while ((m = priceRegex.exec(segment)) !== null) {
      const num = normalizeNumber(m[1])
      if (num == null || num < MIN_PRICE || num > MAX_PRICE) continue
      if (!skipExclude) {
        const snippet = segment.slice(Math.max(0, m.index - 120), m.index + (m[0].length + 80)).toLowerCase()
        if (EXCLUDE_SNIPPET.test(snippet)) continue
      }
      out.push(num)
    }
    return out
  }

  function collectPricesWithPosition(segment: string, skipExclude = false): { num: number; pos: number }[] {
    const out: { num: number; pos: number }[] = []
    let m: RegExpExecArray | null
    priceRegex.lastIndex = 0
    while ((m = priceRegex.exec(segment)) !== null) {
      const num = normalizeNumber(m[1])
      if (num == null || num < MIN_PRICE || num > MAX_PRICE) continue
      if (!skipExclude) {
        const snippet = segment.slice(Math.max(0, m.index - 120), m.index + (m[0].length + 80)).toLowerCase()
        if (EXCLUDE_SNIPPET.test(snippet)) continue
      }
      out.push({ num, pos: m.index })
    }
    return out
  }

  let price: number | null = null
  let originalPrice: number | null = null
  const h1Close = html.search(/<\/h1>/i)
  const MAIN_BLOCK_MIN_LEN = 2500

  if (h1Close !== -1) {
    const candidates = [
      h1Close + 3500,
      html.length,
      html.indexOf('Выберите условия', h1Close),
      html.indexOf('технические характеристики', h1Close),
      html.indexOf('Похожие предложения', h1Close),
    ].filter((p) => p >= 0)
    let mainBlockEnd = Math.min(...candidates)
    if (mainBlockEnd - h1Close < MAIN_BLOCK_MIN_LEN) mainBlockEnd = h1Close + MAIN_BLOCK_MIN_LEN
    const mainBlock = html.slice(h1Close, Math.min(mainBlockEnd, html.length))
    const costLabel = mainBlock.search(/Стоимость|стоимость/i)
    if (costLabel !== -1) {
      const afterCost = mainBlock.slice(costLabel, costLabel + 450)
      let byPos = collectPricesWithPosition(afterCost)
      if (byPos.length === 0) byPos = collectPricesWithPosition(afterCost, true)
      byPos.sort((a, b) => a.pos - b.pos)
      if (byPos.length > 0) {
        const first = byPos[0].num
        const second = byPos[1]?.num
        price = first
        if (second != null && second > first && second <= first * MAX_ORIGINAL_TO_PRICE_RATIO) originalPrice = second
        else if (second != null && second < first && first <= second * MAX_ORIGINAL_TO_PRICE_RATIO) {
          price = second
          originalPrice = first
        }
      }
    }
    if (price == null) {
      const headOfBlock = mainBlock.slice(0, 900)
      let withPos = collectPricesWithPosition(headOfBlock)
      if (withPos.length === 0) withPos = collectPricesWithPosition(headOfBlock, true)
      if (withPos.length > 0) {
        withPos.sort((a, b) => a.pos - b.pos)
        price = withPos[0].num
        if (withPos.length >= 2) {
          const second = withPos[1].num
          if (second > price && second <= price * MAX_ORIGINAL_TO_PRICE_RATIO) originalPrice = second
          else if (second < price && price <= second * MAX_ORIGINAL_TO_PRICE_RATIO) {
            originalPrice = price
            price = second
          }
        }
      }
    }
    if (price == null) {
      let withPos = collectPricesWithPosition(mainBlock)
      if (withPos.length === 0) withPos = collectPricesWithPosition(mainBlock, true)
      if (withPos.length > 0) {
        withPos.sort((a, b) => a.pos - b.pos)
        price = withPos[0].num
        if (withPos.length >= 2) {
          const second = withPos[1].num
          if (second > price && second <= price * MAX_ORIGINAL_TO_PRICE_RATIO) originalPrice = second
        }
      }
    }
  }

  if (price == null) {
    let plausiblePrices = collectPricesFromSegment(html.slice(0, 30000))
    if (plausiblePrices.length === 0) plausiblePrices = collectPricesFromSegment(html.slice(0, 30000), true)
    if (plausiblePrices.length > 0) {
      price = Math.min(...plausiblePrices)
      if (plausiblePrices.length >= 2) {
        const max = Math.max(...plausiblePrices)
        const min = Math.min(...plausiblePrices)
        if (max > min && max <= min * MAX_ORIGINAL_TO_PRICE_RATIO) originalPrice = max
      }
    }
  }
  if (price == null) {
    const withPos = collectPricesWithPosition(html)
    if (withPos.length > 0) {
      withPos.sort((a, b) => a.pos - b.pos)
      price = withPos[0].num
      if (withPos.length >= 2) {
        const second = withPos[1].num
        if (second > price && second <= price * MAX_ORIGINAL_TO_PRICE_RATIO) originalPrice = second
      }
    }
  }

  // Пробег (км) или наработка (м.ч.) для прицепов
  const mileageNotSpecified = /пробег\s+не\s+указан/i.test(plainText)
  const mileageText = mileageNotSpecified
    ? null
    : plainText.match(/(\d[\d\s\u00A0]{2,})\s*(?:км|km)/i)?.[1] ??
      html.match(/Пробег\s*<\/[^>]+>[\s\S]{0,80}?(\d[\d\s\u00A0]+)/i)?.[1] ??
      plainText.match(/(\d[\d\s\u00A0]+)\s*(?:м\.?\s*ч\.?|моточасов?)/i)?.[1] ??
      html.match(/Наработка\s*<\/[^>]+>[\s\S]{0,80}?(\d[\d\s\u00A0]+)/i)?.[1] ??
      null

  const yearText =
    plainText.match(/\b(20\d{2}|19\d{2})\s*г\.?/i)?.[1] ??
    html.match(/Год выпуска\s*<\/[^>]+>[\s\S]{0,40}?(\d{4})/i)?.[1] ??
    null

  // Город: только значение после «Город», без «Количество ключей» и т.п.
  const cityMatch =
    plainText.match(/Город\s*[\s:]*([А-Яа-яЁё\-\s]{2,40}?)(?:\s|$|\d|Количество|Наличие|Пробег)/i)?.[1]?.trim() ??
    html.match(/Город\s*<\/[^>]+>[\s\S]{0,60}?([А-Яа-яЁё\-\s]{2,40})</i)?.[1]?.trim() ??
    null
  let city = cityMatch?.replace(/\s+/g, ' ').trim() || null
  if (city && /ключ|комплект|обременен|птс|псм/i.test(city)) city = null
  if (city && !isPlausibleCity(city)) city = null

  // Кузов: тип кузова (Внедорожник, Седан и т.д.), не «Количество ключей»
  let bodyColor =
    plainText.match(/Кузов\s*[\s:]*([А-Яа-яЁёA-Za-z\s\-]{2,30}?)(?:\s|$|\d|Количество)/i)?.[1]?.trim() ?? null
  if (bodyColor && /ключ|комплект|количество/i.test(bodyColor)) bodyColor = null

  // Объем двигателя: только из блока «Объем двигателя», не из «Количество ключей»
  const engineMatch = plainText.match(/Объем\s+двигателя\s*[\s:]*([\d.,]+\s*(?:л\.?)?)/i)?.[1]?.trim()
  const engineVolume = engineMatch ? (engineMatch.includes('л') ? engineMatch : `${engineMatch} л`).trim() : null

  // Тип топлива: Бензин, Дизель, Электро, Гибрид, Газ — из «Тип топлива», «Топливо», «Двигатель»
  const fuelMatch =
    plainText.match(/Тип\s+топлива\s*[\s:]*([А-Яа-яЁёA-Za-z\s\-]{3,30}?)(?:\s|$|\d|Кузов|Объем)/i)?.[1]?.trim() ??
    plainText.match(/Топливо\s*[\s:]*([А-Яа-яЁёA-Za-z\s\-]{3,30}?)(?:\s|$|\d|Кузов|Объем)/i)?.[1]?.trim() ??
    plainText.match(/Двигатель\s*[\s:]*([А-Яа-яЁёA-Za-z0-9\s\-,.]{3,50}?)(?:\s|$|Кузов|Объем)/i)?.[1]?.trim() ??
    null
  const fuelNormalized = fuelMatch
    ? (() => {
        const f = fuelMatch.toLowerCase()
        if (/бензин|tsi|tfsi|fsi|mpi/i.test(f)) return 'Бензин'
        if (/дизел|tdi|cdi|dci|tdci|d4d|multijet/i.test(f)) return 'Дизель'
        if (/электро|электромобил|ev|phev|recharge/i.test(f)) return 'Электро'
        if (/гибрид|hybrid|plug.in|phev/i.test(f)) return 'Гибрид'
        if (/газ|метан|пропан|lpg|cng/i.test(f)) return 'Газ'
        return fuelMatch.replace(/\s+/g, ' ').trim()
      })()
    : null

  const engine =
    [engineVolume, fuelNormalized].filter(Boolean).length > 0
      ? [engineVolume, fuelNormalized].filter(Boolean).join(', ')
      : null

  // Колёсная/Колесная формула (для грузовиков 4x2, 6x4 и т.д.) или привод (передний/задний/полный)
  const drivetrainMatch =
    plainText.match(/Кол[её]сная\s+формула\s*[\s:]*([A-Za-zА-Яа-я0-9xXхХ\s\-]{2,30}?)(?:\s|$|\d|Кузов|Коробка)/i)?.[1]?.trim() ??
    plainText.match(/Привод\s*[\s:]*([A-Za-zА-Яа-я0-9xX\s\-]{2,30}?)(?:\s|$|\d|Кузов|Коробка)/i)?.[1]?.trim() ??
    null
  const drivetrain = drivetrainMatch?.replace(/\s+/g, ' ').trim() || null

  // Коробка передач / КПП
  const transmissionMatch =
    plainText.match(/Коробка\s+передач\s*[\s:]*([А-Яа-яЁёA-Za-z0-9\s\-]{2,40}?)(?:\s|$|\d|Кузов|Привод|Объем)/i)?.[1]?.trim() ??
    plainText.match(/КПП\s*[\s:]*([А-Яа-яЁёA-Za-z0-9\s\-]{2,40}?)(?:\s|$|\d|Кузов|Привод|Объем)/i)?.[1]?.trim() ??
    null
  const transmission = transmissionMatch?.replace(/\s+/g, ' ').trim() || null

  const ogImage =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i)?.[1] ??
    null
  const imgSrc =
    html.match(/<img[^>]+data-src=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1] ??
    null
  const imageUrl = pickBestImageCandidate([ogImage, imgSrc].map((v) => v?.replace(/&amp;/g, '&')))

  return {
    title,
    price,
    originalPrice: originalPrice ?? null,
    mileage: normalizeNumber(mileageText),
    year: parseYear(yearText ?? undefined),
    imageUrl,
    city: city ?? null,
    bodyColor: bodyColor || null,
    engine: engine || null,
    drivetrain: drivetrain || null,
    transmission: transmission || null,
  }
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

async function extractImageFromLiveDom(page: Page): Promise<string | null> {
  const url = await page.evaluate(EXTRACT_IMAGE_SCRIPT)
  return typeof url === 'string' && url ? pickBestImageCandidate([url]) : null
}

/** Цена из DOM: первый блок после h1 с числом и ₽ (только основной контент до «Выберите условия»). */
const EXTRACT_PRICE_SCRIPT = `
(function() {
  var h1 = document.querySelector('h1');
  if (!h1) return null;
  var root = h1.closest('main') || h1.closest('article') || document.body;
  var full = (root.innerText || root.textContent || '').slice(0, 8000);
  var stop = full.indexOf('Выберите условия');
  if (stop > 0) full = full.slice(0, stop);
  var re = /(\\d[\\d\\s\\u00A0.]{2,})\\s*₽/g;
  var match;
  var prices = [];
  while ((match = re.exec(full)) !== null) {
    var numStr = match[1].replace(/[^\\d]/g, '');
    if (numStr.length < 4) continue;
    var num = parseInt(numStr, 10);
    if (num < 500000 || num > 100000000) continue;
    prices.push({ num: num, pos: match.index });
  }
  if (prices.length === 0) return null;
  prices.sort(function(a,b){ return a.pos - b.pos; });
  var first = prices[0].num;
  var second = prices[1] ? prices[1].num : null;
  var orig = (second !== null && second > first && second <= first * 1.5) ? second : null;
  return { price: first, originalPrice: orig };
})();
`

async function extractPriceFromLiveDom(page: Page): Promise<{ price: number; originalPrice: number | null } | null> {
  const result = await page.evaluate(EXTRACT_PRICE_SCRIPT)
  if (result && typeof result.price === 'number' && result.price >= 100_000) {
    return {
      price: result.price,
      originalPrice:
        result.originalPrice != null && result.originalPrice > result.price && result.originalPrice <= result.price * 1.5
          ? result.originalPrice
          : null,
    }
  }
  return null
}

// --- enrich one detail page and build ScrapedListing ---

const FALLBACK_IMAGE = 'https://dummyimage.com/1200x800/1f2937/e5e7eb&text=Vehicle+Photo+Pending'

async function enrichAndCollectListing(
  page: Page,
  detailUrl: string,
  category: string
): Promise<ScrapedListing | null> {
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
    await sleep(process.env.CI ? 2500 : 4500)

    const html = await page.content()
    const data = extractDetailFromHtml(html, detailUrl)

    const domPrice = await extractPriceFromLiveDom(page)
    if (domPrice) {
      data.price = domPrice.price
      data.originalPrice = domPrice.originalPrice
    }

    const title = data.title && isRealCarTitle(data.title) ? data.title : null
    if (!title) {
      console.warn(`  skip (no title): ${detailUrl}`)
      return null
    }

    const wheelFormulaFromTitle = title.match(/\d+[xхX]\d+/)?.[0] ?? null
    const drivetrain = data.drivetrain?.trim() || wheelFormulaFromTitle || null

    const MIN_VEHICLE_PRICE = 100_000
    if (!data.price || data.price < MIN_VEHICLE_PRICE) {
      console.warn(`  skip (no/implausible price): ${title.slice(0, 40)}...`)
      return null
    }

    let absoluteImage: string | null = null
    const fromDom = await extractImageFromLiveDom(page)
    if (fromDom) {
      absoluteImage = toAbsoluteUrl(fromDom)
    } else if (data.imageUrl) {
      absoluteImage = toAbsoluteUrl(data.imageUrl)
    }
    if (!absoluteImage) absoluteImage = FALLBACK_IMAGE

    const listing: ScrapedListing = {
      external_id: buildExternalId(detailUrl),
      title: sanitizeTitle(title),
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
    }

    return listing
  } catch (err) {
    if (isShutdownError(err)) throw err
    console.warn(`  enrich failed for ${detailUrl}:`, err)
    return null
  }
}

// --- main scrape loop ---

async function scrapeListings(): Promise<ScrapedListing[]> {
  const isCI = !!process.env.CI
  const browser = await puppeteer.launch({
    headless: isCI,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      ...(isCI ? ['--disable-dev-shm-usage', '--disable-gpu'] : []),
    ],
  })

  const page = await browser.newPage()
  await configurePageForStealth(page)
  page.setDefaultNavigationTimeout(90_000)
  page.setDefaultTimeout(45_000)

  const collected = new Map<string, ScrapedListing>()

  try {
    for (const section of GAZPROM_SECTIONS) {
      if (shutdownRequested) break
      console.log(`\n=== Section: ${section.category} (${section.catalogUrl}) ===`)

      const maxPerSectionRaw = Number(process.env.GAZPROMP_MAX_PER_SECTION ?? '0')
      const maxPerSection =
        Number.isFinite(maxPerSectionRaw) && maxPerSectionRaw > 0 ? maxPerSectionRaw : 0
      const targetCount = maxPerSection > 0 ? maxPerSection : 200

      const allUrls = new Set<string>()
      const itemsPerPage = 12
      const maxPages = Math.ceil(targetCount / itemsPerPage) + 2

      for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
        const url = pageNum === 1 ? section.catalogUrl : withPagination(section.catalogUrl, pageNum)
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded' })
        } catch (navErr) {
          if (isShutdownError(navErr)) break
          if (pageNum > 1) break
          throw navErr
        }
        await sleep(process.env.CI ? 3000 : 5000)
        await scrollToLoadMorePass(page)
        await randomDelay(500, 1000)

        const pageUrls = await extractDetailUrlsFromPage(page)
        const before = allUrls.size
        for (const u of pageUrls) allUrls.add(u)
        const added = allUrls.size - before

        if (added === 0 && pageNum > 1) break
        if (allUrls.size >= targetCount) break
      }

      const detailUrls = [...allUrls]
      const urlsToProcess = maxPerSection > 0 ? detailUrls.slice(0, maxPerSection) : detailUrls
      if (maxPerSection > 0) {
        console.log(`Found ${detailUrls.length} detail links, processing first ${urlsToProcess.length} (max_per_section=${maxPerSection})`)
      } else {
        console.log(`Found ${detailUrls.length} detail links on catalog page`)
      }

      for (const url of urlsToProcess) {
        if (shutdownRequested) break
        if (collected.has(buildExternalId(url))) continue

        const listing = await enrichAndCollectListing(page, url, section.category)
        if (listing) {
          collected.set(listing.external_id, listing)
          console.log(
            `+ [${section.category}] ${listing.title} | ${listing.price ?? '?'} ₽ | ${listing.year ?? '?'} г. | ${listing.city ?? '—'}`
          )
        }
        await randomDelay(400, 900)
      }
      await randomDelay(800, 1800)
    }

    console.log(`\nScraped ${collected.size} unique listings from Gazprom.`)
    return [...collected.values()]
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
    const listings = await scrapeListings()

    if (listings.length === 0) {
      console.log('No listings to upsert.')
      return
    }

    const upsertPayload = listings.map((listing) => {
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
      return row
    })

    const BATCH_SIZE = 500
    for (let i = 0; i < upsertPayload.length; i += BATCH_SIZE) {
      const batch = upsertPayload.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('listings').upsert(batch, { onConflict: 'external_id' })
      if (error) throw error
    }

    console.log(`Upserted ${listings.length} Gazprom listings.`)

    const scrapedIds = new Set(listings.map((l) => l.external_id))

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
