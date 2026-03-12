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

function isTimeoutError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : ''
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return name === 'TimeoutError' || /timeout\s+exceeded/i.test(msg)
}

const SOURCE = 'vtb'
const ALLOWED_DOMAIN = 'vtb-leasing.ru'
const VTB_BASE_URL = 'https://www.vtb-leasing.ru/'
const LISTING_DETAIL_PATH_PATTERNS = ['/auto/probeg/', '/auto-market/details/']

/** VTB catalog sections. Each section has its own URL and category slug for Mini App filtering. */
const VTB_SECTIONS: Array<{ startUrl: string; category: string }> = [
  // Легковые автомобили
  { startUrl: 'https://www.vtb-leasing.ru/auto-market/', category: 'legkovye' },
  // Грузовые автомобили
  { startUrl: 'https://www.vtb-leasing.ru/market/f/type-is-2/?filter=1&PAGEN_1=1', category: 'gruzovye' },
  // Спецтехника
  { startUrl: 'https://www.vtb-leasing.ru/market/f/type-is-6/?filter=1&PAGEN_1=1', category: 'speztechnika' },
  // Прицепы и полуприцепы
  { startUrl: 'https://www.vtb-leasing.ru/market/f/type-is-5/?filter=1&PAGEN_1=1', category: 'pricepy' },
]
const BAD_IMAGE_SUBSTRINGS = [
  'logo',
  'favicon',
  'sprite',
  'icon',
  'apple-touch-icon',
  '/local/templates/',
  'logo-vtb',
  'logo-vtb-d',
]

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
    // Prefer real photo formats.
    if (/\.(jpe?g|png|webp)(\?|#|$)/i.test(lowered)) points += 5
    // VTB often serves real images under upload/iblock paths.
    if (lowered.includes('/upload/')) points += 3
    if (lowered.includes('/iblock/')) points += 2
    // Penalize anything that still looks like UI assets.
    if (lowered.includes('/img/')) points -= 1
    return points
  }

  urls.sort((a, b) => score(b) - score(a))
  return urls[0]
}

type ScrapedListing = {
  external_id: string
  title: string
  price: number | null
  /** Старая цена до скидки — для Mini App (зачёркнутая). */
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

type RawCard = {
  title: string | null
  priceText: string | null
  mileageText: string | null
  yearText: string | null
  imageUrl: string | null
  link: string | null
}

const TITLE_BLOCKLIST = new Set([
  'легковые автомобили',
  'грузовые автомобили',
  'автомобили',
  'автомаркет',
  'каталог',
  'все автомобили',
  'техника с пробегом',
  'операционный лизинг автомобилей',
  'втб лизинг',
  'ао «втб лизинг»',
  'ао "втб лизинг"',
])

const CITY_BLOCKLIST = new Set([
  'ж/д подвижной состав',
  'подвижной состав',
  'оборудование',
  'недвижимость',
])

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
  // Some editors save UTF-16LE without BOM.
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
  const envCandidates = ['.env', '.env.local', '.env.production']
  for (const name of envCandidates) {
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

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function randomDelay(minMs = 500, maxMs = 1400): Promise<void> {
  await sleep(randomInt(minMs, maxMs))
}

async function humanReadDelay(): Promise<void> {
  const isCI = !!process.env.CI
  const minMs = isCI ? 300 : 2000
  const maxMs = isCI ? 600 : 5000
  await sleep(Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs)
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

function toAbsoluteUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const absolute = new URL(value, VTB_BASE_URL)
    if (!absolute.hostname.includes(ALLOWED_DOMAIN)) return null
    return absolute.toString()
  } catch {
    return null
  }
}

function isAllowedVtbUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value, VTB_BASE_URL)
    return parsed.hostname.includes(ALLOWED_DOMAIN)
  } catch {
    return false
  }
}

/** Allows /auto-market/ and /market/ catalog URLs (cars, trucks, etc.). */
function isVtbCatalogUrl(value: string | null | undefined): boolean {
  if (!isAllowedVtbUrl(value)) return false
  try {
    const path = new URL(value as string, VTB_BASE_URL).pathname
    return path.includes('/auto-market/') || path.includes('/market/')
  } catch {
    return false
  }
}

/**
 * True only for catalog LIST pages (pagination targets), not detail/lot pages.
 * Rejects /market/vehicle-slug/ and /auto/probeg/vehicle-slug/ (detail pages).
 */
function isCatalogListUrl(value: string | null | undefined): boolean {
  if (!isVtbCatalogUrl(value)) return false
  if (!value) return false
  try {
    const path = new URL(value, VTB_BASE_URL).pathname
    if (path.includes('/auto/probeg/')) return false
    if (path.includes('/market/') && !path.includes('/market/f/')) return false
    return true
  } catch {
    return false
  }
}

/** Ensure nextUrl stays within the same section (auto-market vs market). */
function isSameSection(nextUrl: string, sectionStartUrl: string): boolean {
  try {
    const nextPath = new URL(nextUrl, VTB_BASE_URL).pathname
    const startPath = new URL(sectionStartUrl, VTB_BASE_URL).pathname
    if (startPath.includes('/auto-market/')) return nextPath.includes('/auto-market/')
    if (startPath.includes('/market/')) return nextPath.includes('/market/')
    return true
  } catch {
    return false
  }
}

function isListingDetailUrl(value: string | null | undefined): boolean {
  if (!isAllowedVtbUrl(value)) return false
  try {
    const parsed = new URL(value as string, VTB_BASE_URL)
    return LISTING_DETAIL_PATH_PATTERNS.some((pattern) => parsed.pathname.includes(pattern))
  } catch {
    return false
  }
}

