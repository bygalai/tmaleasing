import { useEffect, useState } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import type { Listing } from '../types/marketplace'

const FALLBACK_IMAGE =
  'https://dummyimage.com/1200x800/1f2937/e5e7eb&text=Vehicle+Photo+Pending'

type ListingsRow = {
  id: string
  category: string | null
  title: string
  price: string | number | null
  mileage: string | number | null
  year: number | null
  images: string[] | null
  listing_url: string | null
  created_at: string
  city: string | null
  vin: string | null
  engine: string | null
  transmission: string | null
  drivetrain: string | null
  body_color: string | null
  source: string | null
}

function toNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return undefined
  return num
}

function isBadImageUrl(url: string): boolean {
  const lowered = url.trim().toLowerCase()
  if (!lowered) return true
  if (lowered.startsWith('data:')) return true
  if (lowered.endsWith('.svg')) return true
  if (lowered.includes('logo')) return true
  if (lowered.includes('/local/templates/')) return true
  return false
}


function normalizeEngine(value: string | null): string | null {
  if (!value) return null
  let out = value.replace(/\s+/g, ' ').trim()
  if (!out) return null

  // Краткая форма типа топлива: Бензин / Дизель вместо Бензиновый / Дизельный
  out = out.replace(/Бензиновый/gi, 'Бензин')
  out = out.replace(/Дизельный/gi, 'Дизель')
  out = out.replace(/Гибридный/gi, 'Гибрид')
  out = out.replace(/Электрический/gi, 'Электро')

  out = out.replace(/^\d+\s*\/\s*/i, '')
  out = out.replace(/^\d+\s*(см3|см\^?3|cc)\s*\/\s*/i, '')

  out = out.replace(/\s*[/,]?\s*\b(трансмиссия|кпп|привод|передний|задний|полный|акпп|мкпп|робот|вариатор|cvt)\b.*/i, '')
  out = out.replace(/\s*,\s*турбированный\b/gi, '').replace(/\bтурбированный\s*/gi, '')
  out = out.replace(/\s*,\s*\d+-цилиндровый\b/gi, '').replace(/\b\d+-цилиндровый\s*/gi, '')
  out = out.replace(/\s*Рабочий\s+объём\b/gi, '').replace(/\s*рабочий\s+объём\b/gi, '')

  out = out.replace(/\s*\/\s*/g, ', ')

  // Единый порядок: л.с. → топливо → объём
  const hpMatch = out.match(/(\d[\d\s]*)\s*л\.\s*с\.?/i)
  const fuelMatch = out.match(/(Бензин|Дизель|Гибрид|Электро)/i)
  const volMatch = out.match(/(\d+[,.]?\d*)\s*л\.?(?:\s|,|$)/)
  const parts: string[] = []
  if (hpMatch) parts.push(`${hpMatch[1].replace(/\s/g, '')} л.с.`)
  if (fuelMatch) parts.push(fuelMatch[1])
  if (volMatch) parts.push(`${volMatch[1].replace(',', '.')} л.`)
  if (parts.length > 0) out = parts.join(', ')

  return out || null
}

function normalizeDrivetrain(value: string | null): string | null {
  if (!value) return null
  const raw = value.replace(/\s+/g, ' ').trim()
  if (!raw) return null

  // Schema.org enums sometimes leak into data as plain strings.
  const lowered = raw.toLowerCase()
  if (lowered.includes('frontwheeldriveconfiguration')) return 'Передний'
  if (lowered.includes('rearwheeldriveconfiguration')) return 'Задний'
  if (lowered.includes('fourwheeldriveconfiguration')) return 'Полный'
  if (lowered.includes('allwheeldriveconfiguration')) return 'Полный'

  // Drop other english-ish technical leftovers.
  if (/[A-Za-z]/.test(raw) && /configuration$/i.test(raw)) return null
  if (/[A-Za-z]/.test(raw) && raw.length > 18) return null

  return raw.replace(/\s+привод$/i, '').trim() || null
}

function normalizeTransmission(value: string | null): string | null {
  if (!value) return null
  const raw = value.replace(/\s+/g, ' ').trim()
  if (!raw) return null
  if (/^Механика$/i.test(raw)) return 'МКПП'
  if (/^Автомат$/i.test(raw)) return 'АКПП'
  return raw
}

/** Fisher-Yates shuffle. */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Перемешивает объявления по source: случайный порядок в каждой группе, затем хаотичный выбор (рандомно тянем из оставшихся источников). */
function interleaveBySource<T extends { source?: string | null }>(rows: T[]): T[] {
  const bySource = new Map<string, T[]>()
  for (const row of rows) {
    const key = row.source?.trim() || 'unknown'
    if (!bySource.has(key)) bySource.set(key, [])
    bySource.get(key)!.push(row)
  }
  const groups = Array.from(bySource.values()).map((g) => shuffle(g))
  if (groups.length <= 1) return groups[0] ?? rows
  const out: T[] = []
  const indices = groups.map(() => 0)
  const total = rows.length
  while (out.length < total) {
    const available = groups
      .map((g, i) => i)
      .filter((i) => indices[i] < groups[i].length)
    if (available.length === 0) break
    const pick = available[Math.floor(Math.random() * available.length)]
    out.push(groups[pick][indices[pick]++])
  }
  return out
}

