/**
 * Альфа-Лизинг парсер — легковые, грузовые, спецтехника и прицепы с пробегом с alfaleasing.ru.
 * Секции: legkovye, gruzovye, speztechnika, pricepy. Пишет в listings (source='alfaleasing').
 * Каталоги: /rasprodazha-avto-s-probegom/legkovye/, gruzovye/, spectech/, pricepy/
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import dotenv from 'dotenv'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
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

const SOURCE = 'alfaleasing'
const ALFALEASING_BASE_URL = 'https://alfaleasing.ru'
const ALLOWED_DOMAIN = 'alfaleasing.ru'

/** Паттерны URL карточек: .../uuid/ */
const DETAIL_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const DETAIL_PREFIXES = [
  '/rasprodazha-avto-s-probegom/legkovye/',
  '/rasprodazha-avto-s-probegom/gruzovye/',
  '/rasprodazha-avto-s-probegom/spectech/',
  '/rasprodazha-avto-s-probegom/pricepy/',
] as const

const ALFALEASING_SECTIONS: Array<{ catalogUrl: string; category: string; detailPrefix: string }> = [
  { catalogUrl: 'https://alfaleasing.ru/rasprodazha-avto-s-probegom/legkovye/', category: 'legkovye', detailPrefix: '/rasprodazha-avto-s-probegom/legkovye/' },
  { catalogUrl: 'https://alfaleasing.ru/rasprodazha-avto-s-probegom/gruzovye/', category: 'gruzovye', detailPrefix: '/rasprodazha-avto-s-probegom/gruzovye/' },
  { catalogUrl: 'https://alfaleasing.ru/rasprodazha-avto-s-probegom/spectech/', category: 'speztechnika', detailPrefix: '/rasprodazha-avto-s-probegom/spectech/' },
  { catalogUrl: 'https://alfaleasing.ru/rasprodazha-avto-s-probegom/pricepy/', category: 'pricepy', detailPrefix: '/rasprodazha-avto-s-probegom/pricepy/' },
]

const BAD_IMAGE_SUBSTRINGS = [
  'logo',
  'favicon',
  'sprite',
  'icon',
  'apple-touch-icon',
  'button',
  'banner',
  'telegram',
  'vk.',
  'youtube',
  'placeholder',
  '1x1',
  'no-image',
  'default.',
  'empty',
  'local/templates',
]

const TITLE_BLOCKLIST = new Set([
  'легковые автомобили',
  'грузовые автомобили',
  'прицепы',
  'полуприцепы',
  'прицепы и полуприцепы',
  'каталог',
  'автомобили',
  'техника',
  'спецтехника',
  'альфа-лизинг',
  'alfaleasing',
  'лизинг',
  'о компании',
])

const CITY_BLOCKLIST = new Set(['оборудование', 'недвижимость', 'подвижной состав'])

type ScrapedListing = {
  external_id: string
  title: string
  price: number | null
  /** Старая цена до скидки — для отображения зачёркнутой и бейджа «Скидка X%». */
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

function imageCandidateScore(url: string): number {
  const lowered = url.toLowerCase()
  let points = 0
  if (/\.(jpe?g|png|webp)(\?|#|$)/i.test(lowered)) points += 5
  if (
    lowered.includes('/upload/') ||
    lowered.includes('/images/') ||
    lowered.includes('/media/') ||
    lowered.includes('/photo/')
  ) {
    points += 3
  }
  if (lowered.includes('/img/')) points -= 1
  return points
}

/** Отсекаем иконки и мелкие превью по параметрам в URL. */
function isLikelyAlfaleasingLotPhotoUrl(absoluteUrl: string): boolean {
  if (isBadImageCandidate(absoluteUrl)) return false
  const lower = absoluteUrl.toLowerCase()
  const wMatch = lower.match(/[?&]w=(\d+)/)
  if (wMatch && Number(wMatch[1]) > 0 && Number(wMatch[1]) <= 64) return false
  const hMatch = lower.match(/[?&]h=(\d+)/)
  if (hMatch && Number(hMatch[1]) > 0 && Number(hMatch[1]) <= 64) return false
  return imageCandidateScore(absoluteUrl) >= 3
}

const MAX_IMAGES_PER_LISTING = 60

function normalizeImageDedupeKey(absoluteUrl: string): string {
  try {
    const u = new URL(absoluteUrl)
    u.hash = ''
    return `${u.hostname.toLowerCase()}${u.pathname.toLowerCase()}`
  } catch {
    return absoluteUrl.toLowerCase()
  }
}

/**
 * Собирает все уникальные фото лота: порядок тиров — JSON-LD → DOM-галерея → карточка каталога → HTML.
 * В каждом тире сохраняется порядок появления (как на сайте).
 */
function mergeUniqueListingImages(tiers: ReadonlyArray<ReadonlyArray<string>>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tier of tiers) {
    for (const raw of tier) {
      if (typeof raw !== 'string') continue
      const abs = toAbsoluteUrl(raw.trim())
      if (!abs || !isAlfaleasingUrl(abs)) continue
      if (!isLikelyAlfaleasingLotPhotoUrl(abs)) continue
      const key = normalizeImageDedupeKey(abs)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(abs)
      if (out.length >= MAX_IMAGES_PER_LISTING) return out
    }
  }
  return out
}

function pickBestImageCandidate(candidates: Array<string | null | undefined>): string | null {
  const urls = candidates
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
    .filter((v) => !isBadImageCandidate(v))
  if (urls.length === 0) return null
  urls.sort((a, b) => imageCandidateScore(b) - imageCandidateScore(a))
  return urls[0]
}

function toAbsoluteUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const absolute = new URL(value, ALFALEASING_BASE_URL)
    if (!absolute.hostname.includes(ALLOWED_DOMAIN)) return null
    return absolute.toString()
  } catch {
    return null
  }
}

function isAlfaleasingUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value, ALFALEASING_BASE_URL)
    return parsed.hostname.includes(ALLOWED_DOMAIN)
  } catch {
    return false
  }
}

function isDetailUrl(url: string, detailPrefix?: string): boolean {
  if (!isAlfaleasingUrl(url)) return false
  try {
    const path = new URL(url, ALFALEASING_BASE_URL).pathname
    const prefix = detailPrefix ?? DETAIL_PREFIXES.find((p) => path.startsWith(p))
    if (!prefix) return false
    return path.startsWith(prefix) && DETAIL_UUID_RE.test(path)
  } catch {
    return false
  }
}

function buildExternalId(listingUrl: string): string {
  return createHash('sha256').update(listingUrl).digest('hex')
}

function sanitizeTitle(value: string | null | undefined): string {
  const fallback = 'Техника'
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
  if (lowered.includes('альфа') && lowered.length < 30) return false
  return /[A-Za-zА-Яа-я0-9]/.test(normalized)
}

function isPlausibleCity(value: string | null | undefined): boolean {
  if (!value) return false
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2 || cleaned.length > 40) return false
  if (/\d/.test(cleaned)) return false
  const lowered = cleaned.toLowerCase()
  if (CITY_BLOCKLIST.has(lowered)) return false
  if (!/^[А-Яа-яЁё0-9\-\s]+$/.test(cleaned)) return false
  return true
}

// --- JSON-LD & HTML detail extraction ---

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
  originalPrice: number | null
  mileage: number | null
  year: number | null
  imageUrls: string[]
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
  const pickBestPrice = (values: number[], minVal: number, maxVal: number): number | null => {
    const filtered = values.filter((v) => Number.isFinite(v) && v >= minVal && v <= maxVal)
    return filtered.length > 0 ? Math.min(...filtered) : null
  }
  const pickFirstText = (values: string[]): string | null => {
    for (const v of values) {
      const cleaned = v.replace(/\s+/g, ' ').trim()
      if (cleaned) return cleaned
    }
    return null
  }

  const bestTitle = (() => {
    const filtered = titles.filter((t) => isRealCarTitle(t))
    if (filtered.length === 0) return null
    filtered.sort((a, b) => b.length - a.length)
    return filtered[0]
  })()

  const MIN_VEHICLE_PRICE = 100_000
  const MAX_VEHICLE_PRICE = 100_000_000
  const MAX_ORIGINAL_TO_PRICE_RATIO = 1.5

  const validPrices = prices.filter((v) => Number.isFinite(v) && v >= MIN_VEHICLE_PRICE && v <= MAX_VEHICLE_PRICE)
  let price: number | null = validPrices.length > 0 ? Math.min(...validPrices) : null
  let originalPrice: number | null = null
  if (validPrices.length >= 2) {
    const minP = Math.min(...validPrices)
    const maxP = Math.max(...validPrices)
    if (maxP > minP && maxP <= minP * MAX_ORIGINAL_TO_PRICE_RATIO) {
      price = minP
      originalPrice = maxP
    } else if (price == null) {
      price = minP
    }
  }

  return {
    title: bestTitle,
    price,
    originalPrice,
    mileage: pickBest(mileages, 1),
    year: pickBest(years, 1900),
    imageUrls: images,
    vin: pickFirstText(vins),
    engine: pickFirstText(engines),
    transmission: pickFirstText(transmissions),
    drivetrain: pickFirstText(drivetrains),
    bodyColor: pickFirstText(bodyColors),
  }
}

