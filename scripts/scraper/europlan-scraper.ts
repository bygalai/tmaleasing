/**
 * Europlan Leasing scraper — грузовая техника с https://europlan.ru/auto/stock/truck
 * Пишет в ту же таблицу listings (source='europlan', category='gruzovye').
 * В Mini App объявления смешиваются с другими источниками, источник не отображается.
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

const SOURCE = 'europlan'
const CATEGORY = 'gruzovye'
const EUROPLAN_BASE_URL = 'https://europlan.ru'
const TRUCK_CATALOG_URL = 'https://europlan.ru/auto/stock/truck'
const ALLOWED_DOMAIN = 'europlan.ru'

/** Path prefix for truck catalog (list pages). */
const TRUCK_DETAIL_PATH_PREFIX = '/auto/stock/truck/'
/** Only these are real listing pages; e.g. /auto/stock/truck/details/139397. Brand pages like /truck/kamaz are skipped. */
const TRUCK_DETAILS_LISTING_PREFIX = '/auto/stock/truck/details/'

const BAD_IMAGE_SUBSTRINGS = [
  'logo',
  'favicon',
  'sprite',
  'icon',
  'apple-touch-icon',
  'webim',
  'button',
  'banner',
  'europlan.ru/local/',
  '/img/menu/',
  'hamb.svg',
  '/icons/',
  'telegram',
]

const TITLE_BLOCKLIST = new Set([
  'грузовые автомобили',
  'каталог',
  'автомобили',
  'техника',
  'европлан',
  'europlan',
  'лизинг',
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

// --- env & supabase (same pattern as vtb-scraper) ---

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
    if (lowered.includes('/upload/') || lowered.includes('/images/') || lowered.includes('/photo/')) points += 3
    if (lowered.includes('/img/')) points -= 1
    return points
  }
  urls.sort((a, b) => score(b) - score(a))
  return urls[0]
}

function toAbsoluteUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const absolute = new URL(value, EUROPLAN_BASE_URL)
    if (!absolute.hostname.includes(ALLOWED_DOMAIN)) return null
    return absolute.toString()
  } catch {
    return null
  }
}

function isEuroplanUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value, EUROPLAN_BASE_URL)
    return parsed.hostname.includes(ALLOWED_DOMAIN)
  } catch {
    return false
  }
}

/** True only for real listing detail pages: /auto/stock/truck/details/<id>. Brand/filter pages like /truck/kamaz are false. */
function isTruckDetailUrl(url: string): boolean {
  if (!isEuroplanUrl(url)) return false
  try {
    const path = new URL(url, EUROPLAN_BASE_URL).pathname
    if (!path.startsWith(TRUCK_DETAILS_LISTING_PREFIX)) return false
    const after = path.slice(TRUCK_DETAILS_LISTING_PREFIX.length).trim()
    return after.length > 0 && !after.includes('?') && /^\d+$/.test(after)
  } catch {
    return false
  }
}

function buildExternalId(listingUrl: string): string {
  return createHash('sha256').update(listingUrl).digest('hex')
}

function sanitizeTitle(value: string | null | undefined): string {
  const fallback = 'Грузовая техника'
  if (!value) return fallback
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : fallback
}

function isRealCarTitle(value: string | null | undefined): boolean {
  if (!value) return false
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length < 4) return false
  if (TITLE_BLOCKLIST.has(normalized.toLowerCase())) return false
  const lowered = normalized.toLowerCase()
  if (lowered.includes('европлан') && lowered.length < 30) return false
  return /[A-Za-zА-Яа-я0-9]/.test(normalized)
}

function isOrgLikeTitle(value: string | null | undefined): boolean {
  if (!value) return false
  const lowered = value.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!lowered) return false
  if (lowered.includes('европлан') && lowered.length < 40) return true
  if (lowered.includes('лизинг') && lowered.includes('компани')) return true
  return false
}