function lowercaseFirstLetter(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed[0].toLowerCase() + trimmed.slice(1)
}

function mapRowToListing(row: ListingsRow): Listing {
  const priceRub = Math.round(toNumber(row.price) ?? 0)
  const mileageKm = toNumber(row.mileage)
  const year = row.year ?? undefined

  const rawImageUrls = (row.images ?? []).filter((url): url is string => Boolean(url && !isBadImageUrl(url)))
  const imageUrls = rawImageUrls
  const imageUrl = imageUrls[0] ?? FALLBACK_IMAGE

  const isTrailer = row.category === 'pricepy'
  const engine = isTrailer ? null : normalizeEngine(row.engine)
  const drivetrain = isTrailer ? null : normalizeDrivetrain(row.drivetrain)
  const transmission = isTrailer ? null : normalizeTransmission(row.transmission)
  const bodyColor = (row.body_color ?? '').replace(/\s+обивка\s*$/gi, '').trim() || null
  const subtitleParts = isTrailer
    ? [bodyColor].filter((part): part is string => Boolean(part && part.trim()))
    : [bodyColor, engine, transmission, drivetrain].filter(
        (part): part is string => Boolean(part && part.trim()),
      )
  const subtitleFallback = isTrailer ? 'Прицеп / полуприцеп' : 'Проверенный лот'

  const bodyColorForDescription = lowercaseFirstLetter(bodyColor)
  const drivetrainForDescription = lowercaseFirstLetter(drivetrain)

  const descriptionParts = [
    row.city ? `Город: ${row.city}` : null,
    year ? `Год: ${year}` : null,
    mileageKm !== undefined
      ? isTrailer
        ? `Наработка: ${Math.round(mileageKm)} м.ч.`
        : `Пробег: ${Math.round(mileageKm)} км`
      : null,
    !isTrailer && engine ? `Двигатель: ${engine}` : null,
    !isTrailer && transmission ? `КПП: ${transmission}` : null,
    !isTrailer && drivetrainForDescription ? `Привод: ${drivetrainForDescription}` : null,
    bodyColorForDescription ? `Цвет: ${bodyColorForDescription}` : null,
    row.vin ? `VIN: ${row.vin}` : null,
  ].filter((part): part is string => Boolean(part))

  return {
    id: row.id,
    category: row.category ?? undefined,
    title: row.title,
    subtitle: subtitleParts.length ? subtitleParts.join(' • ') : subtitleFallback,
    priceRub,
    // Пока у нас нет анализа рынка в БД — заполняем значения, чтобы UI работал стабильно.
    marketLowRub: Math.round(priceRub * 0.93),
    marketAvgRub: priceRub,
    marketHighRub: Math.round(priceRub * 1.07),
    year,
    mileageKm: mileageKm !== undefined ? Math.round(mileageKm) : undefined,
    location: row.city ?? undefined,
    imageUrl,
    imageUrls: imageUrls.length ? imageUrls : [imageUrl],
    detailUrl: row.listing_url ?? 'https://t.me/GONKACONFBOT',
    description:
      descriptionParts.length > 0
        ? descriptionParts.join('\n')
        : isTrailer
          ? 'Прицеп/полуприцеп от лизинговой компании.'
          : 'Конфискованная техника от лизинговой компании.',
    badges: ['in_stock'],
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  try {
    return JSON.stringify(err)
  } catch {
    return 'Unknown error'
  }
}

export function useListings() {
  const [items, setItems] = useState<Listing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (cancelled) return
      setIsLoading(true)
      setError(null)

      try {
        const supabase = getSupabaseClient()
        const { data, error: supabaseError } = await supabase
          .from('listings')
          .select(
            'id,category,title,price,mileage,year,images,listing_url,created_at,city,vin,engine,transmission,drivetrain,body_color,source',
          )
          .not('price', 'is', null)
          .order('created_at', { ascending: false })

        if (supabaseError) throw supabaseError

        const rows = (data ?? []) as ListingsRow[]

        // The source can contain duplicates (e.g. same VIN posted multiple times).
        // Since we sort by created_at desc, keep the newest row per VIN.
        const dedupedRows: ListingsRow[] = []
        const seenVins = new Set<string>()
        for (const row of rows) {
          const vin = row.vin?.trim().toUpperCase()
          if (vin) {
            if (seenVins.has(vin)) continue
            seenVins.add(vin)
          }
          dedupedRows.push(row)
        }

        // Чередуем по источнику (vtb / europlan), чтобы в начале были и те и другие
        const interleaved = interleaveBySource(dedupedRows)
        const mapped = interleaved.map(mapRowToListing)

        if (!cancelled) {
          setItems(mapped)
        }
      } catch (err) {
        // Supabase часто возвращает ошибки не как instance of Error.
        // Показываем реальную причину, чтобы можно было быстро починить.
        const rawMessage = getErrorMessage(err)
        const message = rawMessage ? `Supabase: ${rawMessage}` : 'Не удалось загрузить список техники из Supabase'
        console.error('Failed to load listings from Supabase:', err)
        if (!cancelled) {
          setError(message)
          setItems([])
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  return { items, isLoading, error }
}
