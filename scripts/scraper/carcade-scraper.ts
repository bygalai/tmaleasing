/**
 * CARCADE (carcade.com) — б/у авто и техника с пробегом.
 * Каталог отдаётся в Next.js __NEXT_DATA__; карточка — position.used.used + attributes.
 * Пишет в listings (source='carcade', category как в Mini App).
 *
 * Env:
 *   CARCADE_MAX_PAGES — макс. страниц на секцию (0 = все из pageCnt)
 *   CARCADE_SECTIONS — через запятую slug (пусто = все секции). Если задан — синхронное удаление
 *       «лишних» строк в БД отключено (иначе снесло бы другие типы с source=carcade).
 *   CARCADE_DETAIL_DELAY_MS — пауза между детальными запросами (default 450)
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

dotenv.config({ path: resolve(process.cwd(), '.env') })

let shutdownRequested = false
process.on('SIGTERM', () => {
  shutdownRequested = true
  console.log('SIGTERM: завершим текущую секцию и сохраним результат')
})
process.on('SIGINT', () => {
  shutdownRequested = true
  console.log('SIGINT: завершим текущую секцию и сохраним результат')
})

const SOURCE = 'carcade'
const BASE = 'https://www.carcade.com'
const CATALOG_BASE = `${BASE}/avto_s_probegom`

/** Секции сайта → category Mini App (4 типа). ЛКТ и автобусы — в грузовые; мототехника — в легковые. */
const CARCADE_SECTIONS: Array<{ path: string; category: string }> = [
  { path: 'legkovye', category: 'legkovye' },
  { path: 'gruzovye', category: 'gruzovye' },
  { path: 'legkij_kommercheskij_transport', category: 'gruzovye' },
  { path: 'spectehnika', category: 'speztechnika' },
  { path: 'pritsepy_i_polupritsepy', category: 'pricepy' },
  { path: 'mototehnika', category: 'legkovye' },
  { path: 'avtobusy', category: 'gruzovye' },
]

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
}

const BAD_IMAGE_SUBSTRINGS = ['logo', 'favicon', 'sprite', 'icon', '1x1', 'pixel', 'cookie', 'telegram']

const TITLE_BLOCKLIST = new Set([
  'каталог',
  'carcade',
  'каркад',
  'лизинг',
  'автомобили с пробегом',
  'б/у',
])

const CITY_BLOCKLIST = new Set([
  'оборудование',
  'недвижимость',
  'подвижной состав',
  'объем',
  'пробег',
  'колёсная',
  'колесная',
  'двигатель',
  'кузов',
  'привод',
  'коробка',
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

type CatalogItem = {
  id: number
  brand?: string
  model?: string
  year?: number
  city?: string
  picture?: string
  price?: number
  oldPrice?: number | null
  attrs?: Array<{ title?: string; value?: string }>
}

// --- env (как у других скраперов) ---

function decodeEnvFile(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le')
  let zeroBytes = 0
  for (const byte of buffer) {
    if (byte === 0) zeroBytes += 1
  }
  if (buffer.length > 0 && zeroBytes / buffer.length > 0.2) return buffer.toString('utf16le')
  return buffer.toString('utf8')
}

function parseAndInjectEnv(filePath: string): void {
  if (!existsSync(filePath)) return
  const decoded = decodeEnvFile(readFileSync(filePath)).replace(/^\uFEFF/, '')
  for (const line of decoded.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i <= 0) continue
    const key = trimmed.slice(0, i).trim().replace(/\uFEFF/g, '').replaceAll('\u0000', '')
    const value = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, '').replaceAll('\u0000', '')
    if (key && process.env[key] === undefined) process.env[key] = value
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function normalizeNumber(input: string | null | undefined): number | null {
  if (!input) return null
  const digits = String(input).replace(/[\s\u00A0]/g, '').replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}

function parseYear(input: string | number | null | undefined): number | null {
  if (input == null) return null
  const s = String(input)
  const m = s.match(/\b(19\d{2}|20\d{2})\b/)
  if (!m) return null
  const y = Number(m[1])
  return y >= 1990 && y <= 2035 ? y : null
}

function buildExternalId(listingUrl: string): string {
  return createHash('sha256').update(listingUrl).digest('hex')
}

function buildListingUrl(id: number): string {
  return `${CATALOG_BASE}/${id}`
}

function sanitizeTitle(value: string | null | undefined): string {
  const fallback = 'Техника CARCADE'
  if (!value) return fallback
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : fallback
}

function isRealCarTitle(value: string | null | undefined): boolean {
  if (!value) return false
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length < 3 || normalized.length > 120) return false
  if (TITLE_BLOCKLIST.has(normalized.toLowerCase())) return false
  return /[A-Za-zА-Яа-я0-9]/.test(normalized)
}

function isBadImageCandidate(value: string | null | undefined): boolean {
  if (!value) return true
  const lowered = String(value).trim().toLowerCase()
  if (!lowered || lowered.startsWith('data:') || lowered.endsWith('.svg')) return true
  return BAD_IMAGE_SUBSTRINGS.some((p) => lowered.includes(p))
}

function toAbsoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const u = new URL(value.trim(), BASE)
    if (!u.hostname.includes('carcade.com')) return null
    return u.toString()
  } catch {
    return null
  }
}