function isPlausibleCity(value: string | null | undefined): boolean {
  if (!value) return false
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2 || cleaned.length > 40) return false
  if (/\d/.test(cleaned)) return false
  const lowered = cleaned.toLowerCase()
  if (CITY_BLOCKLIST.has(lowered)) return false
  if (!/^[А-Яа-яЁё -]+$/.test(cleaned)) return false
  return true
}

// --- JSON-LD & HTML detail extraction (same logic as VTB, schema.org–friendly) ---

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

    const maybeName = toTextValue(obj.name) ?? toTextValue(obj.title)
    if (maybeName && isRealCarTitle(maybeName)) titles.push(maybeName)

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

    const vinRaw =
      toTextValue(obj.vehicleIdentificationNumber) ??
      toTextValue(obj.vin) ??
      toTextValue(obj.VIN)
    if (vinRaw) vins.push(vinRaw)

    const engineRaw =
      toTextValue(obj.vehicleEngine) ??
      toTextValue((obj.vehicleEngine as Record<string, unknown> | undefined)?.name) ??
      toTextValue(obj.engine)
    if (engineRaw) engines.push(engineRaw)

    const transmissionRaw =
      toTextValue(obj.vehicleTransmission) ??
      toTextValue(obj.transmission) ??
      toTextValue(obj.gearbox)
    if (transmissionRaw) transmissions.push(transmissionRaw)

    const drivetrainRaw =
      toTextValue(obj.driveWheelConfiguration) ??
      toTextValue(obj.drivetrain) ??
      toTextValue(obj.drive)
    if (drivetrainRaw) drivetrains.push(drivetrainRaw)

    const colorRaw = toTextValue(obj.color) ?? toTextValue(obj.bodyColor) ?? toTextValue(obj.vehicleColor)
    if (colorRaw) bodyColors.push(colorRaw)

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

    for (const value of Object.values(obj)) walk(value)
  }

  for (const payload of payloads) walk(payload)

  const pickBest = (values: number[], min: number): number | null => {
    const filtered = values.filter((v) => Number.isFinite(v) && v >= min)
    return filtered.length > 0 ? Math.max(...filtered) : null
  }
  const pickFirstText = (values: string[]): string | null => {
    for (const v of values) {
      const cleaned = v.replace(/\s+/g, ' ').trim()
      if (cleaned) return cleaned
    }
    return null
  }

  const bestTitle = (() => {
    const filtered = titles.filter((t) => isRealCarTitle(t) && !isOrgLikeTitle(t))
    if (filtered.length === 0) return titles.find((t) => isRealCarTitle(t)) ?? null
    filtered.sort((a, b) => b.length - a.length)
    return filtered[0]
  })()

  return {
    title: bestTitle,
    price: pickBest(prices, 10_000),
    mileage: pickBest(mileages, 1),
    year: pickBest(years, 1900),
    imageUrl: pickBestImageCandidate(images) ?? null,
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

  const title =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? null

  const priceMatches = [...html.matchAll(/(\d[\d\s\u00A0]{3,})\s*(?:₽|&#8381;|руб|р\.?)/gi)]
    .map((m) => normalizeNumber(m[1]))
    .filter((v): v is number => v != null)
    .filter((v) => v >= 10_000)
  const price = priceMatches.length > 0 ? Math.max(...priceMatches) : null

  const mileageText =
    plainText.match(/(\d[\d\s\u00A0]{2,})\s*(?:км|km)/i)?.[1] ??
    html.match(/"mileageFromOdometer"[\s\S]{0,120}"value"\s*:\s*"?(\\d{2,})"?/i)?.[1] ??
    null
  const yearText =
    plainText.match(/\b(20\d{2})\b/i)?.[1] ??
    html.match(/"vehicleModelDate"\s*:\s*"?(\\d{4})"?/i)?.[1] ??
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

  const vin =
    plainText.match(/\bVIN\b[\s:]*([A-HJ-NPR-Z0-9]{17})/i)?.[1] ??
    html.match(/"vehicleIdentificationNumber"\s*:\s*"([^"]{11,25})"/i)?.[1] ??
    null

  const cleanupValue = (value: string | null, maxWords: number): string | null => {
    if (!value) return null
    let out = value.replace(/\s+/g, ' ').trim()
    if (!out) return null
    const stopWords = [
      'код предложения',
      'адрес стоянки',
      'платеж',
      'аванс',
      'срок лизинга',
      'сумма договора',
      'цвет',
    ]
    const lowered = out.toLowerCase()
    let cutIndex = out.length
    for (const stop of stopWords) {
      const idx = lowered.indexOf(stop)
      if (idx >= 0) cutIndex = Math.min(cutIndex, idx)
    }
    out = out.slice(0, cutIndex).trim()
    out = out.replace(/[|•·].*$/g, '').trim()
    const words = out.split(' ').filter(Boolean)
    if (words.length > maxWords) out = words.slice(0, maxWords).join(' ')
    return out || null
  }

  const bodyColor =
    plainText.match(/Цвет\s*кузова\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9 -]{3,40})/i)?.[1]?.trim() ??
    plainText.match(/Цвет\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9 -]{3,40})/i)?.[1]?.trim() ??
    null
  const transmission =
    plainText.match(/Трансмиссия\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9 -]{2,60})/i)?.[1]?.trim() ??
    null
  const drivetrain =
    plainText.match(/Тип\s*привода\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9xX -]{2,60})/i)?.[1]?.trim() ??
    null
  const engine =
    plainText.match(/Двигатель\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9.,/ -]{2,80})/i)?.[1]?.trim() ?? null

  // На сайте Европлана город указан в блоке «Характеристики» как «Местонахождение: Ростов-на-Дону»
  const city =
    plainText.match(/Местонахождение\s*[:-]\s*([А-Яа-яЁё0-9\-\s]{2,50})/i)?.[1]?.trim() ??
    plainText.match(/\b20\d{2}\s*г\.?\s*\/\s*[\d\s\u00A0]{2,}\s*(?:км|km)\s*\/\s*([А-Яа-яЁё -]{2,40})/i)?.[1]?.trim() ??
    plainText.match(/\b[\d\s\u00A0]{2,}\s*(?:км|km)\s*\/\s*([А-Яа-яЁё -]{2,40})/i)?.[1]?.trim() ??
    titleTag?.match(/в\s*г\.?\s*([А-Яа-яЁё -]{2,40})/i)?.[1]?.trim() ??
    null

  return {
    title,
    price,
    mileage: normalizeNumber(mileageText),
    year: parseYear(yearText),
    imageUrl,
    city: cleanupValue(city, 3),
    vin,
    engine: cleanupValue(engine, 6),
    transmission: cleanupValue(transmission, 4),
    drivetrain: cleanupValue(drivetrain, 4),
    bodyColor: cleanupValue(bodyColor, 2),
  }
}

