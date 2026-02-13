import { Pool } from 'pg'
import type { InternalListing, PublicListing } from './models.js'
import { estimateMarket } from './parsing.js'

export type CacheBundle = {
  updatedAt: string
  publicItems: PublicListing[]
  internalItems: InternalListing[]
}

type PriceStats = {
  low: number
  avg: number
  high: number
}

const CACHE_TTL_MS = 20 * 60 * 1000

const globalState = globalThis as typeof globalThis & {
  __gonkaPool?: Pool
  __gonkaMemoryBundle?: CacheBundle
  __gonkaCacheExpiresAt?: number
}

function getPool() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) return undefined
  if (!globalState.__gonkaPool) {
    globalState.__gonkaPool = new Pool({ connectionString: databaseUrl })
  }
  return globalState.__gonkaPool
}

export async function getDatabaseHealth(): Promise<{
  enabled: boolean
  connected: boolean
  listingsCurrent: number
  priceHistory: number
  error?: string
}> {
  const pool = getPool()
  if (!pool) {
    return {
      enabled: false,
      connected: false,
      listingsCurrent: 0,
      priceHistory: 0,
    }
  }

  try {
    await ensureSchema(pool)
    const current = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM listings_current')
    const history = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM listing_price_history',
    )
    return {
      enabled: true,
      connected: true,
      listingsCurrent: Number(current.rows[0]?.count ?? 0),
      priceHistory: Number(history.rows[0]?.count ?? 0),
    }
  } catch (error) {
    return {
      enabled: true,
      connected: false,
      listingsCurrent: 0,
      priceHistory: 0,
      error: error instanceof Error ? error.message : 'Database health check failed',
    }
  }
}