function pickCityFromUsed(used: Record<string, unknown>): string | null {
  const loc = used.location as { city?: string } | undefined
  if (loc?.city && isPlausibleCity(loc.city)) return loc.city.trim()

  const parking = used.parking as Record<string, string | null> | undefined
  if (parking?.city) {
    const c = parking.city.replace(/^\s*г\.?\s*/i, '').trim()
    if (isPlausibleCity(c)) return c
  }

  const raw = typeof used.city === 'string' ? used.city : ''
  if (raw && isPlausibleCity(raw)) return raw.trim()

  const long = raw.replace(/\s+/g, ' ').trim()
  const m = long.match(/\bг\.?\s*([А-Яа-яЁё-]+)\b/)
  if (m?.[1] && isPlausibleCity(m[1])) return m[1]

  const m2 = long.match(/,\s*г\.?\s*([А-Яа-яЁё\s-]+?)(?:,|$)/i)
  if (m2?.[1]) {
    const city = m2[1].trim()
    if (isPlausibleCity(city)) return city
  }

  return null
}

function isPlausibleCity(value: string | null | undefined): boolean {
  if (!value) return false
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2 || cleaned.length > 60) return false
  if (/^\d/.test(cleaned)) return false
  if (/\d{6}/.test(cleaned)) return false
  const lowered = cleaned.toLowerCase()
  if (CITY_BLOCKLIST.has(lowered)) return false
  return true
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS, redirect: 'follow' })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function extractNextData(html: string): Record<string, unknown> | null {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    return JSON.parse(m[1]) as Record<string, unknown>
  } catch {
    return null
  }
}

function getCatalogSlice(data: Record<string, unknown> | null): {
  items: CatalogItem[]
  pageCnt: number
  totalCnt: number
} | null {
  if (!data) return null
  const props = data.props as Record<string, unknown> | undefined
  const pageProps = props?.pageProps as Record<string, unknown> | undefined
  const initial = pageProps?.initialState as Record<string, unknown> | undefined
  const useds = initial?.useds as Record<string, unknown> | undefined
  const items = (pageProps?.items ?? useds?.items) as CatalogItem[] | undefined
  if (!Array.isArray(items)) return null
  const pageCnt = Math.max(1, Number(useds?.pageCnt) || 1)
  const totalCnt = Number(useds?.totalCnt) || items.length
  return { items, pageCnt, totalCnt }
}

type AttrRow = { attributeName?: string; attributeValue?: string }

function normalizeAttrName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

function findAttrValue(attrs: AttrRow[], ...candidates: string[]): string | null {
  const lower = candidates.map((c) => c.toLowerCase())
  for (const a of attrs) {
    const n = a.attributeName ? normalizeAttrName(a.attributeName) : ''
    if (!n) continue
    for (const c of lower) {
      if (n === c || n.includes(c)) {
        const v = a.attributeValue?.replace(/\s+/g, ' ').trim()
        if (v) return v
      }
    }
  }
  return null
}