function extractDetailFromHtmlFallback(html: string, category: string): {
  title: string | null
  price: number | null
  originalPrice: number | null
  mileage: number | null
  year: number | null
  imageUrls: string[]
  city: string | null
  vin: string | null
  engine: string | null
  transmission: string | null
  drivetrain: string | null
  bodyColor: string | null
  bodyType: string | null
} {
  const plainText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const title =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? null

  const EXCLUDE_SNIPPET =
    /мес|месяц|аванс|платеж\s+от|ежемесячный\s+платеж|экономия\s+до|налоговая\s+экономия|сумма\s+договора|полная\s+стоимость\s*—/
  const priceRegex = /(\d[\d\s\u00A0.]{2,})\s*(?:<\/[^>]+>[\s\S]{0,30})?(?:₽|&#8381;|руб|р\.?)/gi
  const MIN_PRICE = 500_000
  const MAX_PRICE = 100_000_000
  const MAX_ORIGINAL_TO_PRICE_RATIO = 1.5

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

  function collectPricesFromSegment(segment: string, skipExclude = false): number[] {
    return collectPricesWithPosition(segment, skipExclude).map((p) => p.num)
  }

  let price: number | null = null
  let originalPrice: number | null = null
  const h1Close = html.search(/<\/h1>/i)
  const MAIN_BLOCK_MIN_LEN = 2500

  if (h1Close !== -1) {
    const candidates = [
      h1Close + 5000,
      html.length,
      html.indexOf('технические характеристики', h1Close),
      html.indexOf('описание', h1Close),
      html.indexOf('Характеристики', h1Close),
    ].filter((p) => p >= 0)
    const mainBlockEnd = Math.min(...candidates)
    const mainBlock = html.slice(h1Close, Math.max(mainBlockEnd, h1Close + MAIN_BLOCK_MIN_LEN))

    const costLabel = mainBlock.search(/Стоимость|стоимость|Цена|цена/i)
    if (costLabel !== -1) {
      const afterCost = mainBlock.slice(costLabel, costLabel + 500)
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
      const headOfBlock = mainBlock.slice(0, 1000)
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
    const segment = html.slice(0, 35000)
    let plausiblePrices = collectPricesFromSegment(segment)
    if (plausiblePrices.length === 0) plausiblePrices = collectPricesFromSegment(segment, true)
    if (plausiblePrices.length > 0) {
      price = Math.min(...plausiblePrices)
      if (plausiblePrices.length >= 2) {
        const minP = Math.min(...plausiblePrices)
        const maxP = Math.max(...plausiblePrices)
        if (maxP > minP && maxP <= minP * MAX_ORIGINAL_TO_PRICE_RATIO) {
          price = minP
          originalPrice = maxP
        }
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

  const mileageText =
    plainText.match(/(\d[\d\s\u00A0]{2,})\s*(?:км|km|м\.ч\.?)/i)?.[1] ??
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
  const imgSrcs = [...html.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1])
  const srcsetMatches = [...html.matchAll(/<img[^>]+srcset=["']([^"']+)["'][^>]*>/gi)]
  const srcsetUrls = srcsetMatches.flatMap((m) =>
    (m[1] ?? '').split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean)
  )
  const htmlImageUrls = [ogImage, ...imgSrcs, ...srcsetUrls].filter(Boolean).map(decodeHtmlAttr)

  const vin =
    plainText.match(/\bVIN\b[\s:]*([A-HJ-NPR-Z0-9]{17})/i)?.[1] ??
    html.match(/"vehicleIdentificationNumber"\s*:\s*"([^"]{11,25})"/i)?.[1] ??
    null

  const cleanupValue = (value: string | null, maxWords: number): string | null => {
    if (!value) return null
    let out = value.replace(/\s+/g, ' ').trim()
    if (!out) return null
    const stopWords = ['код предложения', 'адрес стоянки', 'платеж', 'аванс', 'срок лизинга', 'сумма договора', 'цвет']
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

  const bodyTypeRaw =
    plainText.match(/Подвид\s+техники\s*([A-Za-zА-Яа-яЁё0-9\s\-/()]+?)(?=\s*Тип\s+движителя|$)/i)?.[1]?.trim() ??
    plainText.match(/назначением\s+(?:самоходной\s+)?машины\s*\([^)]*\)\s*([А-Яа-яЁё][А-Яа-яЁё\s\-/()]+?)(?=\s+Марка|\s+Категория|$)/i)?.[1]?.trim() ??
    null
  const BODY_TYPE_NO_DATA = /^(нет\s+данных|не\s+указан[оа]?|—|-|н\/д|нет)$/i
  const bodyType = bodyTypeRaw && !BODY_TYPE_NO_DATA.test(bodyTypeRaw) ? bodyTypeRaw : null
  const transmission =
    plainText.match(/Коробка\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9 -]{2,60})/i)?.[1]?.trim() ??
    plainText.match(/Трансмиссия\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9 -]{2,60})/i)?.[1]?.trim() ??
    null
  const wheelFormula =
    plainText.match(/Кол[её]сная\s+формула\s*[:-]?\s*([0-9]+[xхX][0-9]+)/i)?.[1]?.trim() ??
    null
  const drivetrainText =
    plainText.match(/Привод\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9xX -]{2,60})/i)?.[1]?.trim() ??
    plainText.match(/Тип\s*привода\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9xX -]{2,60})/i)?.[1]?.trim() ??
    null
  const drivetrain =
    category === 'legkovye'
      ? drivetrainText
      : wheelFormula ?? drivetrainText
  const engine =
    plainText.match(/Двигатель\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9.,/ л\-]{2,120})/i)?.[1]?.trim() ??
    plainText.match(/(Бензиновый|Дизельный|Электрический|Гибридный)[^КоробкаПриводЦвет]{0,80}(?:\d+\s*л\.\s*с\.?|\d+\s*л\.\s*с)/i)?.[0]?.trim() ??
    null

  const city =
    plainText.match(/Местонахождение\s*[:-]\s*([А-Яа-яЁё0-9\-\s]{2,50})/i)?.[1]?.trim() ??
    plainText.match(/\b20\d{2}\s*г\.?\s*\/\s*[\d\s\u00A0]{2,}\s*(?:км|km)\s*\/\s*([А-Яа-яЁё -]{2,40})/i)?.[1]?.trim() ??
    plainText.match(/(?:Лот\s+\d+\s+)([А-Яа-яЁё -]{2,40})/i)?.[1]?.trim() ??
    null

  return {
    title,
    price,
    originalPrice,
    mileage: normalizeNumber(mileageText),
    year: parseYear(yearText),
    imageUrls: htmlImageUrls,
    city: cleanupValue(city, 3),
    vin,
    engine: cleanupValue(engine, 6),
    transmission: cleanupValue(transmission, 4),
    drivetrain: cleanupValue(drivetrain, 4),
    bodyColor: cleanupValue(bodyColor, 2),
    bodyType: bodyType ? cleanupValue(bodyType, 5) : null,
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

type CatalogCardData = {
  title: string | null
  price: number | null
  mileage: number | null
  year: number | null
  city: string | null
  imageUrls: string[]
  engine: string | null
  transmission: string | null
  drivetrain: string | null
  bodyColor: string | null
}

/** Извлекает URL карточек и данные с карточек каталога (fallback при парсинге detail). */
async function extractDetailUrlsWithCardData(
  page: Page,
  detailPrefix: string
): Promise<Array<{ url: string; cardData: CatalogCardData }>> {
  const results = await page.evaluate(
    (ctx: { baseUrl: string; detailPrefix: string; uuidRe: string }) => {
      const re = new RegExp(ctx.uuidRe)
      const seen = new Set<string>()
      const out: Array<{ url: string; cardData: CatalogCardData }> = []
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
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
        if (!path.startsWith(ctx.detailPrefix)) continue
        if (!re.test(path)) continue
        if (seen.has(absolute)) continue
        seen.add(absolute)

        const container = a
        const text = (container.textContent ?? '').replace(/\s+/g, ' ').replace(/\u00A0/g, ' ').replace(/&nbsp;/g, ' ').trim()

        const titleEl = container.querySelector('h4, h3')
        const titleRaw = (titleEl?.textContent ?? '').replace(/\s+/g, ' ').trim()
        const title = titleRaw && titleRaw.length >= 2 && titleRaw.length <= 80 ? titleRaw : null

        const priceMatches = [...text.matchAll(/(\d[\d\s]{3,})\s*₽/g)].map(function (m) {
          const n = parseInt((m[1] || '').replace(/\s/g, ''), 10)
          return isNaN(n) ? 0 : n
        }).filter(function (n) { return n >= 100000 && n <= 100000000 })
        const price = priceMatches.length > 0 ? Math.max.apply(null, priceMatches) : null
        const priceOk = price !== null

        const mileageMatch = text.match(/(\d[\d\s]{1,})\s*(?:км|km|м\.ч\.)/i)
        const mileageStr = mileageMatch?.[1]?.replace(/\s/g, '')
        const mileage = mileageStr ? parseInt(mileageStr, 10) : null
        const mileageOk = mileage !== null && !isNaN(mileage) && mileage >= 0

        const yearMatch = text.match(/\b(20\d{2}|19\d{2})\b/)
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null
        const yearOk = year !== null && !isNaN(year) && year >= 1990 && year <= 2030

        const cityMatch = text.match(/Лот\s+\d+\s*([А-Яа-яЁё][А-Яа-яЁё\s\-]{1,39})/) ??
          text.match(/([А-Яа-яЁё][А-Яа-яЁё\s\-]{2,30})\s*$/)
        const city = cityMatch?.[1]?.trim() ?? null

        const imgs = container.querySelectorAll('img[src], img[data-src]')
        const imageUrls = Array.from(imgs).map(function (img) {
          return img.getAttribute('data-src') ?? img.getAttribute('src') ?? ''
        }).filter(Boolean)

        const engineMatch = text.match(/(?:Бензиновый|Дизельный|Электрический)[\s\d.,\-а-яёА-ЯЁ]*?(?:\d+\s*л\.\s*с\.?|л\.\s*с\.)/i)
        const engine = engineMatch ? engineMatch[0].trim() : null
        const transMatch = text.match(/(?:Автомат|Механика|Робот|Вариатор)/i)
        const transmission = transMatch ? transMatch[0].trim() : null
        const driveMatch = text.match(/(?:Полный|Передний|Задний|Колесный|Гусеничный|Комбинированный|\d+x\d+)/i)
        const drivetrain = driveMatch ? driveMatch[0].trim() : null
        const colorMatch = text.match(/(?:Серый|Белый|Черный|Красный|Синий|Желтый|Зеленый|Коричневый|Бежевый|Оранжевый)/i)
        const bodyColor = colorMatch ? colorMatch[0].trim() : null

        out.push({
          url: absolute,
          cardData: {
            title,
            price: priceOk ? price : null,
            mileage: mileageOk ? mileage : null,
            year: yearOk ? year : null,
            city: city && city.length >= 2 && city.length <= 40 ? city : null,
            imageUrls,
            engine,
            transmission,
            drivetrain,
            bodyColor,
          },
        })
      }
      return out
    },
    {
      baseUrl: ALFALEASING_BASE_URL,
      detailPrefix,
      uuidRe: DETAIL_UUID_RE.source,
    }
  )
  return results.filter((r) => isDetailUrl(r.url, detailPrefix))
}