function buildExternalId(listingUrl: string): string {
  return createHash('sha256').update(listingUrl).digest('hex')
}

function sanitizeTitle(value: string | null | undefined): string {
  const fallback = 'Untitled listing'
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
  // Avoid organization/page titles.
  if (lowered.includes('лизинг') && lowered.includes('втб')) return false
  return /[A-Za-zА-Яа-я]/.test(normalized)
}

function isOrgLikeTitle(value: string | null | undefined): boolean {
  if (!value) return false
  const lowered = value.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!lowered) return false
  if (lowered.includes('операционный') && lowered.includes('лизинг')) return true
  if (lowered.includes('ао ') && lowered.includes('лизинг')) return true
  if (lowered.includes('лизинг') && lowered.includes('втб')) return true
  return false
}

function isPlausibleCity(value: string | null | undefined): boolean {
  if (!value) return false
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2 || cleaned.length > 40) return false
  if (/\d/.test(cleaned)) return false
  const lowered = cleaned.toLowerCase()
  if (CITY_BLOCKLIST.has(lowered)) return false
  if (lowered.includes('подвижн') || lowered.includes('состав')) return false
  if (lowered.includes('код') || lowered.includes('адрес')) return false
  // Russian city names are typically Cyrillic + dash/space.
  if (!/^[А-Яа-яЁё -]+$/.test(cleaned)) return false
  return true
}

function toTextValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, ' ').trim()
    return normalized.length > 0 ? normalized : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function mergeRawCards(cards: RawCard[]): RawCard[] {
  const map = new Map<string, RawCard>()
  for (const card of cards) {
    if (!card.link) continue
    if (!isListingDetailUrl(card.link)) continue
    const existing = map.get(card.link)
    if (!existing) {
      map.set(card.link, card)
    } else {
      map.set(card.link, {
        link: card.link,
        title: card.title ?? existing.title,
        priceText: card.priceText ?? existing.priceText,
        mileageText: card.mileageText ?? existing.mileageText,
        yearText: card.yearText ?? existing.yearText,
        imageUrl: card.imageUrl ?? existing.imageUrl,
      })
    }
  }
  return [...map.values()]
}

function extractRawCardsFromUnknownPayload(payload: unknown): RawCard[] {
  const results: RawCard[] = []
  const seen = new Set<object>()

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
    const link =
      toTextValue(obj.link) ??
      toTextValue(obj.href) ??
      toTextValue(obj.url) ??
      toTextValue(obj.listing_url) ??
      toTextValue(obj.detail_url)

    const title =
      toTextValue(obj.title) ??
      toTextValue(obj.name) ??
      toTextValue(obj.model) ??
      toTextValue(obj.car_name)

    const offers = obj.offers ?? obj.offer
    const priceRaw =
      toTextValue(obj.price) ??
      toTextValue(obj.cost) ??
      toTextValue(obj.amount) ??
      toTextValue(obj.price_rub) ??
      (offers && typeof offers === 'object' ? toTextValue((offers as Record<string, unknown>).price) : null)

    const mileageRaw =
      toTextValue(obj.mileage) ??
      toTextValue(obj.run) ??
      toTextValue(obj.km) ??
      toTextValue(obj.odometer) ??
      toTextValue(obj.mileage_km)

    const yearRaw =
      toTextValue(obj.year) ??
      toTextValue(obj.production_year) ??
      toTextValue(obj.vehicleModelDate)

    const imageFromField = (img: unknown): string | null => {
      if (typeof img === 'string') return img
      if (img && typeof img === 'object') {
        const o = img as Record<string, unknown>
        return (
          toTextValue(o.url) ??
          toTextValue(o.src) ??
          toTextValue(o.href) ??
          (Array.isArray(o) && o[0] ? imageFromField(o[0]) : null)
        )
      }
      return null
    }
    const imageRaw =
      imageFromField(obj.image) ??
      toTextValue(obj.image_url) ??
      toTextValue(obj.imageUrl) ??
      toTextValue(obj.photo) ??
      toTextValue(obj.preview) ??
      toTextValue(obj.thumbnail) ??
      toTextValue(obj.thumbnailUrl) ??
      toTextValue(obj.mainImage) ??
      toTextValue(obj.picture) ??
      (Array.isArray(obj.images) && obj.images[0] ? imageFromField(obj.images[0]) : null)

    if (link && isListingDetailUrl(link) && isRealCarTitle(title)) {
      results.push({
        title,
        priceText: priceRaw,
        mileageText: mileageRaw,
        yearText: yearRaw,
        imageUrl: imageRaw,
        link,
      })
    }

    for (const value of Object.values(obj)) walk(value)
  }

  walk(payload)
  return mergeRawCards(results)
}

function mapRawCardToListing(raw: RawCard, category: string): ScrapedListing | null {
  const listingUrl = toAbsoluteUrl(raw.link)
  if (!listingUrl) return null

  const bestRawImage = pickBestImageCandidate([raw.imageUrl])
  const imageUrl = toAbsoluteUrl(bestRawImage)
  const price = normalizeNumber(raw.priceText)
  const mileage = normalizeNumber(raw.mileageText)
  const year = parseYear(raw.yearText ?? raw.title ?? '')
  const title = sanitizeTitle(raw.title)
  if (!isRealCarTitle(title)) return null

  return {
    external_id: buildExternalId(listingUrl),
    title,
    price,
    original_price: null,
    mileage,
    year,
    images: imageUrl ? [imageUrl] : [],
    listing_url: listingUrl,
    source: SOURCE,
    category,
    city: null,
    vin: null,
    engine: null,
    transmission: null,
    drivetrain: null,
    body_color: null,
  }
}