function catalogAttrsToMap(attrs: CatalogItem['attrs']): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of attrs ?? []) {
    const k = a.title?.replace(/\s+/g, ' ').trim().toLowerCase()
    const v = a.value?.replace(/\s+/g, ' ').trim()
    if (k && v) m.set(k, v)
  }
  return m
}

function mapSiteTypeToBodyHint(siteType: string | null, category: string): string | null {
  if (!siteType) return null
  const t = siteType.toLowerCase()
  if (category === 'pricepy') {
    if (t.includes('полуприцеп')) return 'Полуприцеп'
    if (t.includes('прицеп')) return 'Прицеп'
  }
  return null
}

function buildEngineString(hp: string | null, volCc: string | null, fuel: string | null): string | null {
  const parts: string[] = []
  if (hp) {
    const n = normalizeNumber(hp.replace(/л\.?\s*с\.?/i, ''))
    if (n != null) parts.push(`${n} л.с.`)
    else parts.push(hp.replace(/\s+/g, ' ').trim())
  }
  if (volCc) {
    const cc = normalizeNumber(volCc)
    if (cc != null && cc > 0) parts.push(`${cc} см³`)
    else parts.push(volCc)
  }
  if (fuel) parts.push(fuel)
  const out = parts.join(', ').replace(/^,\s*|,\s*$/g, '').trim()
  return out || null
}

function parseDetailToListing(
  html: string,
  card: CatalogItem,
  category: string,
  listingUrl: string,
): ScrapedListing | null {
  const data = extractNextData(html)
  const props = data?.props as Record<string, unknown> | undefined
  const pageProps = props?.pageProps as Record<string, unknown> | undefined
  const position = pageProps?.position as Record<string, unknown> | undefined
  const usedWrap = position?.used as Record<string, unknown> | undefined
  const used = (usedWrap?.used ?? usedWrap) as Record<string, unknown> | undefined

  const brand = (typeof used?.brand === 'string' ? used.brand : card.brand) ?? ''
  const model = (typeof used?.model === 'string' ? used.model : card.model) ?? ''
  const title = sanitizeTitle(`${brand} ${model}`.trim())
  if (!isRealCarTitle(title)) return null

  const priceRaw = used?.price ?? card.price
  const price = typeof priceRaw === 'number' && priceRaw >= 100_000 ? priceRaw : null
  if (price == null) return null

  const oldRaw = used?.oldPrice ?? card.oldPrice
  const original_price =
    typeof oldRaw === 'number' && Number.isFinite(oldRaw) && oldRaw > price && oldRaw < price * 2.5
      ? Math.round(oldRaw)
      : null

  const attrs = (used?.attributes as AttrRow[]) ?? []

  const mileageStr =
    findAttrValue(attrs, 'пробег', 'наработка') ??
    catalogAttrsToMap(card.attrs).get('пробег') ??
    catalogAttrsToMap(card.attrs).get('наработка')
  const mileage = normalizeNumber(mileageStr ?? '')

  const year =
    parseYear(used?.year) ??
    parseYear(findAttrValue(attrs, 'год', 'год выпуска')) ??
    (typeof card.year === 'number' ? card.year : null)

  const vinRaw = findAttrValue(attrs, 'vin', 'вин')
  let vin: string | null = null
  if (vinRaw && /^[A-HJ-NPR-Z0-9]{17}$/i.test(vinRaw.replace(/\s/g, ''))) {
    vin = vinRaw.replace(/\s/g, '').toUpperCase()
  }

  const body_color =
    findAttrValue(attrs, 'цвет кузова', 'цвет', 'цвет техники')?.replace(/\s+/g, ' ').trim() ?? null

  const transmission =
    findAttrValue(attrs, 'кпп', 'трансмиссия', 'коробка передач') ??
    catalogAttrsToMap(card.attrs).get('трансмиссия') ??
    null

  const drivetrain =
    findAttrValue(attrs, 'привод', 'тип привода', 'колёсная формула', 'колесная формула', 'формула') ?? null

  const hp = findAttrValue(attrs, 'мощность', 'мощность, л.с.', 'мощность л.с.')
  const volCc = findAttrValue(attrs, 'рабочий объём', 'рабочий объем', 'объем', 'объём', 'см3', 'см³')
  const fuel = findAttrValue(attrs, 'топливо', 'вид топлива', 'тип топлива')
  const engine = buildEngineString(hp, volCc, fuel)

  const bodyFromAttr = findAttrValue(attrs, 'тип кузова', 'тип техники', 'категория тс', 'тип тс')
  const siteType = typeof used?.type === 'string' ? used.type : null
  const body_type =
    bodyFromAttr?.replace(/\s+/g, ' ').trim() ||
    mapSiteTypeToBodyHint(siteType, category) ||
    null

  const pictures = Array.isArray(used?.pictures) ? (used.pictures as string[]) : []
  const imgs: string[] = []
  const seen = new Set<string>()
  for (const p of pictures) {
    const abs = toAbsoluteUrl(p)
    if (!abs || isBadImageCandidate(abs)) continue
    if (seen.has(abs)) continue
    seen.add(abs)
    imgs.push(abs)
  }
  if (imgs.length === 0) {
    const one = toAbsoluteUrl(typeof used?.picture === 'string' ? used.picture : card.picture)
    if (one && !isBadImageCandidate(one)) imgs.push(one)
  }
  if (imgs.length === 0) {
    imgs.push('https://dummyimage.com/1200x800/1f2937/e5e7eb&text=Vehicle+Photo+Pending')
  }

  const city = pickCityFromUsed(used) ?? (card.city && isPlausibleCity(card.city) ? card.city.trim() : null)

  return {
    external_id: buildExternalId(listingUrl),
    title,
    price,
    original_price,
    mileage,
    year,
    images: imgs,
    listing_url: listingUrl,
    source: SOURCE,
    category,
    city,
    vin,
    engine,
    transmission,
    drivetrain,
    body_color,
    body_type,
  }
}