/** Ищет URL следующей страницы пагинации. */
async function extractNextPageUrl(page: Page, currentUrl: string): Promise<string | null> {
  const nextUrl = await page.evaluate((ctx: { current: string }) => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    const base = new URL(ctx.current, window.location.origin)
    const basePagen = base.searchParams.get('PAGEN_1')
    const basePage = base.searchParams.get('page')
    const currentRaw = (basePagen && basePagen.trim()) || (basePage && basePage.trim()) || '1'
    const currentPage = Number(currentRaw) || 1
    for (const a of links) {
      const href = a.getAttribute('href')
      if (!href) continue
      try {
        const full = new URL(href, window.location.origin)
        if (full.pathname !== base.pathname) continue
        const pagen = full.searchParams.get('PAGEN_1')
        const pageParam = full.searchParams.get('page')
        const raw = (pagen && pagen.trim()) || (pageParam && pageParam.trim()) || '1'
        const pageNum = Number(raw) || 1
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
    for (let i = 0; i < 5; i += 1) {
      window.scrollBy(0, 600)
      await new Promise((r) => setTimeout(r, 800))
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
  })
}

async function loadAllCatalogItems(page: Page, maxIterations: number): Promise<void> {
  for (let i = 0; i < maxIterations; i += 1) {
    const clicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll<HTMLElement>('button, a'))
      const target = elements.find((el) => /Показать ещё/i.test((el.textContent || '').trim()))
      if (!target) return false
      target.scrollIntoView({ behavior: 'auto', block: 'center' })
      target.click()
      return true
    })
    if (!clicked) break
    await sleep(process.env.CI ? 3000 : 5000)
    await scrollToLoadMore(page)
    await randomDelay(500, 1200)
  }
}