async function autoScrollUntilStable(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const raw = Number((window as unknown as { __VTB_SCROLL_PASSES?: string }).__VTB_SCROLL_PASSES ?? 'NaN')
    const isCI = typeof (window as unknown as { __CI?: boolean }).__CI === 'boolean'
    const passes =
      Number.isFinite(raw) && raw > 0
        ? Math.floor(raw)
        : isCI
          ? 2
          : Math.floor(Math.random() * 6) + 5
    const delayMs = isCI ? 800 : 2000
    for (let i = 0; i < passes; i += 1) {
      window.scrollBy(0, 500)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
  })
}

async function extractRawCardsFromPage(page: Page): Promise<RawCard[]> {
  const rawCards = await page.evaluate(() => {
    const unique = new Map<string, RawCard>()
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/auto/probeg/"], a[href*="/auto-market/details/"]')
    )

    for (const anchor of anchors) {
      const href = anchor.getAttribute('href')
      if (!href) continue

      let absoluteHref = ''
      try {
        absoluteHref = new URL(href, window.location.origin).toString()
      } catch {
        continue
      }
      if (!absoluteHref.includes('vtb-leasing.ru')) continue
      if (!absoluteHref.includes('/auto/probeg/') && !absoluteHref.includes('/auto-market/details/')) continue

      const container =
        anchor.closest<HTMLElement>('article, li, section, div') ?? anchor.parentElement ?? anchor
      const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!text) continue

      const priceMatch =
        text.match(/(\d[\d\s\u00A0]{3,})\s*₽/i) ??
        text.match(/(\d[\d\s\u00A0]{5,})\s*(руб|р\.?)/i) ??
        text.match(/\b(\d[\d\s\u00A0]{5,})\b/)
      const mileageMatch = text.match(/(\d[\d\s\u00A0]{2,})\s*(км|km)/i)
      const yearMatch = text.match(/\b(20\d{2})\b/)

      const titleEl =
        container.querySelector<HTMLElement>('h3') ??
        Array.from(container.querySelectorAll<HTMLElement>('div')).find((div) => {
          const maybeText = (div.textContent ?? '').replace(/\s+/g, ' ').trim()
          const style = window.getComputedStyle(div)
          const fontSize = Number.parseFloat(style.fontSize || '0')
          return fontSize >= 16 && /[A-Za-zА-Яа-я]/.test(maybeText)
        }) ??
        container.querySelector<HTMLElement>('h2, h4, strong, b')

      const titleText = (titleEl?.textContent ?? anchor.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!titleText) continue
      const lowerTitle = titleText.toLowerCase()
      if (lowerTitle === 'легковые автомобили' || lowerTitle === 'грузовые автомобили') continue

      // The page contains many UI images (logos/icons). Prefer card/gallery images.
      const badParts = [
        'logo',
        'favicon',
        'sprite',
        'icon',
        'apple-touch-icon',
        '/local/templates/',
        'logo-vtb',
        'logo-vtb-d',
      ]

      const images = Array.from(
        container.querySelectorAll<HTMLImageElement>('img[src], img[data-src], img[srcset]')
      )
      const candidateImages = images
        .map((img) => img.getAttribute('data-src') ?? img.getAttribute('src') ?? img.getAttribute('srcset') ?? '')
        .map((value) => value.split(',')[0]?.trim() ?? '')
        .filter((value) => value.length > 0)
        .filter((value) => {
          const lowered = value.trim().toLowerCase()
          if (!lowered) return false
          if (lowered.startsWith('data:')) return false
          if (lowered.endsWith('.svg')) return false
          if (badParts.some((p) => lowered.includes(p))) return false
          return true
        })
      const imageCandidate = candidateImages[0] ?? null

      unique.set(absoluteHref, {
        title: titleText,
        priceText: priceMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? null,
        mileageText: mileageMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? null,
        yearText: yearMatch?.[0] ?? null,
        imageUrl: imageCandidate,
        link: absoluteHref,
      })
    }

    if (unique.size === 0) {
      const anyAnchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      for (const anchor of anyAnchors) {
        const href = anchor.getAttribute('href')
        if (!href) continue
        if (!href.includes('/auto/probeg/') && !href.includes('/auto-market/details/')) continue

        let absoluteHref = ''
        try {
          absoluteHref = new URL(href, window.location.origin).toString()
        } catch {
          continue
        }
        if (!absoluteHref.includes('vtb-leasing.ru')) continue

        const area =
          anchor.closest<HTMLElement>('article, li, section, div') ?? anchor.parentElement ?? anchor
        const areaText = (area.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (!/₽/.test(areaText)) continue
        if (!/\d/.test(areaText)) continue

        const title = (anchor.textContent ?? '').replace(/\s+/g, ' ').trim()
        const lowerTitle = (title ?? '').toLowerCase()
        if (!title || lowerTitle === 'легковые автомобили' || lowerTitle === 'грузовые автомобили') continue

        const price = areaText.match(/(\d[\d\s\u00A0]{3,})\s*₽/i)?.[1] ?? null
        const priceFallback = areaText.match(/(\d[\d\s\u00A0]{5,})\s*(руб|р\.?)/i)?.[1] ?? null
        const mileage = areaText.match(/(\d[\d\s\u00A0]{2,})\s*(км|km)/i)?.[1] ?? null
        const year = areaText.match(/\b(20\d{2})\b/)?.[0] ?? null
        const badParts = [
          'logo',
          'favicon',
          'sprite',
          'icon',
          'apple-touch-icon',
          '/local/templates/',
          'logo-vtb',
          'logo-vtb-d',
        ]

        const images = Array.from(area.querySelectorAll<HTMLImageElement>('img[src], img[data-src], img[srcset]'))
        const candidateImages = images
          .map((img) => img.getAttribute('data-src') ?? img.getAttribute('src') ?? img.getAttribute('srcset') ?? '')
          .map((value) => value.split(',')[0]?.trim() ?? '')
          .filter((value) => value.length > 0)
          .filter((value) => {
            const lowered = value.trim().toLowerCase()
            if (!lowered) return false
            if (lowered.startsWith('data:')) return false
            if (lowered.endsWith('.svg')) return false
            if (badParts.some((p) => lowered.includes(p))) return false
            return true
          })
        const imageCandidate = candidateImages[0] ?? null

        unique.set(absoluteHref, {
          title,
          priceText: price ?? priceFallback,
          mileageText: mileage,
          yearText: year,
          imageUrl: imageCandidate,
          link: absoluteHref,
        })
      }
    }

    return [...unique.values()]
  })

  return rawCards
}