function listingFromCardOnly(card: CatalogItem, category: string, listingUrl: string): ScrapedListing | null {
  const title = sanitizeTitle(`${card.brand ?? ''} ${card.model ?? ''}`.trim())
  if (!isRealCarTitle(title)) return null
  const price = typeof card.price === 'number' && card.price >= 100_000 ? card.price : null
  if (price == null) return null
  const map = catalogAttrsToMap(card.attrs)
  const mileage = normalizeNumber(map.get('пробег') ?? map.get('наработка') ?? '')
  const year = typeof card.year === 'number' ? card.year : parseYear(map.get('год'))
  const transmission = map.get('трансмиссия') ?? map.get('кпп') ?? null
  const img = toAbsoluteUrl(card.picture)
  const images =
    img && !isBadImageCandidate(img)
      ? [img]
      : ['https://dummyimage.com/1200x800/1f2937/e5e7eb&text=Vehicle+Photo+Pending']
  const old = typeof card.oldPrice === 'number' ? card.oldPrice : null
  const original_price =
    old != null && old > price && old < price * 2.5 ? Math.round(old) : null

  return {
    external_id: buildExternalId(listingUrl),
    title,
    price,
    original_price,
    mileage,
    year,
    images,
    listing_url: listingUrl,
    source: SOURCE,
    category,
    city: card.city && isPlausibleCity(card.city) ? card.city.trim() : null,
    vin: null,
    engine: null,
    transmission,
    drivetrain: null,
    body_color: null,
    body_type: null,
  }
}