/**
 * Фото из видимой галереи карточки (main / Product / article), без логотипов и мелких иконок.
 * Дополняет JSON-LD и regex-HTML, чтобы забрать все слайды, а не одно превью.
 */
async function extractDetailPageGalleryUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const BAD_SUB = [
      'logo',
      'favicon',
      'sprite',
      'icon',
      'apple-touch',
      'banner',
      'telegram',
      'vk.',
      'placeholder',
      '1x1',
      'no-image',
      'default.',
      'local/templates',
    ]
    function isBadSrc(src: string): boolean {
      if (!src) return true
      const s = src.toLowerCase().trim()
      if (s.startsWith('data:')) return true
      if (s.endsWith('.svg')) return true
      return BAD_SUB.some((b) => s.includes(b))
    }
    const root =
      document.querySelector('main') ??
      document.querySelector('[itemtype*="Product"]') ??
      document.querySelector('article') ??
      document.body
    if (!root) return []
    const imgs = root.querySelectorAll<HTMLImageElement>('img[src], img[data-src]')
    const out: string[] = []
    const seen = new Set<string>()
    for (const img of imgs) {
      const src = (img.getAttribute('data-src') || img.getAttribute('src') || '').trim()
      if (!src || isBadSrc(src)) continue
      if (img.naturalWidth > 0 && img.naturalWidth < 100) continue
      if (img.naturalHeight > 0 && img.naturalHeight < 70) continue
      if (seen.has(src)) continue
      seen.add(src)
      out.push(src)
    }
    return out
  })
}

