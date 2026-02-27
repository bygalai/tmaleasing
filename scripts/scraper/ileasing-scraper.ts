/**
 * Интерлизинг (ileasing.ru) scraper — спецтехника.
 * Каталог: https://www.ileasing.ru/bu_tehnika/spetstekhnika/
 * Пишет в listings (source='ileasing', category='speztechnika').
 * В Mini App объявления отображаются в разделе «Спецтехника» вместе с VTB и др.
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

const SOURCE = 'ileasing'
const ILEASING_BASE_URL = 'https://www.ileasing.ru'
const ALLOWED_DOMAIN = 'ileasing.ru'

const CATALOG_URL = 'https://www.ileasing.ru/bu_tehnika/spetstekhnika/'
const CATEGORY = 'speztechnika'
const DETAILS_PREFIX = '/bu_tehnika/spetstekhnika/'

const BAD_IMAGE_SUBSTRINGS = [
  'logo',
  'favicon',
  'sprite',
  'icon',
  'apple-touch-icon',
  'webim',
  'button',
  'banner',
  '/img/menu/',
  'hamb.svg',
  '/icons/',
  'telegram',
]

const TITLE_BLOCKLIST = new Set([
  'спецтехника',
  'каталог',
  'техника',
  'интерлизинг',
  'ileasing',
  'лизинг',
  'лизинг техники',
  'о компании',
  'контакты',
])

const CITY_BLOCKLIST = new Set([
  'оборудование',
  'недвижимость',
  'подвижной состав',
])

type ScrapedListing = {
  external_id: string
  title: string
  price: number | null
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
  const digits = input.replace(/[^\d]/g, '')
  if (!digits) return null
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? parsed : null
}

function parseYear(input: string | null | undefined): number | null {
  if (!input) return null
  const yearMatch = input.match(/\b(19\d{2}|20\d{2}|21\d{2})\b/)
  if (!yearMatch) return null
  const year = Number(yearMatch[1])
  if (!Number.isFinite(year)) return null
  if (year < 1900 || year > 2100) return null
  return year
}

function toTextValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, ' ').trim()
    return normalized.length > 0 ? normalized : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
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
    if (lowered.includes('/upload/') || lowered.includes('/iblock/')) points += 4
    if (lowered.includes('/images/') || lowered.includes('/photo/')) points += 3
    if (lowered.includes('/img/')) points -= 1
    return points
  }
  urls.sort((a, b) => score(b) - score(a))
  return urls[0]
}

function toAbsoluteUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const absolute = new URL(value, ILEASING_BASE_URL)
    if (!absolute.hostname.includes(ALLOWED_DOMAIN.replace('www.', ''))) return null
    return absolute.toString()
  } catch {
    return null
  }
}

function isIleasingUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value, ILEASING_BASE_URL)
    return parsed.hostname.includes('ileasing.ru')
  } catch {
    return false
  }
}

/** Detail URL: /bu_tehnika/spetstekhnika/<slug>/ where slug is alphanumeric-dash. */
function isDetailUrl(url: string): boolean {
  if (!isIleasingUrl(url)) return false
  try {
    const path = new URL(url, ILEASING_BASE_URL).pathname
    if (!path.startsWith(DETAILS_PREFIX)) return false
    const after = path.slice(DETAILS_PREFIX.length).replace(/\/$/, '').trim()
    return after.length > 0 && !after.includes('/') && /^[a-z0-9\-]+$/i.test(after)
  } catch {
    return false
  }
}

function buildExternalId(listingUrl: string): string {
  return createHash('sha256').update(listingUrl).digest('hex')
}

function sanitizeTitle(value: string | null | undefined): string {
  const fallback = 'Спецтехника'
  if (!value) return fallback
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : fallback
}

function isRealTitle(value: string | null | undefined): boolean {
  if (!value) return false
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length < 4) return false
  if (TITLE_BLOCKLIST.has(normalized.toLowerCase())) return false
  const lowered = normalized.toLowerCase()
  if (lowered.includes('интерлизинг') && lowered.length < 30) return false
  return /[A-Za-zА-Яа-я0-9]/.test(normalized)
}