async function waitForListingContainer(page: Page): Promise<void> {
  await page.waitForSelector('a[href*="/auto/probeg/"], a[href*="/auto-market/details/"]', {
    timeout: 45_000,
  })
}

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
    if (type === 'image' || type === 'font' || type === 'stylesheet') {
      request.abort()
      return
    }
    request.continue()
  })
}

function getCurrentPageNumber(url: string): number {
  try {
    const parsed = new URL(url, VTB_BASE_URL)
    const value = parsed.searchParams.get('PAGEN_1')
    const pageNumber = value ? Number(value) : 1
    return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1
  } catch {
    return 1
  }
}

function buildNextPageUrl(currentUrl: string): string {
  const currentPage = getCurrentPageNumber(currentUrl)
  const parsed = new URL(currentUrl, VTB_BASE_URL)
  parsed.searchParams.set('PAGEN_1', String(currentPage + 1))
  return parsed.toString()
}

async function extractNextPageUrl(page: Page, currentUrl: string): Promise<string | null> {
  const currentPage = getCurrentPageNumber(currentUrl)

  const nextUrl = await page.evaluate((ctx: { activeUrl: string; currentPage: number }) => {
    const candidateAnchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    const patterns = [/next/i, /след/i, />/, /»/, /›/]
    const pagedCandidates: Array<{ page: number; url: string }> = []

    for (const a of candidateAnchors) {
      const href = a.getAttribute('href')
      if (!href) continue

      let absolute: string
      try {
        absolute = new URL(href, window.location.origin).toString()
      } catch {
        continue
      }
      if (!absolute.includes('vtb-leasing.ru')) continue
      if (!absolute.includes('/auto-market/') && !absolute.includes('/market/')) continue

      const parsedAbsolute = new URL(absolute, window.location.origin)
      const pageParam = parsedAbsolute.searchParams.get('PAGEN_1')
      if (pageParam) {
        const pageNum = Number(pageParam)
        if (Number.isFinite(pageNum) && pageNum > ctx.currentPage) {
          pagedCandidates.push({ page: pageNum, url: absolute })
        }
      }

      const text = (a.textContent ?? '').trim()
      const rel = a.getAttribute('rel') ?? ''
      const cls = a.className ?? ''
      const ariaLabel = a.getAttribute('aria-label') ?? ''

      const looksLikeNext =
        rel.toLowerCase().includes('next') ||
        patterns.some((p) => p.test(text)) ||
        /next|след/i.test(cls) ||
        /next|след/i.test(ariaLabel)

      if (looksLikeNext && absolute !== ctx.activeUrl) {
        pagedCandidates.push({ page: ctx.currentPage + 1, url: absolute })
      }
    }

    if (pagedCandidates.length > 0) {
      pagedCandidates.sort((a, b) => a.page - b.page)
      const exactNext = pagedCandidates.find((item) => item.page === ctx.currentPage + 1)
      return exactNext?.url ?? pagedCandidates[0].url
    }

    return null
  }, { activeUrl: currentUrl, currentPage })

  if (nextUrl) return nextUrl

  return buildNextPageUrl(currentUrl)
}

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
      // ignore invalid json-ld blocks
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

    // Common schema.org fields for vehicle offer pages.
    const maybeName = toTextValue(obj.name) ?? toTextValue(obj.title)
    if (maybeName && isRealCarTitle(maybeName)) titles.push(maybeName)

    // JSON-LD often contains site-level "logo" (VTB logo) which is NOT the vehicle photo.
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
      toTextValue((obj.vehicleEngine as Record<string, unknown> | undefined)?.engineType) ??
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
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ??
    null

  // Remove noisy blocks and tags to get stable text patterns.
  const plainText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Keep it simple: digits are stable even if locale text is encoded oddly.
  const title =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ??
    null

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
    html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/i)?.[1] ??
    null

  const imgSrc =
    html.match(/<img[^>]+data-src=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1] ??
    null

  const srcsetCandidate = html.match(/<img[^>]+srcset=["']([^"']+)["'][^>]*>/i)?.[1] ?? null
  const firstSrcsetUrl = srcsetCandidate ? srcsetCandidate.split(',')[0]?.trim().split(' ')[0]?.trim() : null

  const imageUrl = pickBestImageCandidate(
    [ogImage, firstSrcsetUrl, imgSrc].map((v) => (typeof v === 'string' ? decodeHtmlAttr(v) : v)),
  )

  const vin =
    plainText.match(/\bVIN\b[\s:]*([A-HJ-NPR-Z0-9]{17})/i)?.[1] ??
    html.match(/"vehicleIdentificationNumber"\s*:\s*"([^"]{11,25})"/i)?.[1] ??
    null

  const cleanupValue = (value: string | null, maxWords: number): string | null => {
    if (!value) return null
    let out = value.replace(/\s+/g, ' ').trim()
    if (!out) return null

    // Cut off common trailing sections that get glued in plainText.
    const stopWords = [
      'код предложения',
      'код',
      'адрес стоянки',
      'адрес',
      'платеж',
      'аванс',
      'срок лизинга',
      'сумма договора',
      'налоговая экономия',
    ]
    const lowered = out.toLowerCase()
    let cutIndex = out.length
    for (const stop of stopWords) {
      const idx = lowered.indexOf(stop)
      if (idx >= 0) cutIndex = Math.min(cutIndex, idx)
    }
    out = out.slice(0, cutIndex).trim()

    // Cut at obvious separators.
    out = out.replace(/[|•·].*$/g, '').trim()

    const words = out.split(' ').filter(Boolean)
    if (words.length > maxWords) out = words.slice(0, maxWords).join(' ')

    return out || null
  }

  const bodyColor =
    plainText.match(/Цвет\s*кузова\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9 -]{3,40})/i)?.[1]?.trim() ??
    plainText.match(/Цвет\s*кузова\s+([A-Za-zА-Яа-яЁё0-9 -]{3,40})/i)?.[1]?.trim() ??
    plainText.match(/Цвет\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9 -]{3,40})/i)?.[1]?.trim() ??
    html.match(/"color"\s*:\s*"([^"]{3,40})"/i)?.[1]?.trim() ??
    null

  const transmission =
    plainText.match(/Трансмиссия\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9 -]{2,60})/i)?.[1]?.trim() ??
    plainText.match(/Трансмиссия\s+([A-Za-zА-Яа-яЁё0-9 -]{2,60})/i)?.[1]?.trim() ??
    html.match(/"vehicleTransmission"\s*:\s*"([^"]{2,60})"/i)?.[1]?.trim() ??
    null

  const drivetrain =
    plainText.match(/Тип\s*привода\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9xX -]{2,60})/i)?.[1]?.trim() ??
    plainText.match(/Тип\s*привода\s+([A-Za-zА-Яа-яЁё0-9xX -]{2,60})/i)?.[1]?.trim() ??
    html.match(/"driveWheelConfiguration"\s*:\s*"([^"]{2,60})"/i)?.[1]?.trim() ??
    null

  const engine =
    plainText.match(/Двигатель\s*[:-]\s*([A-Za-zА-Яа-яЁё0-9.,/ -]{2,80})/i)?.[1]?.trim() ??
    plainText.match(/Двигатель\s+([A-Za-zА-Яа-яЁё0-9.,/ -]{2,80})/i)?.[1]?.trim() ??
    html.match(/"vehicleEngine"[\s\S]{0,200}"name"\s*:\s*"([^"]{2,80})"/i)?.[1]?.trim() ??
    null

  const city =
    // Prefer patterns like: "2024 г. / 44530 км / Краснодар"
    plainText.match(/\b20\d{2}\s*г\.?\s*\/\s*[\d\s\u00A0]{2,}\s*(?:км|km)\s*\/\s*([А-Яа-яЁё -]{2,40})/i)?.[1]?.trim() ??
    plainText.match(/\b[\d\s\u00A0]{2,}\s*(?:км|km)\s*\/\s*([А-Яа-яЁё -]{2,40})/i)?.[1]?.trim() ??
    // Fallback: parse from <title> like "..., лизинг в г. Тюмень | ..."
    titleTag?.match(/в\s*г\.?\s*([А-Яа-яЁё -]{2,40})/i)?.[1]?.trim() ??
    titleTag?.match(/\bг\.\s*([А-Яа-яЁё -]{2,40})\s*\|/i)?.[1]?.trim() ??
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