// --- enrich each detail page and build ScrapedListing ---

async function enrichAndCollectListing(
  page: Page,
  detailUrl: string,
  category: string,
  catalogFallback: CatalogCardData | null
): Promise<ScrapedListing | null> {
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
    await sleep(process.env.CI ? 2000 : 4000)
    const html = await page.content()
    const fromDomGallery = await extractDetailPageGalleryUrls(page)

    const jsonLd = extractJsonLdBlocks(html)
    const fromLd = extractDetailFromJsonLd(jsonLd)
    const fromHtml = extractDetailFromHtmlFallback(html, category)
    const card = catalogFallback

    const title = card?.title ?? fromLd.title ?? fromHtml.title ?? null
    const price = fromLd.price ?? fromHtml.price ?? card?.price ?? null
    const mileage = fromLd.mileage ?? fromHtml.mileage ?? card?.mileage ?? null
    const year = fromLd.year ?? fromHtml.year ?? card?.year ?? null
    const city = card?.city ?? fromHtml.city ?? null
    const vin = fromLd.vin ?? fromHtml.vin ?? null
    const engine = card?.engine ?? fromLd.engine ?? fromHtml.engine ?? null
    const transmission = card?.transmission ?? fromLd.transmission ?? fromHtml.transmission ?? null
    const drivetrain = card?.drivetrain ?? fromLd.drivetrain ?? fromHtml.drivetrain ?? null
    const bodyColor = card?.bodyColor ?? fromLd.bodyColor ?? fromHtml.bodyColor ?? null
    const bodyType = fromHtml.bodyType ?? null

    if (!title || !isRealCarTitle(title)) {
      console.warn(`  skip (no title): ${detailUrl}`)
      return null
    }
    const MIN_VEHICLE_PRICE = 100_000
    if (!price || price < MIN_VEHICLE_PRICE) {
      console.warn(`  skip (no/implausible price): ${title.slice(0, 40)}...`)
      return null
    }

    let images = mergeUniqueListingImages([
      fromLd.imageUrls ?? [],
      fromDomGallery,
      card?.imageUrls ?? [],
      fromHtml.imageUrls ?? [],
    ])

    if (images.length === 0) {
      const allImageCandidates = [
        ...(card?.imageUrls ?? []),
        ...(fromLd.imageUrls ?? []),
        ...(fromHtml.imageUrls ?? []),
        ...fromDomGallery,
      ].filter(Boolean) as string[]
      const absoluteImage = allImageCandidates.length > 0 ? toAbsoluteUrl(pickBestImageCandidate(allImageCandidates)) : null
      if (!absoluteImage || isBadImageCandidate(absoluteImage)) {
        console.warn(`  skip (no real image): ${title.slice(0, 40)}...`)
        return null
      }
      images = [absoluteImage]
    }

    const listing: ScrapedListing = {
      external_id: buildExternalId(detailUrl),
      title: sanitizeTitle(title),
      price,
      original_price: null,
      mileage,
      year,
      images,
      listing_url: detailUrl,
      source: SOURCE,
      category,
      city: city && isPlausibleCity(city) ? city : null,
      vin: vin || null,
      engine: engine || null,
      transmission: transmission || null,
      drivetrain: drivetrain || null,
      body_color: bodyColor || null,
      body_type: bodyType || null,
    }

    return listing
  } catch (err) {
    if (isShutdownError(err)) throw err
    console.warn(`  enrich failed for ${detailUrl}:`, err)
    return null
  }
}