function isPlausibleCity(value: string | null | undefined): boolean {
  if (!value) return false
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2 || cleaned.length > 40) return false
  if (/\d/.test(cleaned)) return false
  const lowered = cleaned.toLowerCase()
  if (CITY_BLOCKLIST.has(lowered)) return false
  if (!/^[А-Яа-яЁё \-]+$/.test(cleaned)) return false
  return true
}

// --- JSON-LD & HTML extraction ---

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const raw = match[1]?.trim()
    if (!raw) continue
    try {
      blocks.push(JSON.parse(raw))
    } catch {
      // ignore
    }
  }
  return blocks
}

function extractDetailFromJsonLd(payloads: unknown[]): {
  title: string | null
  price: number | null
  mileage: number | null
  year: number | null
  imageUrl: string | null
  city: string | null
  vin: string | null
  engine: string | null
  transmission: string | null
  drivetrain: string | null
  bodyColor: string | null
} {
  const seen = new Set<object>()
  const prices: number[] = []
  const mileages: number[] = []
  const years: number[] = []
  const titles: string[] = []
  const images: string[] = []
  const vins: string[] = []
  const engines: string[] = []
  const transmissions: string[] = []
  const drivetrains: string[] = []
  const bodyColors: string[] = []
  const cities: string[] = []

  const pickBestPrice = (values: number[], minVal: number, maxVal: number): number | null => {
    const filtered = values.filter((v) => Number.isFinite(v) && v >= minVal && v <= maxVal)
    // Для Интерлизинга берём максимальную цену: на странице может быть помесячный платёж (меньше),
    // а нам нужна полная стоимость техники (7 170 000 руб и т.п.).
    return filtered.length > 0 ? Math.max(...filtered) : null
  }
  const pickFirstText = (values: string[]): string | null => {
    for (const v of values) {
      const cleaned = v.replace(/\s+/g, ' ').trim()
      if (cleaned) return cleaned
    }
    return null
  }

  const walk = (node: unknown): void => {
    if (!node) return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (typeof node !== 'object') return
    if (seen.has(node as object)) return
    seen.add(node as object)
    const obj = node as Record<string, unknown>

    const maybeName =
      toTextValue(obj.name) ??
      toTextValue(obj.title) ??
      toTextValue(obj.model) ??
      toTextValue(obj.vehicleModel)
    if (maybeName && isRealTitle(maybeName)) titles.push(maybeName)

    const imageField = obj.image
    if (typeof imageField === 'string') images.push(imageField)
    if (Array.isArray(imageField)) {
      for (const item of imageField) {
        if (typeof item === 'string') images.push(item)
        if (item && typeof item === 'object') {
          const maybeUrl = toTextValue((item as Record<string, unknown>).url)
          if (maybeUrl) images.push(maybeUrl)
        }
      }
    }
    const maybeThumb = toTextValue(obj.thumbnailUrl)
    if (maybeThumb) images.push(maybeThumb)

    const priceRaw = obj.price ?? (obj.offers as Record<string, unknown> | undefined)?.price
    const priceNum = normalizeNumber(toTextValue(priceRaw))
    if (priceNum != null) prices.push(priceNum)

    const mileageRaw =
      (obj.mileageFromOdometer as Record<string, unknown> | undefined)?.value ??
      obj.mileageFromOdometer ??
      obj.mileage
    const mileageNum = normalizeNumber(toTextValue(mileageRaw))
    if (mileageNum != null) mileages.push(mileageNum)

    const yearRaw = obj.vehicleModelDate ?? obj.productionDate ?? obj.dateVehicleFirstRegistered ?? obj.year
    const yearNum = parseYear(toTextValue(yearRaw))
    if (yearNum != null) years.push(yearNum)

    const addressRaw = obj.address ?? (obj.offers as Record<string, unknown> | undefined)?.address
    const addr = addressRaw && typeof addressRaw === 'object' ? addressRaw : null
    const cityVal = toTextValue((addr as Record<string, unknown>)?.addressLocality ?? obj.addressLocality ?? obj.city)
    if (cityVal) cities.push(cityVal)

    for (const value of Object.values(obj)) walk(value)
  }

  for (const payload of payloads) walk(payload)

  const bestTitle = titles[0] ?? null
  const pickBest = (values: number[], min: number): number | null => {
    const filtered = values.filter((v) => Number.isFinite(v) && v >= min)
    return filtered.length > 0 ? Math.max(...filtered) : null
  }

  return {
    title: bestTitle,
    price: pickBestPrice(prices, 100_000, 500_000_000),
    mileage: pickBest(mileages, 1),
    year: pickBest(years, 1990),
    imageUrl: pickBestImageCandidate(images) ?? null,
    city: pickFirstText(cities),
    vin: pickFirstText(vins),
    engine: pickFirstText(engines),
    transmission: pickFirstText(transmissions),
    drivetrain: pickFirstText(drivetrains),
    bodyColor: pickFirstText(bodyColors),
  }
}