async function enrichListingsFromDetailsViaBrowserPage(
  page: Page,
  listingsMap: Map<string, ScrapedListing>
): Promise<void> {
  const listings = [...listingsMap.values()].filter((l) => isListingDetailUrl(l.listing_url))

  let enrichedCount = 0
  for (let i = 0; i < listings.length; i += 1) {
    if (shutdownRequested) {
      console.log(`Shutdown requested, stopping enrichment after ${enrichedCount} listings`)
      break
    }

    const listing = listings[i]
    // Always visit detail page: get fresh price (track changes), authoritative photos (filter logos/bad images).
    try {
      await page.goto(listing.listing_url, { waitUntil: 'domcontentloaded' })
      await sleep(process.env.CI ? 800 : 1200)
      const html = await page.content()

      const jsonLd = extractJsonLdBlocks(html)
      const fromLd = extractDetailFromJsonLd(jsonLd)
      const fromHtml = extractDetailFromHtmlFallback(html)
      const details = {
        title: fromLd.title ?? fromHtml.title,
        price: fromLd.price ?? fromHtml.price,
        mileage: fromLd.mileage ?? fromHtml.mileage,
        year: fromLd.year ?? fromHtml.year,
        imageUrl: fromLd.imageUrl ?? fromHtml.imageUrl,
        vin: fromLd.vin ?? fromHtml.vin,
        engine: fromLd.engine ?? fromHtml.engine,
        transmission: fromLd.transmission ?? fromHtml.transmission,
        drivetrain: fromLd.drivetrain ?? fromHtml.drivetrain,
        bodyColor: fromLd.bodyColor ?? fromHtml.bodyColor,
        city: fromHtml.city,
      }

      // Keep the catalog title as the source of truth.
      // Detail pages sometimes return generic/support headings that look like text but are not the car name.
      if (details.price != null) listing.price = details.price
      if (details.mileage != null) listing.mileage = details.mileage
      if (details.year != null) listing.year = details.year
      const absoluteImage = toAbsoluteUrl(pickBestImageCandidate([details.imageUrl]))
      if (absoluteImage) listing.images = [absoluteImage]
      if (details.city && isPlausibleCity(details.city)) listing.city = details.city
      if (details.vin) listing.vin = details.vin
      if (details.engine) listing.engine = details.engine
      if (details.transmission) listing.transmission = details.transmission
      if (details.drivetrain) listing.drivetrain = details.drivetrain
      if (details.bodyColor) listing.body_color = details.bodyColor

      listingsMap.set(listing.external_id, listing)
      enrichedCount += 1

      console.log(
        `Enriched: ${listing.title} | Price: ${listing.price ?? 'NULL'} | Mileage: ${listing.mileage ?? 'NULL'} | Year: ${listing.year ?? 'NULL'} | City: ${listing.city ?? 'NULL'} | Color: ${listing.body_color ?? 'NULL'} | VIN: ${listing.vin ?? 'NULL'} | Image: ${listing.images[0] ?? 'NULL'}`
      )
    } catch (error) {
      if (isShutdownError(error)) {
        console.log(`Shutdown/cancel detected during enrichment, saving ${enrichedCount} enriched listings`)
        break
      }
      console.log(`Detail enrichment failed for ${listing.listing_url}:`, error)
    }

    const delayMin = Number(process.env.VTB_DETAIL_DELAY_MIN_MS ?? '400')
    const delayMax = Number(process.env.VTB_DETAIL_DELAY_MAX_MS ?? '900')
    await randomDelay(
      Number.isFinite(delayMin) && delayMin >= 0 ? delayMin : 400,
      Number.isFinite(delayMax) && delayMax >= 0 ? delayMax : 900
    )
  }
  console.log(`Detail enrichment completed: ${enrichedCount} / ${listings.length} rows enriched`)
}