/**
 * Сравнивает текущие цены с сохранёнными в Supabase и проставляет original_price при снижении.
 * Alfaleasing не показывает зачёркнутых цен на сайте — скидки определяются только между прогонами парсера.
 */
async function applyHistoricalPriceLogic(
  supabase: SupabaseClient,
  listings: ScrapedListing[],
): Promise<void> {
  if (listings.length === 0) return

  const externalIds = listings.map((l) => l.external_id)
  const byId = new Map<
    string,
    { external_id: string; price: number | string | null; original_price: number | string | null }
  >()

  const HISTORICAL_BATCH = 50
  for (let i = 0; i < externalIds.length; i += HISTORICAL_BATCH) {
    const batch = externalIds.slice(i, i + HISTORICAL_BATCH)
    const { data: existingRows, error } = await supabase
      .from('listings')
      .select('external_id, price, original_price')
      .eq('source', SOURCE)
      .in('external_id', batch)

    if (error) {
      console.warn(`Historical price lookup batch failed (non-fatal): ${error.message}`)
      continue
    }

    for (const row of existingRows ?? []) {
      const r = row as { external_id?: string; price?: number | string | null; original_price?: number | string | null }
      if (!r.external_id) continue
      byId.set(r.external_id, {
        external_id: r.external_id,
        price: r.price ?? null,
        original_price: r.original_price ?? null,
      })
    }
  }
  const matchedByIdCount = byId.size

  const listingsWithoutHistory = listings.filter((l) => !byId.has(l.external_id) && l.vin)
  const vinToListing = new Map<string, ScrapedListing>()
  const vinSet = new Set<string>()
  for (const l of listingsWithoutHistory) {
    const vin = l.vin?.trim().toUpperCase()
    if (!vin) continue
    vinSet.add(vin)
    vinToListing.set(vin, l)
  }

  let vinMatched = 0
  if (vinSet.size > 0) {
    const vinArray = [...vinSet]
    for (let j = 0; j < vinArray.length; j += HISTORICAL_BATCH) {
      const vinBatch = vinArray.slice(j, j + HISTORICAL_BATCH)
      const { data: vinRows, error: vinErr } = await supabase
        .from('listings')
        .select('external_id, price, original_price, vin')
        .eq('source', SOURCE)
        .in('vin', vinBatch)

      if (vinErr) {
        console.warn('Historical price VIN lookup failed (non-fatal):', vinErr.message)
        continue
      }

      for (const row of vinRows ?? []) {
        const r = row as {
          external_id?: string
          price?: number | string | null
          original_price?: number | string | null
          vin?: string | null
        }
        if (!r.external_id || !r.vin) continue
        const vin = r.vin.trim().toUpperCase()
        const listing = vinToListing.get(vin)
        if (!listing) continue
        listing.external_id = r.external_id
        byId.set(r.external_id, {
          external_id: r.external_id,
          price: r.price ?? null,
          original_price: r.original_price ?? null,
        })
        vinMatched += 1
      }
    }
  }

  let discounts = 0
  let priceIncreases = 0
  let unchanged = 0

  for (const listing of listings) {
    const currentPrice = listing.price
    if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) continue

    const prev = byId.get(listing.external_id)
    if (!prev) {
      listing.original_price = null
      continue
    }

    const prevPriceNum = prev.price != null ? Number(prev.price) : NaN
    const prevOriginalNum = prev.original_price != null ? Number(prev.original_price) : NaN

    if (!Number.isFinite(prevPriceNum) || prevPriceNum <= 0) {
      listing.original_price = Number.isFinite(prevOriginalNum) && prevOriginalNum > 0 ? prevOriginalNum : null
      continue
    }

    const baselineOriginal = Number.isFinite(prevOriginalNum) && prevOriginalNum > prevPriceNum ? prevOriginalNum : prevPriceNum

    if (currentPrice < prevPriceNum) {
      listing.original_price = baselineOriginal
      discounts += 1
    } else if (currentPrice > prevPriceNum) {
      listing.original_price = null
      priceIncreases += 1
    } else {
      listing.original_price = Number.isFinite(prevOriginalNum) && prevOriginalNum > 0 ? prevOriginalNum : listing.original_price
      unchanged += 1
    }
  }

  console.log(
    `Historical price logic (Alfaleasing): matched=${byId.size} (by_external_id=${matchedByIdCount}, by_vin=${vinMatched}), discounts=${discounts}, price_up=${priceIncreases}, unchanged=${unchanged}`,
  )
}

