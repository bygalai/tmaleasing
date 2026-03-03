/**
 * Альфа-Лизинг парсер — легковые автомобили с пробегом с alfaleasing.ru.
 * Секция: легковые (legkovye). Пишет в таблицу listings (source='alfaleasing', category='legkovye').
 * Каталог: https://alfaleasing.ru/rasprodazha-avto-s-probegom/legkovye/
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

const SOURCE = 'alfaleasing'
const ALFALEASING_BASE_URL = 'https://alfaleasing.ru'
const ALLOWED_DOMAIN = 'alfaleasing.ru'

/** Паттерн URL карточки: /rasprodazha-avto-s-probegom/legkovye/.../uuid/ */
const LEGKOVYE_DETAIL_PREFIX = '/rasprodazha-avto-s-probegom/legkovye/'
const DETAIL_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const ALFALEASING_SECTIONS: Array<{ catalogUrl: string; category: string }> = [
  { catalogUrl: 'https://alfaleasing.ru/rasprodazha-avto-s-probegom/legkovye/', category: 'legkovye' },
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
]

const TITLE_BLOCKLIST = new Set([
  'легковые автомобили',
  'каталог',
  'автомобили',
  'техника',
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
    if (lowered.includes('/upload/') || lowered.includes('/images/') || lowered.includes('/media/') || lowered.includes('/photo/')) points += 3
    if (lowered.includes('/img/')) points -= 1
    return points
  }
  urls.sort((a, b) => score(b) - score(a))
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

function isDetailUrl(url: string): boolean {
  if (!isAlfaleasingUrl(url)) return false
  try {
    const path = new URL(url, ALFALEASING_BASE_URL).pathname
    if (!path.startsWith(LEGKOVYE_DETAIL_PREFIX)) return false
    return DETAIL_UUID_RE.test(path)
  } catch {
    return false
  }
}

function buildExternalId(listingUrl: string): string {
  return createHash('sha256').update(listingUrl).digest('hex')
}

function sanitizeTitle(value: string | null | undefined): string {
  const fallback = 'Легковой автомобиль'
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
  return {
    title: bestTitle,
    price: pickBestPrice(prices, MIN_VEHICLE_PRICE, 100_000_000),
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
    .filter((v) => v >= 100_000 && v <= 100_000_000)
  const price = priceMatches.length > 0 ? Math.min(...priceMatches) : null

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
  const transmission =
    plainText.match(/Коробка\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9 -]{2,60})/i)?.[1]?.trim() ??
    plainText.match(/Трансмиссия\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9 -]{2,60})/i)?.[1]?.trim() ??
    null
  const drivetrain =
    plainText.match(/Привод\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9xX -]{2,60})/i)?.[1]?.trim() ??
    plainText.match(/Тип\s*привода\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9xX -]{2,60})/i)?.[1]?.trim() ??
    null
  const engine =
    plainText.match(/Двигатель\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9.,/ -]{2,80})/i)?.[1]?.trim() ??
    null

  const city =
    plainText.match(/Местонахождение\s*[:-]\s*([А-Яа-яЁё0-9\-\s]{2,50})/i)?.[1]?.trim() ??
    plainText.match(/\b20\d{2}\s*г\.?\s*\/\s*[\d\s\u00A0]{2,}\s*(?:км|km)\s*\/\s*([А-Яа-яЁё -]{2,40})/i)?.[1]?.trim() ??
    plainText.match(/(?:Лот\s+\d+\s+)([А-Яа-яЁё -]{2,40})/i)?.[1]?.trim() ??
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

type CatalogCardData = {
  title: string | null
  price: number | null
  mileage: number | null
  year: number | null
  city: string | null
  imageUrl: string | null
  engine: string | null
  transmission: string | null
  drivetrain: string | null
  bodyColor: string | null
}

/** Извлекает URL карточек и данные с карточек каталога (fallback при парсинге detail). */
async function extractDetailUrlsWithCardData(page: Page): Promise<Array<{ url: string; cardData: CatalogCardData }>> {
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

        const mileageMatch = text.match(/(\d[\d\s]{2,})\s*(?:км|km)/i)
        const mileageStr = mileageMatch?.[1]?.replace(/\s/g, '')
        const mileage = mileageStr ? parseInt(mileageStr, 10) : null
        const mileageOk = mileage !== null && !isNaN(mileage) && mileage >= 0

        const yearMatch = text.match(/\b(20\d{2}|19\d{2})\b/)
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null
        const yearOk = year !== null && !isNaN(year) && year >= 1990 && year <= 2030

        const cityMatch = text.match(/Лот\s+\d+\s*([А-Яа-яЁё][А-Яа-яЁё\s\-]{1,39})/) ??
          text.match(/([А-Яа-яЁё][А-Яа-яЁё\s\-]{2,30})\s*$/)
        const city = cityMatch?.[1]?.trim() ?? null

        const img = container.querySelector('img[src], img[data-src]')
        const imgSrc = img?.getAttribute('data-src') ?? img?.getAttribute('src') ?? null

        const engineMatch = text.match(/(?:Бензиновый|Дизельный|Электрический)[^АвтоПолПередЗад]*?(?:л\.с\.|л\.\s*с\.)/i)
        const engine = engineMatch ? engineMatch[0].trim() : null
        const transMatch = text.match(/(?:Автомат|Механика|Робот|Вариатор)/i)
        const transmission = transMatch ? transMatch[0].trim() : null
        const driveMatch = text.match(/(?:Полный|Передний|Задний)/i)
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
            imageUrl: imgSrc,
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
      detailPrefix: LEGKOVYE_DETAIL_PREFIX,
      uuidRe: DETAIL_UUID_RE.source,
    }
  )
  return results.filter((r) => isDetailUrl(r.url))
}