// --- page: collect detail URLs from catalog ---

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

/** Extract only real listing detail URLs (/truck/details/<id>) from the catalog. Skips brand pages like /truck/kamaz. */
async function extractDetailUrlsFromPage(page: Page): Promise<string[]> {
  const detailsPrefix = TRUCK_DETAILS_LISTING_PREFIX
  const urls = await page.evaluate(
    (ctx: { detailsPrefix: string; baseUrl: string }) => {
      const out = new Set<string>()
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/auto/stock/truck/details/"]'))
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
        const after = path.slice(ctx.detailsPrefix.length).trim()
        if (!after || after.includes('?') || !/^\d+$/.test(after)) continue
        out.add(absolute)
      }
      return [...out]
    },
    { detailsPrefix, baseUrl: EUROPLAN_BASE_URL }
  )

  return urls.filter((u) => isTruckDetailUrl(u))
}

/** Optional: try to get next page URL (e.g. ?page=2). */
async function extractNextPageUrl(page: Page, currentUrl: string): Promise<string | null> {
  const nextUrl = await page.evaluate((ctx: { current: string }) => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    const base = new URL(ctx.current, window.location.origin)
    const currentPage = Number(base.searchParams.get('page') || '1') || 1
    for (const a of links) {
      const href = a.getAttribute('href')
      if (!href) continue
      try {
        const full = new URL(href, window.location.origin)
        if (full.pathname !== base.pathname) continue
        const pageNum = Number(full.searchParams.get('page') || '1') || 1
        if (pageNum === currentPage + 1) return full.toString()
      } catch {
        // ignore
      }
    }
    return null
  }, { current: currentUrl })
  return nextUrl
}