async function ensureSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS listings_current (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      price_rub BIGINT NOT NULL,
      year INTEGER NULL,
      mileage_km INTEGER NULL,
      location TEXT NULL,
      image_url TEXT NOT NULL,
      image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      detail_url TEXT NOT NULL,
      description TEXT NOT NULL,
      badges JSONB NOT NULL,
      discount_percent INTEGER NULL,
      source JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS listing_price_history (
      id BIGSERIAL PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES listings_current(id) ON DELETE CASCADE,
      price_rub BIGINT NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_listing_price_history_listing_time
    ON listing_price_history(listing_id, recorded_at DESC);
  `)

  await pool.query(`
    ALTER TABLE listings_current
    ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
  `)
}

function toProxyImageUrl(rawUrl: string | undefined, providerUrl: string): string {
  const normalized = (() => {
    const raw = rawUrl?.trim()
    if (!raw) return undefined
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('//')) return `https:${raw}`
    if (raw.startsWith('/')) {
      try {
        return new URL(raw, providerUrl).toString()
      } catch {
        return undefined
      }
    }
    return undefined
  })()

  return normalized ? `/api/image?src=${encodeURIComponent(normalized)}` : '/api/image'
}

function toPublicItem(item: InternalListing, stats?: PriceStats): PublicListing {
  const market = stats
    ? {
        marketLowRub: stats.low,
        marketAvgRub: stats.avg,
        marketHighRub: stats.high,
      }
    : estimateMarket(item.priceRub)

  const normalizedGallery = item.imageUrls
    .map((url) => toProxyImageUrl(url, item.source.providerUrl))
    .filter(Boolean)
  const imageUrl = toProxyImageUrl(item.imageUrl, item.source.providerUrl)
  const primaryImage = normalizedGallery[0] ?? imageUrl

  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    priceRub: item.priceRub,
    marketLowRub: market.marketLowRub,
    marketAvgRub: market.marketAvgRub,
    marketHighRub: market.marketHighRub,
    year: item.year,
    mileageKm: item.mileageKm,
    location: item.location,
    imageUrl: primaryImage,
    imageUrls: [primaryImage],
    detailUrl: 'https://t.me/GONKACONFBOT',
    description: item.description,
    badges: item.badges,
    discountPercent: item.discountPercent,
  }
}

type SaveStats = {
  total: number
  saved: number
  failed: number
}

async function saveToDatabase(pool: Pool, items: InternalListing[]): Promise<SaveStats> {
  await ensureSchema(pool)
  const client = await pool.connect()
  let saved = 0
  let failed = 0

  try {
    console.info(`[db-save] start total=${items.length}`)

    for (const item of items) {
      console.info(
        `[db-save] item start id=${item.id} provider=${item.source.providerId} price=${item.priceRub}`,
      )
      try {
        await client.query(
          `
          INSERT INTO listings_current (
            id, title, subtitle, price_rub, year, mileage_km, location,
            image_url, image_urls, detail_url, description, badges, discount_percent, source, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            subtitle = EXCLUDED.subtitle,
            price_rub = EXCLUDED.price_rub,
            year = EXCLUDED.year,
            mileage_km = EXCLUDED.mileage_km,
            location = EXCLUDED.location,
            image_url = EXCLUDED.image_url,
            image_urls = EXCLUDED.image_urls,
            detail_url = EXCLUDED.detail_url,
            description = EXCLUDED.description,
            badges = EXCLUDED.badges,
            discount_percent = EXCLUDED.discount_percent,
            source = EXCLUDED.source,
            updated_at = NOW();
          `,
          [
            item.id,
            item.title,
            item.subtitle,
            item.priceRub,
            item.year ?? null,
            item.mileageKm ?? null,
            item.location ?? null,
            item.imageUrl,
            JSON.stringify(item.imageUrls),
            item.detailUrl,
            item.description,
            JSON.stringify(item.badges),
            item.discountPercent ?? null,
            JSON.stringify(item.source),
          ],
        )
        console.info(`[db-save] item upsert ok id=${item.id}`)

        await client.query(
          `
          INSERT INTO listing_price_history (listing_id, price_rub)
          SELECT $1, $2
          WHERE COALESCE(
            (SELECT price_rub
             FROM listing_price_history
             WHERE listing_id = $1
             ORDER BY recorded_at DESC
             LIMIT 1),
            -1
          ) <> $2
          `,
          [item.id, item.priceRub],
        )
        console.info(`[db-save] item history ok id=${item.id}`)
        saved += 1
      } catch (error) {
        failed += 1
        const message = error instanceof Error ? error.message : 'Unknown DB write error'
        console.error(
          `[db-save] item failed id=${item.id} provider=${item.source.providerId} message=${message}`,
        )
      }
    }
  } finally {
    client.release()
  }

  console.info(`[db-save] done total=${items.length} saved=${saved} failed=${failed}`)
  return { total: items.length, saved, failed }
}

async function loadFromDatabase(pool: Pool): Promise<CacheBundle | null> {
  await ensureSchema(pool)
  const listingsResult = await pool.query<{
    id: string
    title: string
    subtitle: string
    price_rub: string
    year: number | null
    mileage_km: number | null
    location: string | null
    image_url: string
    image_urls: unknown
    detail_url: string
    description: string
    badges: string[]
    discount_percent: number | null
    source: InternalListing['source']
    updated_at: string
  }>(
    `
    SELECT
      id, title, subtitle, price_rub, year, mileage_km, location,
      image_url, image_urls, detail_url, description, badges, discount_percent, source, updated_at
    FROM listings_current
    ORDER BY price_rub DESC
    LIMIT 150;
    `,
  )

  if (listingsResult.rows.length === 0) {
    return null
  }

  const historyResult = await pool.query<{ listing_id: string; low: string; avg: string; high: string }>(
    `
    SELECT
      listing_id,
      MIN(price_rub)::bigint::text AS low,
      ROUND(AVG(price_rub))::bigint::text AS avg,
      MAX(price_rub)::bigint::text AS high
    FROM listing_price_history
    WHERE recorded_at >= NOW() - INTERVAL '180 days'
    GROUP BY listing_id;
    `,
  )

  const statsMap = new Map<string, PriceStats>()
  historyResult.rows.forEach((row) => {
    statsMap.set(row.listing_id, {
      low: Number(row.low),
      avg: Number(row.avg),
      high: Number(row.high),
    })
  })

  const internalItems: InternalListing[] = listingsResult.rows.map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    priceRub: Number(row.price_rub),
    marketLowRub: 0,
    marketAvgRub: 0,
    marketHighRub: 0,
    year: row.year ?? undefined,
    mileageKm: row.mileage_km ?? undefined,
    location: row.location ?? undefined,
    imageUrl: row.image_url,
    imageUrls: Array.isArray(row.image_urls)
      ? row.image_urls.filter((value): value is string => typeof value === 'string')
      : [],
    detailUrl: row.detail_url,
    description: row.description,
    badges: row.badges,
    discountPercent: row.discount_percent ?? undefined,
    source: row.source,
  }))

  const publicItems = internalItems.map((item) => toPublicItem(item, statsMap.get(item.id)))
  return {
    updatedAt: new Date().toISOString(),
    internalItems,
    publicItems,
  }
}

export async function writeListings(items: InternalListing[]): Promise<CacheBundle> {
  const updatedAt = new Date().toISOString()
  const pool = getPool()

  const memoryBundle: CacheBundle = {
    updatedAt,
    internalItems: items,
    publicItems: items.map((item) => toPublicItem(item)),
  }

  globalState.__gonkaMemoryBundle = memoryBundle
  globalState.__gonkaCacheExpiresAt = Date.now() + CACHE_TTL_MS

  if (!pool) {
    return memoryBundle
  }

  try {
    const saveStats = await saveToDatabase(pool, items)
    if (saveStats.saved === 0) {
      console.warn('[db-save] no items persisted, returning memory cache fallback')
    }
    const fromDb = await loadFromDatabase(pool)
    return fromDb ?? memoryBundle
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB persistence error'
    console.error(`[db-save] fatal error message=${message}`)
    return memoryBundle
  }
}

export async function readListings(): Promise<CacheBundle | null> {
  const now = Date.now()
  if (
    globalState.__gonkaMemoryBundle &&
    globalState.__gonkaCacheExpiresAt &&
    globalState.__gonkaCacheExpiresAt > now
  ) {
    return globalState.__gonkaMemoryBundle
  }

  const pool = getPool()
  if (!pool) {
    return globalState.__gonkaMemoryBundle ?? null
  }

  try {
    const fromDb = await loadFromDatabase(pool)
    if (!fromDb) return globalState.__gonkaMemoryBundle ?? null

    globalState.__gonkaMemoryBundle = fromDb
    globalState.__gonkaCacheExpiresAt = now + CACHE_TTL_MS
    return fromDb
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB read error'
    console.error(`[db-read] failed message=${message}`)
    return globalState.__gonkaMemoryBundle ?? null
  }
}
