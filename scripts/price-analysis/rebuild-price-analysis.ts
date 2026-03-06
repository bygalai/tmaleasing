import 'dotenv/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type ListingRow = {
  id: string
  title: string
  price: string | number | null
  mileage: string | number | null
  year: number | null
  category: string | null
  engine: string | null
}

type AnalysisRow = {
  listing_id: string
  model_key: string
  market_low: number
  market_avg: number
  market_high: number
  sample_size: number
}

type ModelSample = {
  id: string
  price: number
  year: number | null
  mileage: number | null
  horsepower: number | null
  category: string | null
}

function getEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var ${name}`)
  }
  return value
}

function createSupabaseClient(): SupabaseClient {
  const url =
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    null
  const key =
    process.env.SUPABASE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    null

  if (!url || !key) {
    throw new Error(
      'Missing Supabase credentials. Set SUPABASE_URL + SUPABASE_KEY (or compatible VITE_SUPABASE_*/NEXT_PUBLIC_SUPABASE_* envs).',
    )
  }

  return createClient(url, key)
}

function normalizeModelKey(title: string | null): string | null {
  if (!title) return null
  let t = title.toLowerCase()
  t = t.replace(/["«»]/g, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  if (!t) return null

  const genericPrefixes = ['новый', 'подержанный', 'автомобиль', 'авто', 'легковой', 'грузовой']
  const parts = t.split(' ')
  if (parts.length >= 2 && genericPrefixes.includes(parts[0])) {
    parts.shift()
  }
  if (parts.length === 0) return null

  const modelParts = parts.slice(0, 2)
  const key = modelParts.join(' ').trim()
  return key || null
}

function extractHorsepower(engine: string | null): number | null {
  if (!engine) return null
  const match = engine.match(/(\d[\d\s]*)\s*л\.\s*с\./i)
  if (!match) return null
  const raw = match[1].replace(/\s+/g, '')
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const clampedQ = Math.min(1, Math.max(0, q))
  const pos = (sorted.length - 1) * clampedQ
  const base = Math.floor(pos)
  const rest = pos - base
  const baseValue = sorted[base]
  const nextValue = sorted[base + 1]
  if (nextValue === undefined) return baseValue
  return baseValue + rest * (nextValue - baseValue)
}

function buildAnalysisForModel(modelKey: string, samples: ModelSample[]): AnalysisRow[] {
  if (samples.length === 0) return []

  const byId: AnalysisRow[] = []

  // Глобальная медиана по модели (используем как baseline, если по конкретной комплектации мало аналогов).
  const allPrices = samples.map((s) => s.price).sort((a, b) => a - b)
  const globalMedian = quantile(allPrices, 0.5)

  for (const current of samples) {
    // Базовый набор — все по модели.
    let candidates = samples

    // 1) Фильтр по году, если он есть хотя бы у части записей.
    const targetYear = current.year
    if (targetYear) {
      const withYear = samples.filter((s) => s.year != null)
      if (withYear.length >= 8) {
        const byYear = samples.filter(
          (s) => s.year != null && Math.abs((s.year as number) - targetYear) <= 2,
        )
        if (byYear.length >= 5) candidates = byYear
      }
    }

    // 2) Фильтр по пробегу.
    const targetMileage = current.mileage
    if (targetMileage && targetMileage > 0) {
      const byMileage = candidates.filter((s) => {
        if (!s.mileage || s.mileage <= 0) return false
        const m1 = targetMileage
        const m2 = s.mileage
        const ratio = m2 / m1
        const diff = Math.abs(m1 - m2)
        return ratio >= 0.5 && ratio <= 2 && diff <= 80_000
      })
      if (byMileage.length >= 5) candidates = byMileage
    }

    // 3) Фильтр по мощности двигателя (если хватает данных).
    const targetHp = current.horsepower
    if (targetHp && targetHp > 0) {
      const hpAware = candidates.filter((s) => s.horsepower && s.horsepower > 0)
      if (hpAware.length >= 8) {
        const byHp = hpAware.filter((s) => {
          const h2 = s.horsepower as number
          const ratio = h2 / targetHp
          const diff = Math.abs(targetHp - h2)
          return ratio >= 0.7 && ratio <= 1.3 && diff <= 60
        })
        if (byHp.length >= 5) candidates = byHp
        else candidates = hpAware
      }
    }

    if (candidates.length < 5) {
      // Недостаточно данных для честного анализа — не пишем строку в таблицу.
      continue
    }

    const prices = candidates.map((s) => s.price).sort((a, b) => a - b)
    const p25 = quantile(prices, 0.25)
    const median = quantile(prices, 0.5)
    const p75 = quantile(prices, 0.75)

    const base = median || globalMedian || current.price
    if (!base || base <= 0) continue

    const lowClamp = base * 0.85
    const highClamp = base * 1.15

    const marketLow = Math.round(Math.max(Math.min(p25, base), lowClamp))
    const marketAvg = Math.round(base)
    const marketHigh = Math.round(Math.min(Math.max(p75, base), highClamp))

    byId.push({
      listing_id: current.id,
      model_key: modelKey,
      market_low: marketLow,
      market_avg: marketAvg,
      market_high: marketHigh,
      sample_size: candidates.length,
    })
  }

  return byId
}

async function fetchAllListings(supabase: SupabaseClient): Promise<ListingRow[]> {
  const pageSize = 1000
  let from = 0
  const all: ListingRow[] = []

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('listings')
      .select('id,title,price,mileage,year,category,engine')
      .not('price', 'is', null)
      .range(from, to)

    if (error) throw error
    const batch = (data ?? []) as ListingRow[]
    all.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }

  return all
}

async function main() {
  // Simple smoke‑check.
  getEnv('SUPABASE_URL')
  getEnv('SUPABASE_KEY')

  const supabase = createSupabaseClient()

  console.log('Fetching listings for price analysis…')
  const rows = await fetchAllListings(supabase)
  console.log(`Loaded ${rows.length} listings`)

  const byModel = new Map<string, ModelSample[]>()

  for (const row of rows) {
    const priceRaw = row.price
    if (priceRaw === null || priceRaw === undefined) continue
    const price = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw)
    if (!Number.isFinite(price) || price <= 0) continue

    const modelKey = normalizeModelKey(row.title)
    if (!modelKey) continue

    const hp = extractHorsepower(row.engine)

    const sample: ModelSample = {
      id: row.id,
      price,
      year: row.year,
      mileage: row.mileage ?? null,
      horsepower: hp,
      category: row.category,
    }

    const list = byModel.get(modelKey) ?? []
    list.push(sample)
    byModel.set(modelKey, list)
  }

  const allAnalysis: AnalysisRow[] = []

  for (const [modelKey, samples] of byModel.entries()) {
    if (samples.length < 8) continue
    const rowsForModel = buildAnalysisForModel(modelKey, samples)
    allAnalysis.push(...rowsForModel)
  }

  console.log(`Computed analysis for ${allAnalysis.length} listings`)

  if (allAnalysis.length === 0) {
    console.log('Nothing to upsert, exiting.')
    return
  }

  // Upsert batched to avoid row limits.
  const batchSize = 500
  for (let i = 0; i < allAnalysis.length; i += batchSize) {
    const batch = allAnalysis.slice(i, i + batchSize)
    const { error } = await supabase
      .from('listing_price_analysis')
      .upsert(batch, { onConflict: 'listing_id' })
    if (error) {
      console.error('Failed to upsert price analysis batch', error)
      throw error
    }
  }

  console.log('Price analysis successfully rebuilt.')
}

main().catch((err) => {
  console.error('Price analysis rebuild failed:', err)
  process.exit(1)
})