async function scrollToLoadMore(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i += 1) {
      window.scrollBy(0, 600)
      await new Promise((r) => setTimeout(r, 800))
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
  })
}

// --- extract from live DOM (SPA: контент подгружается через JS) ---
// Код передаём строкой, чтобы в браузер не попадали __name и др. от tsx/esbuild.

const EXTRACT_DOM_SCRIPT = `
(function() {
  var badImgParts = ['logo', 'favicon', 'icon', 'sprite', 'webim', 'button', 'banner'];
  function isBadImg(src) {
    if (!src) return true;
    var s = src.toLowerCase();
    return badImgParts.some(function(p) { return s.indexOf(p) >= 0; });
  }
  var title = null;
  var selectors = ['h1', '[class*="title"]', '[class*="name"]', '[class*="heading"]', 'h2', '.card-title', '.vehicle-title', '.listing-title'];
  for (var i = 0; i < selectors.length; i++) {
    var el = document.querySelector(selectors[i]);
    var text = el ? (el.textContent || '').trim().replace(/\\s+/g, ' ') : '';
    if (text && text.length > 5 && text.length < 200 && /[0-9A-Za-zА-Яа-я]/.test(text)) {
      var t = text.toLowerCase();
      if (!/^каталог$/i.test(t) && !/^грузовые\\s/i.test(t) && !/\\sевроплан\\s*$/i.test(t)) {
        title = text;
        break;
      }
    }
  }
  if (!title && document.title) {
    title = document.title.replace(/\\s*\\|\\s*Европлан.*$/i, '').replace(/\\s*\\|\\s*Europlan.*$/i, '').replace(/\\s*-\\s*лизинг.*$/i, '').trim();
  }
  var bodyText = (document.body && document.body.innerText) || '';
  var priceMatch = bodyText.match(/(\\\\d[\\\\d\\\\s\\\\u00A0]{3,})\\\\s*₽/) || bodyText.match(/(\\\\d[\\\\d\\\\s\\\\u00A0]{5,})\\\\s*(?:руб|р\\\\.?)/i);
  var priceStr = priceMatch && priceMatch[1] ? priceMatch[1].replace(/\\\\s/g, '') : null;
  var price = priceStr ? parseInt(priceStr, 10) : null;
  if (price !== null && isNaN(price)) price = null;
  var mileageMatch = bodyText.match(/(\\\\d[\\\\d\\\\s\\\\u00A0]{2,})\\\\s*(?:км|km)/i);
  var mileageStr = mileageMatch && mileageMatch[1] ? mileageMatch[1].replace(/\\\\s/g, '') : null;
  var mileage = mileageStr ? parseInt(mileageStr, 10) : null;
  if (mileage !== null && isNaN(mileage)) mileage = null;
  var yearMatch = bodyText.match(/\\\\b(20\\\\d{2}|19\\\\d{2})\\\\b/);
  var year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  if (year !== null && isNaN(year)) year = null;
  var cityMatch = bodyText.match(/Местонахождение\\\\s*[:-]\\\\s*([А-Яа-яЁё0-9\\\\-\\\\s]{2,50})/i);
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
    return /\\\\.(jpe?g|png|webp)(\\\\?|#|$)/i.test(lower) || lower.indexOf('/upload') >= 0 || lower.indexOf('/image') >= 0 || lower.indexOf('/photo') >= 0 || lower.indexOf('/media') >= 0;
  }
  var imageUrl = null;
  var imgs = document.querySelectorAll('img');
  var candidates = [];
  // Кандидаты из <img>
  for (var j = 0; j < imgs.length; j++) {
    var img = imgs[j];
    var u = getImgUrl(img);
    if (!u) continue;
    var rect = img.getBoundingClientRect();
    var isBig = rect.width >= 200 && rect.height >= 150;
    var isPhoto = looksLikePhoto(u);
    candidates.push({ url: u, isBig: isBig, isPhoto: isPhoto });
  }
  // Кандидаты из <picture><source srcset=\"...\">
  var sources = document.querySelectorAll('picture source[srcset]');
  for (var si = 0; si < sources.length; si++) {
    var srcset = (sources[si].getAttribute('srcset') || '').trim();
    if (!srcset) continue;
    var firstSrc = srcset.split(',')[0];
    if (!firstSrc) continue;
    var su = firstSrc.trim().split(/\\\\s+/)[0] || firstSrc.trim();
    if (!su || isBadImg(su)) continue;
    var isPhoto2 = looksLikePhoto(su);
    candidates.push({ url: su, isBig: true, isPhoto: isPhoto2 });
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

// --- enrich each detail page and build ScrapedListing ---

async function enrichAndCollectListing(
  page: Page,
  detailUrl: string
): Promise<ScrapedListing | null> {
  try {
    // ID объявления из URL (например 509423 из .../details/509423) — берём только картинки этого объявления.
    const listingId = detailUrl.match(/\/details\/(\d+)(?:\?|$)/)?.[1] ?? null

    const imageApiUrls: string[] = []
    const onResponse = (response: unknown): void => {
      try {
        const url =
          typeof response === 'object' &&
          response !== null &&
          'url' in response &&
          typeof (response as { url: () => string }).url === 'function'
            ? (response as { url: () => string }).url()
            : ''
        if (!url || !url.includes('/auto/api/image/auto')) return
        // Только картинки текущего объявления: в API параметр i = id объявления.
        if (listingId) {
          try {
            const parsed = new URL(url)
            if (parsed.searchParams.get('i') !== listingId) return
          } catch {
            return
          }
        }
        imageApiUrls.push(url)
      } catch {
        // Игнорируем сбои при парсинге единичных ответов.
      }
    }

    page.on('response', onResponse as never)

    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
    // SPA + картинки: даём время на отрисовку и загрузку фото (теперь image не блокируем)
    await sleep(process.env.CI ? 3000 : 5000)
    const html = await page.content()

    const jsonLd = extractJsonLdBlocks(html)
    const fromLd = extractDetailFromJsonLd(jsonLd)
    const fromHtml = extractDetailFromHtmlFallback(html)
    const fromDom = await extractDetailFromLiveDom(page)

    // Пытаемся выбрать лучший URL фото из API картинок (если они вызывались).
    const fromApiImage = imageApiUrls.length > 0 ? pickBestImageCandidate(imageApiUrls) : null

    const title = fromLd.title ?? fromHtml.title ?? fromDom.title ?? null
    const price = fromLd.price ?? fromHtml.price ?? fromDom.price ?? null
    const mileage = fromLd.mileage ?? fromHtml.mileage ?? fromDom.mileage ?? null
    const year = fromLd.year ?? fromHtml.year ?? fromDom.year ?? null
    const imageUrl = fromLd.imageUrl ?? fromHtml.imageUrl ?? fromDom.imageUrl ?? fromApiImage ?? null
    const city = fromHtml.city ?? fromDom.city ?? null
    const vin = fromLd.vin ?? fromHtml.vin
    const engine = fromLd.engine ?? fromHtml.engine
    const transmission = fromLd.transmission ?? fromHtml.transmission
    const drivetrain = fromLd.drivetrain ?? fromHtml.drivetrain
    const bodyColor = fromLd.bodyColor ?? fromHtml.bodyColor

    if (!title || !isRealCarTitle(title)) {
      console.warn(`  skip (no title): ${detailUrl}`)
      return null
    }
    if (!price || price < 10_000) {
      console.warn(`  skip (no price): ${title.slice(0, 40)}...`)
      return null
    }

    // Собираем все кандидатные URL (HTML/DOM/API) и пропускаем через единый фильтр,
    // чтобы SVG-иконки (hamb.svg и пр.) и пустые значения не проходили.
    const chosenImage = pickBestImageCandidate([imageUrl, fromDom.imageUrl, fromApiImage])
    const FALLBACK_IMAGE = 'https://dummyimage.com/1200x800/1f2937/e5e7eb&text=Vehicle+Photo+Pending'
    let absoluteImage = toAbsoluteUrl(chosenImage)
    if (!absoluteImage || absoluteImage === FALLBACK_IMAGE) {
      console.warn(`  skip (no real image): ${title.slice(0, 40)}...`)
      return null
    }

    // После того как всё извлекли, можно отписаться от слушателя ответов.
    page.off('response', onResponse as never)

    // Нормализация: убрать «Объем » в начале описания двигателя и лишнюю «В»/«B» после цвета
    const engineNormalized = (engine ?? '').replace(/^Объем\s*/gi, '').trim() || null
    const bodyColorNormalized = (bodyColor ?? '').replace(/\s+[ВB]\s*$/gi, '').trim() || null

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
      vin: vin || null,
      engine: engineNormalized,
      transmission: transmission || null,
      drivetrain: drivetrain || null,
      body_color: bodyColorNormalized,
    }

    return listing
  } catch (err) {
    if (isShutdownError(err)) throw err
    console.warn(`  enrich failed for ${detailUrl}:`, err)
    return null
  }
}

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
  const maxPages = Math.min(
    Number(process.env.EUROPLAN_MAX_PAGES) || 3,
    10
  )

  try {
    let pageIndex = 0

    while (pageIndex < maxPages) {
      if (shutdownRequested) break
      pageIndex += 1
      const currentUrl =
        pageIndex === 1 ? TRUCK_CATALOG_URL : `${TRUCK_CATALOG_URL}?page=${pageIndex}`
      console.log(`\n--- Page ${pageIndex}/${maxPages}: ${currentUrl} ---`)

      try {
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' })
      } catch (navErr) {
        if (isShutdownError(navErr)) break
        throw navErr
      }

      await sleep(process.env.CI ? 2000 : 4000)
      await scrollToLoadMore(page)
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
            `+ ${listing.title} | ${listing.price ?? '?'} ₽ | ${listing.year ?? '?'} г. | ${listing.images[0] ? 'img' : 'no img'}`
          )
        }
        await randomDelay(400, 900)
      }
      await randomDelay(800, 1800)
    }

    console.log(`\nScraped ${collected.size} unique listings from Europlan (trucks).`)
    return [...collected.values()]
  } finally {
    await page.close()
    await browser.close()
  }
}

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

    console.log(`Upserted ${listings.length} Europlan truck listings. They appear in "Грузовые" mixed with other sources.`)

    const { data: deleted, error: cleanupErr } = await supabase
      .from('listings')
      .delete()
      .eq('source', SOURCE)
      .is('price', null)
      .select('id')

    if (!cleanupErr && deleted?.length) {
      console.log(`Cleaned up ${deleted.length} unenriched skeleton rows (source=europlan).`)
    }
  } catch (error) {
    console.error('Europlan scraper failed:', error)
    process.exitCode = 1
  }
}

void run()