function extractDetailFromHtmlFallback(html: string): {
  title: string | null
  price: number | null
  mileage: number | null
  year: number | null
  imageUrl: string | null
  city: string | null
  vin: string | null
  engine: string | null
  transmission: string | null
  drivetrain: string | null
  bodyColor: string | null
} {
  const titleTag =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? null

  const plainText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const h1Raw =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? null
  const modelMatch = plainText.match(/Модель\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9\-\s]{2,80})/i)
  const model = modelMatch?.[1]?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? null
  const title =
    h1Raw && !TITLE_BLOCKLIST.has(h1Raw.toLowerCase()) ? h1Raw : model ?? h1Raw

  const priceMatches = [...html.matchAll(/(\d[\d\s\u00A0]{3,})\s*(?:₽|&#8381;|руб|р\.?)/gi)]
    .map((m) => normalizeNumber(m[1]))
    .filter((v): v is number => v != null)
    .filter((v) => v >= 100_000 && v <= 500_000_000)
  // Берём максимальную цену, чтобы выбрать полную стоимость, а не помесячный платёж.
  const price = priceMatches.length > 0 ? Math.max(...priceMatches) : null

  const mileageText =
    plainText.match(/Пробег[\s,]*км\s*[:-]*\s*(\d[\d\s\u00A0]*)/i)?.[1] ??
    plainText.match(/(\d[\d\s\u00A0]{2,})\s*(?:км|km)/i)?.[1] ??
    null
  const yearText =
    plainText.match(/Год\s*выпуска\s*[:-]*\s*(\d{4})/i)?.[1] ??
    plainText.match(/\b(20\d{2})\b/i)?.[1] ??
    null

  const decodeHtmlAttr = (value: string): string => value.replace(/&amp;/g, '&').trim()
  const ogImage =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
    null
  const imgSrc =
    html.match(/<img[^>]+data-src=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1] ??
    null
  const srcsetCandidate = html.match(/<img[^>]+srcset=["']([^"']+)["'][^>]*>/i)?.[1] ?? null
  const firstSrcsetUrl = srcsetCandidate ? srcsetCandidate.split(',')[0]?.trim().split(' ')[0]?.trim() : null
  const imageUrl = pickBestImageCandidate(
    [ogImage, firstSrcsetUrl, imgSrc].map((v) => (typeof v === 'string' ? decodeHtmlAttr(v) : v))
  )

  const city =
    plainText.match(/Город\s*[:-]\s*([А-Яа-яЁё0-9\-\s]{2,50})/i)?.[1]?.trim() ??
    plainText.match(/Местонахождение\s*[:-]\s*([А-Яа-яЁё0-9\-\s]{2,50})/i)?.[1]?.trim() ??
    titleTag?.match(/в\s*г\.?\s*([А-Яа-яЁё \-]{2,40})/i)?.[1]?.trim() ??
    null

  const cleanupValue = (value: string | null, maxWords: number): string | null => {
    if (!value) return null
    let out = value.replace(/\s+/g, ' ').trim()
    if (!out) return null
    const words = out.split(' ').filter(Boolean)
    if (words.length > maxWords) out = words.slice(0, maxWords).join(' ')
    return out || null
  }

  return {
    title,
    price,
    mileage: normalizeNumber(mileageText),
    year: parseYear(yearText),
    imageUrl,
    city: cleanupValue(city, 3),
    vin: null,
    engine: null,
    transmission: null,
    drivetrain: null,
    bodyColor: null,
  }
}

// --- page & catalog ---

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

/** Extract detail URLs from catalog (slug-style: /bu_tehnika/spetstekhnika/avtokran-klintsy-ks-55713-5k-3/). */
async function extractDetailUrlsFromPage(page: Page): Promise<string[]> {
  const urls = await page.evaluate(
    (ctx: { detailsPrefix: string; baseUrl: string }) => {
      const out = new Set<string>()
      const selector = `a[href*="${ctx.detailsPrefix}"]`
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>(selector))
      for (const a of anchors) {
        const href = a.getAttribute('href')
        if (!href) continue
        let absolute: string
        try {
          absolute = new URL(href, ctx.baseUrl).toString()
        } catch {
          continue
        }
        const path = new URL(absolute).pathname
        if (!path.startsWith(ctx.detailsPrefix)) continue
        const after = path.slice(ctx.detailsPrefix.length).replace(/\/$/, '').trim()
        if (!after || after.includes('/') || after.includes('?')) continue
        if (!/^[a-z0-9\-]+$/i.test(after)) continue
        out.add(absolute)
      }
      return [...out]
    },
    { detailsPrefix: DETAILS_PREFIX, baseUrl: ILEASING_BASE_URL }
  )

  return urls.filter(isDetailUrl)
}

// --- extract from live DOM ---

const EXTRACT_DOM_SCRIPT = `
(function() {
  var badImgParts = ['logo', 'favicon', 'icon', 'sprite', 'webim', 'button', 'banner'];
  function isBadImg(src) {
    if (!src) return true;
    var s = src.toLowerCase();
    return badImgParts.some(function(p) { return s.indexOf(p) >= 0; });
  }
  var bodyText = (document.body && document.body.innerText) || '';
  var title = null;
  var modelMatch = bodyText.match(/Модель\\\\s*[:-]\\\\s*([A-Za-zА-Яа-яЁё0-9\\\\-\\\\s]{2,80})/i);
  var model = modelMatch && modelMatch[1] ? modelMatch[1].trim().replace(/\\\\s+/g, ' ').slice(0, 80) : null;
  var selectors = ['h1', '[class*="title"]', '[class*="name"]', '[class*="heading"]', 'h2', '.card-title', '.vehicle-title'];
  for (var i = 0; i < selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
    var text = el ? (el.textContent || '').trim().replace(/\\\\s+/g, ' ') : '';
    if (text && text.length > 5 && text.length < 200 && /[0-9A-Za-zА-Яа-я]/.test(text)) {
      var t = text.toLowerCase();
      if (!/^каталог$/i.test(t) && !/^спецтехника\\\\s*$/i.test(t) && !/^лизинг\\\\s+техники$/i.test(t) && !/интерлизинг\\\\s*$/i.test(t)) {
        title = text;
        break;
      }
    }
  }
  if (!title && model) title = model;
  if (!title && document.title) {
    title = document.title.replace(/\\\\s*\\\\|\\\\s*Интерлизинг.*$/i, '').replace(/\\\\s*\\\\|\\\\s*ileasing.*$/i, '').replace(/\\\\s*-\\\\s*лизинг.*$/i, '').trim();
  }
  var priceRe = /(\\\\d[\\\\d\\\\s\\\\u00A0]{3,})\\\\s*(?:₽|руб|р\\\\.?)/gi;
  var priceMatches = [];
  var m;
  while ((m = priceRe.exec(bodyText)) !== null) {
    var num = parseInt((m[1] || '').replace(/\\\\s/g, ''), 10);
    if (!isNaN(num) && num >= 100000 && num <= 500000000) priceMatches.push(num);
  }
  // Для Интерлизинга: максимальное значение = полная стоимость.
  var price = priceMatches.length > 0 ? Math.max.apply(null, priceMatches) : null;
  var mileageMatch = bodyText.match(/Пробег[\\\\s,]*(?:км)?[\\\\s:]*([\\\\d\\\\s\\\\u00A0]+)/i) || bodyText.match(/([\\\\d\\\\s\\\\u00A0]{2,})\\\\s*(?:км|km)/i);
  var mileageStr = mileageMatch && mileageMatch[1] ? mileageMatch[1].replace(/\\\\s/g, '') : null;
  var mileage = mileageStr ? parseInt(mileageStr, 10) : null;
  if (mileage !== null && isNaN(mileage)) mileage = null;
  var yearMatch = bodyText.match(/Год[\\\\s]*выпуска[\\\\s:]*([\\\\d]{4})/i) || bodyText.match(/\\\\b(20\\\\d{2}|19\\\\d{2})\\\\b/);
  var year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  if (year !== null && isNaN(year)) year = null;
  var cityMatch = bodyText.match(/Город\\\\s*[:-]\\\\s*([А-Яа-яЁё0-9\\\\-\\\\s]{2,50})/i) || bodyText.match(/Местонахождение\\\\s*[:-]\\\\s*([А-Яа-яЁё0-9\\\\-\\\\s]{2,50})/i);
  var city = cityMatch && cityMatch[1] ? cityMatch[1].trim() : null;
  function getImgUrl(img) {
    var u = (img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || img.getAttribute('src') || '').trim();
    if (!u || u.indexOf('data:') === 0) return null;
    var srcset = (img.getAttribute('srcset') || '').trim();
    if (!u && srcset) {
      var first = srcset.split(',')[0];
      if (first) u = first.trim().split(/\\\\s+/)[0] || first.trim();
    }
    if (!u || isBadImg(u)) return null;
    return u;
  }
  function looksLikePhoto(url) {
    if (!url) return false;
    var lower = url.toLowerCase();
    return /\\.(jpe?g|png|webp)(\\\\?|#|$)/i.test(lower) || lower.indexOf('/upload') >= 0 || lower.indexOf('/iblock') >= 0 || lower.indexOf('/image') >= 0;
  }
  var imageUrl = null;
  var imgs = document.querySelectorAll('img');
  var candidates = [];
  for (var j = 0; j < imgs.length; j++) {
    var img = imgs[j];
    var u = getImgUrl(img);
    if (!u) continue;
    var rect = img.getBoundingClientRect();
    var isBig = rect.width >= 200 && rect.height >= 150;
    var isPhoto = looksLikePhoto(u);
    candidates.push({ url: u, isBig: isBig, isPhoto: isPhoto });
  }
  var sources = document.querySelectorAll('picture source[srcset]');
  for (var si = 0; si < sources.length; si++) {
    var srcset = (sources[si].getAttribute('srcset') || '').trim();
    if (!srcset) continue;
    var firstSrc = srcset.split(',')[0];
    if (!firstSrc) continue;
    var su = firstSrc.trim().split(/\\\\s+/)[0] || firstSrc.trim();
    if (!su || isBadImg(su)) continue;
    candidates.push({ url: su, isBig: true, isPhoto: looksLikePhoto(su) });
  }
  if (candidates.length > 0) {
    candidates.sort(function(a, b) {
      if (a.isBig !== b.isBig) return a.isBig ? -1 : 1;
      if (a.isPhoto !== b.isPhoto) return a.isPhoto ? -1 : 1;
      return 0;
    });
    imageUrl = candidates[0].url;
  }
  return { title: title, price: price, mileage: mileage, year: year, imageUrl: imageUrl, city: city };
})();
`

async function extractDetailFromLiveDom(page: Page): Promise<{
  title: string | null
  price: number | null
  mileage: number | null
  year: number | null
  imageUrl: string | null
  city: string | null
}> {
  const raw = await page.evaluate(EXTRACT_DOM_SCRIPT)

  return {
    title: raw?.title ?? null,
    price: raw?.price != null && Number.isFinite(raw.price) ? raw.price : null,
    mileage: raw?.mileage != null && Number.isFinite(raw.mileage) ? raw.mileage : null,
    year: raw?.year != null && raw.year >= 1990 && raw.year <= 2030 ? raw.year : null,
    imageUrl: raw?.imageUrl ?? null,
    city: typeof raw?.city === 'string' && raw.city.trim() ? raw.city.trim() : null,
  }
}

// --- enrich detail page ---

async function enrichAndCollectListing(page: Page, detailUrl: string): Promise<ScrapedListing | null> {
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
    await sleep(process.env.CI ? 3000 : 5000)
    const html = await page.content()

    const jsonLd = extractJsonLdBlocks(html)
    const fromLd = extractDetailFromJsonLd(jsonLd)
    const fromHtml = extractDetailFromHtmlFallback(html)
    const fromDom = await extractDetailFromLiveDom(page)

    // Для Интерлизинга HTML/DOM обычно точнее JSON-LD (особенно по городу).
    const title = fromHtml.title ?? fromDom.title ?? fromLd.title ?? null
    const price = fromHtml.price ?? fromDom.price ?? fromLd.price ?? null
    const mileage = fromHtml.mileage ?? fromDom.mileage ?? fromLd.mileage ?? null
    const year = fromHtml.year ?? fromDom.year ?? fromLd.year ?? null
    const imageUrl = fromHtml.imageUrl ?? fromDom.imageUrl ?? fromLd.imageUrl ?? null
    const city = fromHtml.city ?? fromDom.city ?? fromLd.city ?? null

    if (!title || !isRealTitle(title)) {
      console.warn(`  skip (no title): ${detailUrl}`)
      return null
    }
    const MIN_VEHICLE_PRICE = 100_000
    if (!price || price < MIN_VEHICLE_PRICE) {
      console.warn(`  skip (no/implausible price): ${title.slice(0, 40)}...`)
      return null
    }

    const chosenImage = pickBestImageCandidate([imageUrl, fromDom.imageUrl])
    const FALLBACK_IMAGE = 'https://dummyimage.com/1200x800/1f2937/e5e7eb&text=Vehicle+Photo+Pending'
    const absoluteImage = chosenImage ? toAbsoluteUrl(chosenImage) : null
    if (!absoluteImage || absoluteImage === FALLBACK_IMAGE) {
      console.warn(`  skip (no real image): ${title.slice(0, 40)}...`)
      return null
    }

    const listing: ScrapedListing = {
      external_id: buildExternalId(detailUrl),
      title: sanitizeTitle(title),
      price,
      mileage,
      year,
      images: [absoluteImage],
      listing_url: detailUrl,
      source: SOURCE,
      category: CATEGORY,
      city: city && isPlausibleCity(city) ? city : null,
      vin: null,
      engine: null,
      transmission: null,
      drivetrain: null,
      body_color: null,
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
  const maxPages = Math.min(Number(process.env.ILEASING_MAX_PAGES) || 3, 10)

  try {
    for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
      if (shutdownRequested) break
      const currentUrl = pageIndex === 1 ? CATALOG_URL : `${CATALOG_URL}?page=${pageIndex}`
      console.log(`\n--- Page ${pageIndex}/${maxPages}: ${currentUrl} ---`)

      try {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' })
      } catch (navErr) {
        if (isShutdownError(navErr)) break
        throw navErr
      }

      await sleep(process.env.CI ? 2000 : 4000)
      await randomDelay(500, 1200)

      const detailUrls = await extractDetailUrlsFromPage(page)
      console.log(`Found ${detailUrls.length} detail links on page`)

      for (const url of detailUrls) {
        if (shutdownRequested) break
        if (collected.has(buildExternalId(url))) continue

        const listing = await enrichAndCollectListing(page, url)
        if (listing) {
          collected.set(listing.external_id, listing)
          console.log(
            `+ [${CATEGORY}] ${listing.title} | ${listing.price ?? '?'} ₽ | ${listing.year ?? '?'} г. | ${listing.city ?? '-'}`
          )
        }
        await randomDelay(400, 900)
      }
      await randomDelay(800, 1800)
    }

    console.log(`\nScraped ${collected.size} unique listings from Interleasing.`)
    return [...collected.values()]
  } finally {
    await page.close()
    await browser.close()
  }
}

// --- run & upsert ---

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

    console.log(`Upserted ${listings.length} Interleasing listings (speztechnika).`)

    const scrapedIds = new Set(listings.map((l) => l.external_id))

    const { data: skeletonDeleted, error: skeletonErr } = await supabase
      .from('listings')
      .delete()
      .eq('source', SOURCE)
      .is('price', null)
      .select('id')

    if (!skeletonErr && skeletonDeleted?.length) {
      console.log(`Cleaned up ${skeletonDeleted.length} unenriched skeleton rows (source=ileasing).`)
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
      console.log(`Removed ${toRemove.length} listings no longer on Interleasing (sync cleanup).`)
    }
  } catch (error) {
    console.error('Interleasing scraper failed:', error)
    process.exitCode = 1
  }
}

void run()