/** Ищет URL следующей страницы пагинации. */
async function extractNextPageUrl(page: Page, currentUrl: string): Promise<string | null> {
  const nextUrl = await page.evaluate((ctx: { current: string }) => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    const base = new URL(ctx.current, window.location.origin)
    const currentPage = Number(base.searchParams.get('page') || base.searchParams.get('PAGEN_1') || '1') || 1
    for (const a of links) {
      const href = a.getAttribute('href')
      if (!href) continue
      try {
        const full = new URL(href, window.location.origin)
        if (full.pathname !== base.pathname) continue
        const pageNum = Number(full.searchParams.get('page') || full.searchParams.get('PAGEN_1') || '1') || 1
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

// --- enrich each detail page and build ScrapedListing ---

async function enrichAndCollectListing(
  page: Page,
  detailUrl: string,
  category: string,
  catalogFallback: CatalogCardData | null
): Promise<ScrapedListing | null> {
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
    await sleep(process.env.CI ? 3000 : 5000)
    const html = await page.content()

    const jsonLd = extractJsonLdBlocks(html)
    const fromLd = extractDetailFromJsonLd(jsonLd)
    const fromHtml = extractDetailFromHtmlFallback(html)
    const card = catalogFallback

    const title = card?.title ?? fromLd.title ?? fromHtml.title ?? null
    const price = fromLd.price ?? fromHtml.price ?? card?.price ?? null
    const mileage = fromLd.mileage ?? fromHtml.mileage ?? card?.mileage ?? null
    const year = fromLd.year ?? fromHtml.year ?? card?.year ?? null
    const imageUrl = fromLd.imageUrl ?? fromHtml.imageUrl ?? card?.imageUrl ?? null
    const city = card?.city ?? fromHtml.city ?? null
    const vin = fromLd.vin ?? fromHtml.vin ?? null
    const engine = card?.engine ?? fromLd.engine ?? fromHtml.engine ?? null
    const transmission = card?.transmission ?? fromLd.transmission ?? fromHtml.transmission ?? null
    const drivetrain = card?.drivetrain ?? fromLd.drivetrain ?? fromHtml.drivetrain ?? null
    const bodyColor = card?.bodyColor ?? fromLd.bodyColor ?? fromHtml.bodyColor ?? null

    if (!title || !isRealCarTitle(title)) {
      console.warn(`  skip (no title): ${detailUrl}`)
      return null
    }
    const MIN_VEHICLE_PRICE = 100_000
    if (!price || price < MIN_VEHICLE_PRICE) {
      console.warn(`  skip (no/implausible price): ${title.slice(0, 40)}...`)
      return null
    }

    const absoluteImage = imageUrl ? toAbsoluteUrl(pickBestImageCandidate([imageUrl])) : null
    if (!absoluteImage || isBadImageCandidate(absoluteImage)) {
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
      category,
      city: city && isPlausibleCity(city) ? city : null,
      vin: vin || null,
      engine: engine || null,
      transmission: transmission || null,
      drivetrain: drivetrain || null,
      body_color: bodyColor || null,
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
  const maxPages = Math.min(Number(process.env.ALFALEASING_MAX_PAGES) || 5, 50)

  try {
    for (const section of ALFALEASING_SECTIONS) {
      if (shutdownRequested) break
      console.log(`\n=== Section: ${section.category} (${section.catalogUrl}) ===`)

      const visitedUrls = new Set<string>()
      let currentUrl: string | null = section.catalogUrl
      let pageIndex = 0

      while (currentUrl && pageIndex < maxPages) {
        if (shutdownRequested) break
        if (visitedUrls.has(currentUrl)) break
        visitedUrls.add(currentUrl)
        pageIndex += 1

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

        const detailItems = await extractDetailUrlsWithCardData(page)
        console.log(`Found ${detailItems.length} detail links on page`)

        for (const { url, cardData } of detailItems) {
          if (shutdownRequested) break
          if (collected.has(buildExternalId(url))) continue

          const listing = await enrichAndCollectListing(page, url, section.category, cardData)
          if (listing) {
            collected.set(listing.external_id, listing)
            console.log(
              `+ [${section.category}] ${listing.title} | ${listing.price ?? '?'} ₽ | ${listing.year ?? '?'} г. | ${listing.city ?? '?'}`
            )
          }
          await randomDelay(400, 900)
        }

        const nextUrl = await extractNextPageUrl(page, currentUrl)
        if (!nextUrl || visitedUrls.has(nextUrl)) break
        currentUrl = nextUrl
        await randomDelay(800, 1800)
      }
    }

    console.log(`\nScraped ${collected.size} unique listings from Alfaleasing.`)
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

    console.log(`Upserted ${listings.length} Alfaleasing listings.`)

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
          console.warn(`Sync cleanup warning: failed to remove old listings: ${removeErr.message}`)
          break
        }
      }
      console.log(`Removed ${toRemove.length} listings no longer on Alfaleasing (sync cleanup).`)
    }
  } catch (error) {
    console.error('Alfaleasing scraper failed:', error)
    process.exitCode = 1
  }
}

void run()