async function closeUnexpectedPages(browser: Awaited<ReturnType<typeof puppeteer.launch>>, mainPage: Page): Promise<void> {
  const pages = await browser.pages()
  for (const openedPage of pages) {
    if (openedPage === mainPage) continue
    const url = openedPage.url()
    if (!isAllowedVtbUrl(url)) {
      // Close popup/disclosure tabs from third-party domains.
      await openedPage.close().catch(() => undefined)
    }
  }
}

const NAV_RETRY_ATTEMPTS = 3
const NAV_RETRY_DELAY_MS = 8000

/** Navigate with retries for transient timeouts (typical after long scraping). */
async function gotoWithRetry(
  page: Page,
  url: string,
  options: { timeout?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 120_000
  let lastErr: unknown
  for (let attempt = 1; attempt <= NAV_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      })
      return
    } catch (err) {
      lastErr = err
      if (isShutdownError(err)) throw err
      if (attempt < NAV_RETRY_ATTEMPTS && isTimeoutError(err)) {
        console.log(
          `Navigation timeout (attempt ${attempt}/${NAV_RETRY_ATTEMPTS}), retrying in ${NAV_RETRY_DELAY_MS / 1000}s...`,
        )
        await sleep(NAV_RETRY_DELAY_MS)
        continue
      }
      throw err
    }
  }
  throw lastErr
}

/**
 * Обновляет поля price / original_price для списка VTB‑лотoв с учётом истории цен в Supabase:
 * - если новая цена ниже прошлой — считаем это скидкой и сохраняем прошлую цену в original_price;
 * - если новая цена выше прошлой — просто поднимаем price и очищаем original_price;
 * - если цена не изменилась — переносим существующий original_price как есть.
 */
async function applyHistoricalPriceLogic(
  supabase: SupabaseClient,
  listings: ScrapedListing[],
): Promise<void> {
  if (listings.length === 0) return

  const externalIds = listings.map((l) => l.external_id)
  const { data: existingRows, error } = await supabase
    .from('listings')
    .select('external_id, price, original_price')
    .eq('source', SOURCE)
    .in('external_id', externalIds)

  if (error) {
    console.warn('Historical price lookup failed (non-fatal):', error.message)
    return
  }

  const byId = new Map<
    string,
    { external_id: string; price: number | string | null; original_price: number | string | null }
  >()
  for (const row of existingRows ?? []) {
    const r = row as { external_id?: string; price?: number | string | null; original_price?: number | string | null }
    if (!r.external_id) continue
    byId.set(r.external_id, {
      external_id: r.external_id,
      price: r.price ?? null,
      original_price: r.original_price ?? null,
    })
  }

  let discounts = 0
  let priceIncreases = 0
  let unchanged = 0

  for (const listing of listings) {
    const currentPrice = listing.price
    if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) {
      // Нет валидной текущей цены — историю не трогаем.
      continue
    }

    const prev = byId.get(listing.external_id)
    if (!prev) {
      // В БД ещё не было этой записи — никакой "старой" цены нет.
      listing.original_price = null
      continue
    }

    const prevPriceNum = prev.price != null ? Number(prev.price) : NaN
    const prevOriginalNum = prev.original_price != null ? Number(prev.original_price) : NaN

    if (!Number.isFinite(prevPriceNum) || prevPriceNum <= 0) {
      listing.original_price = Number.isFinite(prevOriginalNum) && prevOriginalNum > 0 ? prevOriginalNum : null
      continue
    }

    // Базовая "старая" цена: если в БД уже была original_price и она выше прошлой,
    // используем её, иначе — саму прошлую цену.
    const baselineOriginal = Number.isFinite(prevOriginalNum) && prevOriginalNum > prevPriceNum ? prevOriginalNum : prevPriceNum

    if (currentPrice < prevPriceNum) {
      // Цена снизилась: показываем скидку относительно базовой "старой" цены.
      listing.original_price = baselineOriginal
      discounts += 1
    } else if (currentPrice > prevPriceNum) {
      // Цена выросла: поднимаем цену и убираем "скидку".
      listing.original_price = null
      priceIncreases += 1
    } else {
      // Цена не изменилась: оставляем возможную старую цену как есть.
      listing.original_price = Number.isFinite(prevOriginalNum) && prevOriginalNum > 0 ? prevOriginalNum : listing.original_price
      unchanged += 1
    }
  }

  console.log(
    `Historical price logic (VTB): matched=${byId.size}, discounts=${discounts}, price_up=${priceIncreases}, unchanged=${unchanged}`,
  )
}