function sectionCatalogUrl(sectionPath: string, page: number): string {
  const slug = sectionPath.replace(/^\//, '').replace(/\/$/, '')
  const basePath = slug ? `${CATALOG_BASE}/${slug}` : CATALOG_BASE
  if (page <= 1) return basePath
  return `${basePath}?page=${page}`
}

async function fetchListingPage(sectionPath: string, page: number): Promise<string | null> {
  return fetchWithTimeout(sectionCatalogUrl(sectionPath, page), 45_000)
}

/** sectionPath без префикса: legkovye, gruzovye, ... */
async function scrapeSection(
  sectionPath: string,
  category: string,
  maxPagesLimit: number,
  detailDelayMs: number,
): Promise<ScrapedListing[]> {
  const listings: ScrapedListing[] = []
  const firstHtml = await fetchListingPage(sectionPath, 1)
  if (!firstHtml || firstHtml.length < 500) {
    console.warn(`  [${sectionPath}] пустой ответ на 1-ю страницу`)
    return listings
  }

  const slice = getCatalogSlice(extractNextData(firstHtml))
  if (!slice || slice.items.length === 0) {
    console.log(`  [${sectionPath}] нет объявлений в каталоге`)
    return listings
  }

  let pageCnt = slice.pageCnt
  if (maxPagesLimit > 0) pageCnt = Math.min(pageCnt, maxPagesLimit)

  console.log(
    `  [${sectionPath}] ~${slice.totalCnt} объявлений, страниц: ${slice.pageCnt}` +
      (maxPagesLimit > 0 ? ` (ограничено ${pageCnt})` : ''),
  )

  const seenIds = new Set<number>()

  for (let page = 1; page <= pageCnt; page += 1) {
    if (shutdownRequested) break

    const html = page === 1 ? firstHtml : await fetchListingPage(sectionPath, page)
    if (!html) {
      console.warn(`  [${sectionPath}] страница ${page}: нет ответа`)
      continue
    }

    const data = extractNextData(html)
    const sliceP = getCatalogSlice(data)
    const items = sliceP?.items ?? []
    if (items.length === 0) {
      console.log(`  [${sectionPath}] страница ${page}: 0 карточек — стоп`)
      break
    }

    for (const card of items) {
      if (shutdownRequested) break
      const id = card.id
      if (typeof id !== 'number' || seenIds.has(id)) continue
      seenIds.add(id)

      const listingUrl = buildListingUrl(id)
      const detailHtml = await fetchWithTimeout(listingUrl, 35_000)
      let listing: ScrapedListing | null = null
      if (detailHtml && detailHtml.length > 3000) {
        listing = parseDetailToListing(detailHtml, card, category, listingUrl)
      }
      if (!listing) {
        listing = listingFromCardOnly(card, category, listingUrl)
      }
      if (listing) {
        listings.push(listing)
        if (listings.length % 50 === 0) {
          console.log(`  [${sectionPath}] собрано ${listings.length} (последний id ${id})`)
        }
      }

      await sleep(detailDelayMs)
    }

    if (page < pageCnt) await sleep(200 + Math.floor(Math.random() * 400))
  }

  return listings
}

async function applyHistoricalPriceLogic(supabase: SupabaseClient, listings: ScrapedListing[]): Promise<void> {
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
      console.warn(`Historical price batch: ${error.message}`)
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

  const matchedById = byId.size
  const listingsWithoutHistory = listings.filter((l) => !byId.has(l.external_id) && l.vin)
  const vinToListing = new Map<string, ScrapedListing>()
  const vinSet = new Set<string>()
  for (const l of listingsWithoutHistory) {
    const v = l.vin?.trim().toUpperCase()
    if (!v) continue
    vinSet.add(v)
    vinToListing.set(v, l)
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
        console.warn('Historical VIN lookup:', vinErr.message)
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

    if (listing.original_price != null && listing.original_price > currentPrice) continue

    const prev = byId.get(listing.external_id)
    if (!prev) {
      if (listing.original_price == null) listing.original_price = null
      continue
    }

    const prevPriceNum = prev.price != null ? Number(prev.price) : NaN
    const prevOriginalNum = prev.original_price != null ? Number(prev.original_price) : NaN

    if (!Number.isFinite(prevPriceNum) || prevPriceNum <= 0) {
      listing.original_price =
        Number.isFinite(prevOriginalNum) && prevOriginalNum > 0 ? prevOriginalNum : listing.original_price
      continue
    }

    const baselineOriginal =
      Number.isFinite(prevOriginalNum) && prevOriginalNum > prevPriceNum ? prevOriginalNum : prevPriceNum

    if (currentPrice < prevPriceNum) {
      listing.original_price = baselineOriginal
      discounts += 1
    } else if (currentPrice > prevPriceNum) {
      listing.original_price = null
      priceIncreases += 1
    } else {
      listing.original_price =
        Number.isFinite(prevOriginalNum) && prevOriginalNum > 0 ? prevOriginalNum : listing.original_price
      unchanged += 1
    }
  }

  console.log(
    `CARCADE historical: matched=${byId.size} (ids=${matchedById}, vin=${vinMatched}), ↓${discounts} ↑${priceIncreases} =${unchanged}`,
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

async function run(): Promise<void> {
  ensureEnvLoaded()
  const { url: supabaseUrl, key: supabaseKey } = resolveSupabaseCredentials()

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Нужны SUPABASE_URL и ключ (SUPABASE_SERVICE_ROLE_KEY или SUPABASE_KEY / VITE_SUPABASE_ANON_KEY).',
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const maxPagesRaw = Number(process.env.CARCADE_MAX_PAGES ?? '0')
  const maxPagesLimit = Number.isFinite(maxPagesRaw) && maxPagesRaw > 0 ? maxPagesRaw : 0

  const sectionFilter = (process.env.CARCADE_SECTIONS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  const sections =
    sectionFilter.length > 0
      ? CARCADE_SECTIONS.filter((s) => sectionFilter.includes(s.path.toLowerCase()))
      : CARCADE_SECTIONS

  if (sections.length === 0) {
    console.error('CARCADE_SECTIONS не совпал ни с одной секцией.')
    process.exitCode = 1
    return
  }

  const detailDelayMs = Math.max(200, Number(process.env.CARCADE_DETAIL_DELAY_MS ?? '450') || 450)

  const allIds = new Set<string>()

  try {
    for (const section of sections) {
      if (shutdownRequested) break
      console.log(`\n=== CARCADE: ${section.path} → ${section.category} ===`)

      const listings = await scrapeSection(section.path, section.category, maxPagesLimit, detailDelayMs)
      console.log(`  собрано черновиков: ${listings.length}`)

      if (listings.length === 0) continue

      await applyHistoricalPriceLogic(supabase, listings)

      const BATCH = 200
      for (let i = 0; i < listings.length; i += BATCH) {
        await upsertListingsBatch(supabase, listings.slice(i, i + BATCH))
      }

      for (const l of listings) allIds.add(l.external_id)
      console.log(`  upsert: ${listings.length} шт.`)
    }

    if (allIds.size === 0) {
      console.log('Нет объявлений — очистка пропущена.')
      return
    }

    const fullCatalogRun = sectionFilter.length === 0
    if (!fullCatalogRun) {
      console.log('CARCADE_SECTIONS задан — удаление снятых с продажи лотов пропущено (полный прогон без фильтра).')
    } else {
      const { data: existingRows } = await supabase.from('listings').select('external_id').eq('source', SOURCE)
      const toRemove = (existingRows ?? [])
        .map((r) => (r as { external_id?: string }).external_id)
        .filter((id): id is string => !!id && !allIds.has(id))

      if (toRemove.length > 0) {
        const REMOVE_BATCH = 500
        for (let i = 0; i < toRemove.length; i += REMOVE_BATCH) {
          const batch = toRemove.slice(i, i + REMOVE_BATCH)
          const { error: removeErr } = await supabase.from('listings').delete().eq('source', SOURCE).in('external_id', batch)
          if (removeErr) {
            console.warn(`Очистка: ${removeErr.message}`)
            break
          }
        }
        console.log(`Удалено устаревших записей CARCADE: ${toRemove.length}`)
      }
    }

    console.log(`\nГотово. Уникальных external_id в прогоне: ${allIds.size}`)
  } catch (e) {
    console.error('CARCADE scraper failed:', e)
    process.exitCode = 1
  }
}

void run()