async function upsertListingsBatch(supabase: SupabaseClient, listings: ScrapedListing[]): Promise<void> {
  if (listings.length === 0) return

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
    row.original_price = listing.original_price ?? null
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
  })

  const { error } = await supabase.from('listings').upsert(upsertPayload, { onConflict: 'external_id' })
  if (error) throw error
}

async function scrapeListingsAndSync(supabase: SupabaseClient): Promise<void> {
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
  page.setDefaultNavigationTimeout(60_000)
  page.setDefaultTimeout(30_000)

  const scrapedIds = new Set<string>()
  const UPSERT_BATCH_SIZE = 200
  let pendingBatch: ScrapedListing[] = []
  let totalListings = 0
  const maxLoadMoreIterations = Math.min(Number(process.env.ALFALEASING_MAX_PAGES) || 5, 50)

  const maxRunSecondsEnv = Number(process.env.ALFALEASING_MAX_RUN_SECONDS)
  const hasTimeLimit = Number.isFinite(maxRunSecondsEnv) && maxRunSecondsEnv > 0
  const startedAt = Date.now()
  const isTimeExceeded = (): boolean =>
    hasTimeLimit ? (Date.now() - startedAt) / 1000 >= maxRunSecondsEnv : false

  try {
    for (const section of ALFALEASING_SECTIONS) {
      if (shutdownRequested || isTimeExceeded()) break
      console.log(`\n=== Section: ${section.category} (${section.catalogUrl}) ===`)

      try {
        await page.goto(section.catalogUrl, { waitUntil: 'domcontentloaded' })
      } catch (navErr) {
        if (isShutdownError(navErr)) break
        throw navErr
      }

      await sleep(process.env.CI ? 1500 : 3000)
      await scrollToLoadMore(page)
      await randomDelay(500, 1200)

      console.log(`Loading additional catalog items for section "${section.category}" via "Показать ещё"...`)
      await loadAllCatalogItems(page, maxLoadMoreIterations)

      const detailItems = await extractDetailUrlsWithCardData(page, section.detailPrefix)
      console.log(`Collected ${detailItems.length} detail links in section "${section.category}"`)

      if (detailItems.length === 0) {
        console.log('No detail links found for this section, skipping.')
        continue
      }

      for (const { url, cardData } of detailItems) {
        if (shutdownRequested || isTimeExceeded()) {
          console.log('Shutdown or time limit reached while processing detail items, stopping early.')
          break
        }
        const externalId = buildExternalId(url)
        if (scrapedIds.has(externalId)) continue

        const listing = await enrichAndCollectListing(page, url, section.category, cardData)
        if (listing) {
          scrapedIds.add(listing.external_id)
          totalListings += 1
          pendingBatch.push(listing)
          console.log(
            `+ [${section.category}] ${listing.title} | ${listing.price ?? '?'} ₽ | ${listing.year ?? '?'} г. | ${
              listing.city ?? '?'
            } | body_type: ${listing.body_type ?? '-'}`
          )

          if (pendingBatch.length >= UPSERT_BATCH_SIZE) {
            console.log(`Flushing batch of ${pendingBatch.length} listings to Supabase...`)
            await applyHistoricalPriceLogic(supabase, pendingBatch)
            await upsertListingsBatch(supabase, pendingBatch)
            pendingBatch = []
          }
        }
        await randomDelay(400, 900)
      }
    }

    if (pendingBatch.length > 0) {
      console.log(`Flushing final batch of ${pendingBatch.length} listings to Supabase...`)
      await applyHistoricalPriceLogic(supabase, pendingBatch)
      await upsertListingsBatch(supabase, pendingBatch)
      pendingBatch = []
    }

    console.log(`\nScraped ${totalListings} unique listings from Alfaleasing.`)

    const scrapedIdsSet = scrapedIds

    const { data: existingRows } = await supabase
      .from('listings')
      .select('external_id')
      .eq('source', SOURCE)
    const toRemove = (existingRows ?? [])
      .map((r) => (r as { external_id?: string }).external_id)
      .filter((id): id is string => !!id && !scrapedIdsSet.has(id))

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
          console.warn(`Sync cleanup warning: failed to remove old listings: ${removeErr.message}`)
          break
        }
      }
      console.log(`Removed ${toRemove.length} listings no longer on Alfaleasing (sync cleanup).`)
    }
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
    await scrapeListingsAndSync(supabase)
  } catch (error) {
    console.error('Alfaleasing scraper failed:', error)
    process.exitCode = 1
  }
}

void run()