/** Обрабатывает одну секцию: каталог + обогащение. Браузер перезапускается между секциями для снижения OOM. */
async function scrapeOneSection(
  sectionIndex: number,
  maxPages: number
): Promise<ScrapedListing[]> {
  const isCI = !!process.env.CI
  const browser = await puppeteer.launch({
    headless: isCI,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      ...(isCI
        ? [
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-software-rasterizer',
          ]
        : []),
    ],
  })

  const page = await browser.newPage()
  await configurePageForStealth(page)
  browser.on('targetcreated', async (target) => {
    if (target.type() !== 'page') return
    const maybePage = await target.page()
    if (!maybePage || maybePage === page) return
    const url = maybePage.url()
    if (!isAllowedVtbUrl(url)) {
      await maybePage.close().catch(() => undefined)
    }
  })
  const navTimeout = Number(process.env.VTB_NAV_TIMEOUT_MS ?? '120000')
  page.setDefaultNavigationTimeout(Number.isFinite(navTimeout) && navTimeout > 0 ? navTimeout : 120_000)
  page.setDefaultTimeout(45_000)

  const collected = new Map<string, ScrapedListing>()
  const visitedPageUrls = new Set<string>()
  const interceptedApiRawCards = new Map<string, RawCard>()
  const MAX_API_PAYLOAD_BYTES = 2 * 1024 * 1024
  const onResponse = async (response: Awaited<ReturnType<Page['waitForResponse']>>) => {
    try {
      const responseUrl = response.url()
      if (!isAllowedVtbUrl(responseUrl)) return
      if (!/api|graphql|auto-market|market|catalog|cars/i.test(responseUrl)) return

      const contentType = response.headers()['content-type'] ?? ''
      if (!contentType.includes('application/json') && !/api|graphql/i.test(responseUrl)) return

      let payload: unknown
      try {
        const buf = await response.buffer()
        if (buf.length > MAX_API_PAYLOAD_BYTES) return
        payload = JSON.parse(buf.toString('utf-8'))
      } catch {
        return
      }

      const cards = extractRawCardsFromUnknownPayload(payload)
      if (cards.length > 0) {
        console.log(`API intercept: ${cards.length} candidate listings from ${responseUrl}`)
      }
      for (const card of cards) {
        if (!card.link) continue
        interceptedApiRawCards.set(card.link, card)
      }
    } catch {
      // Ignore non-JSON or blocked responses.
    }
  }
  page.on('response', onResponse)

  try {
    const currentSection = VTB_SECTIONS[sectionIndex]!
    if (shutdownRequested) {
      console.log('Shutdown requested')
      return []
    }
    console.log(
      `\n========== SECTION ${sectionIndex + 1}/${VTB_SECTIONS.length}: ${currentSection.category.toUpperCase()} ==========`,
    )
    console.log(`Start URL: ${currentSection.startUrl}`)
    interceptedApiRawCards.clear()
    visitedPageUrls.clear()
    let currentUrl: string | null = currentSection.startUrl
    let pageIndex = 0
    let emptyPagesInARow = 0

    while (currentUrl && pageIndex < maxPages) {
        if (shutdownRequested) break
        if (!isVtbCatalogUrl(currentUrl)) {
          throw new Error(`Blocked non-target URL before navigation: ${currentUrl}`)
        }
        if (visitedPageUrls.has(currentUrl)) break
        visitedPageUrls.add(currentUrl)
        pageIndex += 1

        const navigationUrl = pageIndex === 1 ? currentSection.startUrl : currentUrl
      console.log(`\n--- Page ${pageIndex}/${maxPages}: ${navigationUrl} ---`)
      try {
        await gotoWithRetry(page, navigationUrl)
      } catch (navErr) {
        if (isShutdownError(navErr)) {
          console.log('Navigation canceled (shutdown), proceeding to enrichment')
          break
        }
        throw navErr
      }
      const finalUrl = page.url()
      console.log(`Final URL after goto: ${finalUrl}`)
      if (!isVtbCatalogUrl(finalUrl)) {
        await page.screenshot({ path: 'debug-vtb.png', fullPage: true })
        throw new Error(`Blocked redirect outside target area: ${finalUrl}`)
      }
      await closeUnexpectedPages(browser, page)
      const catalogWaitMs = process.env.CI ? 3000 : 10_000
      await sleep(catalogWaitMs)
      await page.evaluate(
        `window.__VTB_SCROLL_PASSES = ${JSON.stringify(process.env.VTB_SCROLL_PASSES ?? '')}; window.__CI = ${!!process.env.CI}`
      )
      const html = await page.content()
      console.log('HTML length:', html.length)
      try {
        await waitForListingContainer(page)
      } catch {
        console.log(`No listings found on page ${pageIndex}, stopping pagination`)
        break
      }
      await humanReadDelay()
      await randomDelay(800, 1800)

      await autoScrollUntilStable(page)
      await randomDelay(300, 900)

      const hiddenJsonPayloads = await page.evaluate(() => {
        const payloads: string[] = []
        const jsonScripts = Array.from(
          document.querySelectorAll<HTMLScriptElement>('script[type="application/json"]')
        )
        for (const script of jsonScripts) {
          const text = script.textContent?.trim()
          if (text) payloads.push(text)
        }
        const globalState = (window as Record<string, unknown>).__INITIAL_STATE__
        if (globalState) {
          try {
            payloads.push(JSON.stringify(globalState))
          } catch {
            // ignore serialization errors
          }
        }
        return payloads
      })

      const hiddenCards: RawCard[] = []
      const MAX_JSON_BYTES = 3 * 1024 * 1024
      for (const payloadText of hiddenJsonPayloads) {
        if (payloadText.length > MAX_JSON_BYTES) continue
        try {
          const parsed = JSON.parse(payloadText)
          hiddenCards.push(...extractRawCardsFromUnknownPayload(parsed))
        } catch {
          // ignore invalid JSON blocks
        }
      }

      const sizeBefore = collected.size
      const domCards = await extractRawCardsFromPage(page)
      const rawCards = mergeRawCards([
        ...interceptedApiRawCards.values(),
        ...hiddenCards,
        ...domCards,
      ])
      for (const rawCard of rawCards) {
        const mapped = mapRawCardToListing(rawCard, currentSection.category)
        if (!mapped) continue
        console.log(
          `Found: ${mapped.title} | Price: ${mapped.price ?? 'NULL'} | Image: ${mapped.images[0] ?? 'NULL'} | URL: ${mapped.listing_url}`
        )
        collected.set(mapped.external_id, mapped)
      }

      const newOnThisPage = collected.size - sizeBefore
      console.log(`Page ${pageIndex}: +${newOnThisPage} unique on page (${collected.size} total; may overlap with DB)`)

      if (newOnThisPage === 0) {
        emptyPagesInARow += 1
        if (emptyPagesInARow >= 3) {
          console.log('3 consecutive pages with no new listings, stopping')
          break
        }
      } else {
        emptyPagesInARow = 0
      }

        let nextUrl = await extractNextPageUrl(page, currentUrl)
        if (!nextUrl || !isCatalogListUrl(nextUrl) || !isSameSection(nextUrl, currentSection.startUrl)) {
          nextUrl = buildNextPageUrl(currentUrl)
        }
        if (!isCatalogListUrl(nextUrl) || visitedPageUrls.has(nextUrl)) break

        currentUrl = nextUrl
        const pageDelayMin = process.env.CI ? 500 : 1200
        const pageDelayMax = process.env.CI ? 900 : 2500
        await randomDelay(pageDelayMin, pageDelayMax)
      }
    console.log(`Section ${currentSection.category} complete. Enriching ${collected.size} listings...`)
    await enrichListingsFromDetailsViaBrowserPage(page, collected)
    return [...collected.values()]
  } finally {
    page.off('response', onResponse)
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
  const scrapedIds = new Set<string>()
  const maxPagesRaw = Number(process.env.VTB_MAX_PAGES ?? '5')
  const maxPages = Number.isFinite(maxPagesRaw) && maxPagesRaw > 0 ? Math.floor(maxPagesRaw) : 5

  try {
    for (let sectionIndex = 0; sectionIndex < VTB_SECTIONS.length; sectionIndex += 1) {
      if (shutdownRequested) break
      const listings = await scrapeOneSection(sectionIndex, maxPages)
      for (const l of listings) scrapedIds.add(l.external_id)

      if (listings.length === 0) continue

      // Перед апсертом корректируем price/original_price на основе предыдущих значений в БД
      // (чтобы Mini App видела автоматические скидки при снижении цены).
      await applyHistoricalPriceLogic(supabase, listings)

      const enriched = listings.filter((l) => l.images.length > 0)
      console.log(`Section ${sectionIndex + 1}: upserting ${enriched.length} / ${listings.length} enriched`)

      if (enriched.length > 0) {
        const upsertPayload = enriched.map((listing) => {
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
          const { error } = await supabase
            .from('listings')
            .upsert(batch, { onConflict: 'external_id' })

          if (error) {
            if ((error as { code?: string }).code === 'PGRST204') {
              console.error(
                "Supabase schema cache doesn't include new columns yet. Apply migrations " +
                  "`202602150002_add_listing_specs.sql` and `202602220001_add_listing_category.sql` " +
                  "in Supabase SQL editor, then reload PostgREST schema (Dashboard: Settings -> API -> Reload schema)."
              )
            }
            throw error
          }
        }
        console.log(`Upserted ${enriched.length} listings from section ${sectionIndex + 1}`)
      }
    }

    console.log(`Total scraped: ${scrapedIds.size} unique listings`)

    const { data: skeletonDeleted, error: skeletonErr } = await supabase
      .from('listings')
      .delete()
      .eq('source', SOURCE)
      .is('price', null)
      .select('id')

    if (skeletonErr) {
      console.warn('Skeleton cleanup (non-fatal):', skeletonErr.message)
    } else if (skeletonDeleted?.length) {
      console.log(`Cleaned up ${skeletonDeleted.length} unenriched skeleton rows`)
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
          console.warn(`Sync cleanup warning: failed to remove old listings: ${removeErr.message}`)
          break
        }
      }
      console.log(`Removed ${toRemove.length} listings no longer on VTB (sync cleanup).`)
    }
  } catch (error) {
    console.error('Scraper failed:', error)
    process.exitCode = 1
  }
}

void run()
