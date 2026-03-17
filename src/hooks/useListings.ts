import { useEffect, useState } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import { extractBrand } from '../lib/filters'
import { inferEquipmentType, normalizeBodyType } from '../lib/equipment-types'
import type { Listing } from '../types/marketplace'

const FALLBACK_IMAGE =
  'https://dummyimage.com/1200x800/1f2937/e5e7eb&text=Vehicle+Photo+Pending'

type ListingsRow = {
  id: string
  category: string | null
  title: string
  price: string | number | null
  original_price: string | number | null
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
  body_type: string | null
  source: string | null
  /** Supabase returns FK relation as array (one row per listing); we use the first. */
  listing_price_analysis?:
    | {
        market_low: string | number | null
        market_avg: string | number | null
        market_high: string | number | null
        sample_size: number | null
      }[]
    | {
        market_low: string | number | null
        market_avg: string | number | null
        market_high: string | number | null
        sample_size: number | null
      }
    | null
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

  const lowered = raw.toLowerCase()
  if (lowered.includes('frontwheeldriveconfiguration')) return 'Передний'
  if (lowered.includes('rearwheeldriveconfiguration')) return 'Задний'
  if (lowered.includes('fourwheeldriveconfiguration')) return 'Полный'
  if (lowered.includes('allwheeldriveconfiguration')) return 'Полный'

  if (/[A-Za-z]/.test(raw) && /configuration$/i.test(raw)) return null
  if (/[A-Za-z]/.test(raw) && raw.length > 18) return null

  let out = raw.replace(/\s+привод$/i, '').trim()
  if (!out) return null

  // Нормализация колёсной формулы: 6X4, 6х4, 6Х4 → 6x4;
  // отрезаем год, приклеенный парсером: 6x42022 → 6x4, 6x4 2023 → 6x4
  // Важно: (19|20)\d{2} в конце, иначе жадный \d{1,2} захватывает "42" в "6x42023"
  out = out.replace(/(\d+)\s*[xXхХ]\s*(\d{1,2})(?:\s*[,\/\-]?\s*)?(19|20)\d{2}\b/g, (_, a, b) => `${a}x${b}`)
  out = out.replace(/(\d+)\s*[xXхХ]\s*(\d{1,2})/g, (_, a, b) => `${a}x${b}`)

  // Унификация регистра: "гусеничный" → "Гусеничный", "колёсный" → "Колёсный"
  out = out.charAt(0).toUpperCase() + out.slice(1)

  return out || null
}

function normalizeTransmission(value: string | null): string | null {
  if (!value) return null
  const raw = value.replace(/\s+/g, ' ').trim()
  if (!raw) return null
  if (/^Механика$/i.test(raw)) return 'МКПП'
  if (/^Автомат$/i.test(raw)) return 'АКПП'
  return raw
}

function lowercaseFirstLetter(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed[0].toLowerCase() + trimmed.slice(1)
}

/** Значения из поля body_color, которые являются типом кузова (из парсера Газпрома), а не цветом. */
const BODY_TYPE_WORDS = [
  // легковые
  'внедорожник',
  'лифтбэк',
  'лифтбек',
  'седан',
  'универсал',
  'хэтчбек',
  'хетчбек',
  'купе',
  'минивэн',
  'минивен',
  'пикап',
  'кроссовер',
  'кабриолет',
  'фургон',
  'лимузин',
  'родстер',
  // грузовые и спецтехника
  'автотопливозаправщик',
  'топливозаправщик',
  'седельный',
  'самосвал',
  'бортовой',
  'цистерна',
  'рефрижератор',
  'тентованный',
  'изотермический',
  'тягач',
  'контейнеровоз',
  'эвакуатор',
  'автокран',
  'бортовая платформа',
  // прицепы
  'прицеп',
  'полуприцеп',
]

function isBodyType(value: string | null): boolean {
  if (!value) return false
  const lower = value.trim().toLowerCase()
  if (!lower) return false
  return BODY_TYPE_WORDS.some(
    (word) => lower === word || lower.startsWith(`${word} `) || lower.startsWith(`${word},`),
  )
}

// Показываем старую цену только при правдоподобной скидке (до ~50%). Иначе не показываем «скидку».
const MAX_ORIGINAL_TO_PRICE_RATIO = 2.0

function mapRowToListing(row: ListingsRow): Listing {
  const priceRub = Math.round(toNumber(row.price) ?? 0)
  const originalPriceRubRaw = toNumber(row.original_price)
  const originalPriceRub =
    originalPriceRubRaw != null &&
    originalPriceRubRaw > priceRub &&
    originalPriceRubRaw <= priceRub * MAX_ORIGINAL_TO_PRICE_RATIO
      ? Math.round(originalPriceRubRaw)
      : undefined
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
  const bodyType = (row.body_type ?? '').trim() || null
  const resolvedBodyType = normalizeBodyType(
    bodyType
    ?? inferEquipmentType(row.title, row.category)
    ?? (isBodyType(bodyColor) ? bodyColor!.trim() : null)
  )

  const subtitleBodyColor = bodyColor && !isBodyType(bodyColor) ? bodyColor : null
  const subtitleParts = isTrailer
    ? [subtitleBodyColor].filter((part): part is string => Boolean(part && part.trim()))
    : [resolvedBodyType, subtitleBodyColor, engine, transmission, drivetrain].filter(
        (part): part is string => Boolean(part && part.trim()),
      )
  const subtitleFallback = isTrailer ? 'Прицеп / полуприцеп' : 'Проверенный лот'

  const bodyColorForDescription = lowercaseFirstLetter(bodyColor)
  const resolvedBodyTypeForDescription = lowercaseFirstLetter(resolvedBodyType)
  const drivetrainForDescription = lowercaseFirstLetter(drivetrain)
  const bodyTypeLine = resolvedBodyTypeForDescription
    ? `Тип кузова: ${resolvedBodyTypeForDescription}`
    : null
  const bodyColorLine =
    bodyColorForDescription != null && !isBodyType(bodyColor) ? `Цвет: ${bodyColorForDescription}` : null

  const descriptionParts = [
    row.city ? `Город: ${row.city}` : null,
    year ? `Год: ${year}` : null,
    mileageKm !== undefined
      ? isTrailer
        ? `Наработка: ${Math.round(mileageKm)} м.ч.`
        : `Пробег: ${Math.round(mileageKm)} км`
      : null,
    !isTrailer && engine ? `Двигатель: ${engine}` : null,
    !isTrailer && transmission ? `Коробка: ${transmission}` : null,
    !isTrailer && drivetrainForDescription
      ? row.category === 'legkovye'
        ? `Привод: ${drivetrainForDescription}`
        : `Колёсная формула: ${drivetrainForDescription}`
      : null,
    bodyTypeLine,
    bodyColorLine,
    row.vin ? `VIN: ${row.vin}` : null,
  ].filter((part): part is string => Boolean(part))

  // Значения для анализа цены (Supabase возвращает связь как массив с одним элементом).
  const rawAnalysis = row.listing_price_analysis
  const analysis = Array.isArray(rawAnalysis) ? rawAnalysis[0] ?? null : rawAnalysis
  const serverLow = analysis?.market_low != null ? toNumber(analysis.market_low) : undefined
  const serverAvg = analysis?.market_avg != null ? toNumber(analysis.market_avg) : undefined
  const serverHigh = analysis?.market_high != null ? toNumber(analysis.market_high) : undefined

  let marketLowRub: number
  let marketAvgRub: number
  let marketHighRub: number

  if (serverLow && serverAvg && serverHigh && serverLow > 0 && serverAvg > 0 && serverHigh > 0) {
    marketLowRub = Math.round(serverLow)
    marketAvgRub = Math.round(serverAvg)
    marketHighRub = Math.round(serverHigh)
  } else {
    // Аккуратный fallback: узкий коридор вокруг текущей цены.
    marketLowRub = Math.round(priceRub * 0.95)
    marketAvgRub = priceRub
    marketHighRub = Math.round(priceRub * 1.05)
  }

  return {
    id: row.id,
    category: row.category ?? undefined,
    title: row.title,
    subtitle: subtitleParts.length ? subtitleParts.join(' • ') : subtitleFallback,
    priceRub,
    ...(originalPriceRub != null ? { originalPriceRub } : {}),
    marketLowRub,
    marketAvgRub,
    marketHighRub,
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
    badges:
      originalPriceRub != null
        ? ['in_stock', 'discount']
        : ['in_stock'],
    ...(originalPriceRub != null
      ? { discountPercent: Math.round((1 - priceRub / originalPriceRub) * 100) }
      : {}),
    source: row.source ?? undefined,
    bodyType: resolvedBodyType ?? undefined,
    brand: extractBrand(row.title),
    drivetrain: drivetrain ?? undefined,
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
  const [isAlmostReady, setIsAlmostReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (cancelled) return
      setIsLoading(true)
      setError(null)

      try {
        const supabase = getSupabaseClient()

        // Supabase SaaS по умолчанию отдаёт максимум ~1000 строк за запрос.
        // Собираем данные батчами по 1000, чтобы поддерживать до 10k лотов.
        const PAGE_SIZE = 1000
        const MAX_ITEMS = 10_000
        const allRows: ListingsRow[] = []
        let from = 0
        let totalCount: number | null = null
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const query = supabase
            .from('listings')
            .select(
              'id,category,title,price,original_price,mileage,year,images,listing_url,created_at,city,vin,engine,transmission,drivetrain,body_color,body_type,source,listing_price_analysis(market_low,market_avg,market_high,sample_size)',
              from === 0 ? { count: 'exact' as const } : undefined,
            )
            .order('created_at', { ascending: false })
            .range(from, from + PAGE_SIZE - 1)

          const { data, error: supabaseError, count } = await query
          if (supabaseError) throw supabaseError

          if (from === 0 && typeof count === 'number') {
            totalCount = count
          }

          const batch = (data ?? []) as ListingsRow[]
          allRows.push(...batch)

          if (batch.length < PAGE_SIZE || allRows.length >= MAX_ITEMS) {
            // eslint-disable-next-line no-console
            console.log(
              'useListings: fetched rows',
              allRows.length,
              totalCount != null ? `(server count ≈ ${totalCount})` : '',
            )
            break
          }
          from += PAGE_SIZE
        }

        if (!cancelled) setIsAlmostReady(true)

        const rows = allRows

        // Debug: what exactly вернул Supabase по категориям и источникам
        if (typeof window !== 'undefined') {
          const anyWindow = window as unknown as {
            __tmaRows?: ListingsRow[]
            __tmaDeduped?: ListingsRow[]
          }
          anyWindow.__tmaRows = rows

          const rawCounts: Record<string, number> = {}
          for (const row of rows) {
            const cat = (row.category ?? 'null').toString()
            const src = (row.source ?? 'null').toString().toLowerCase()
            const key = `${src}:${cat}`
            rawCounts[key] = (rawCounts[key] ?? 0) + 1
          }
          // eslint-disable-next-line no-console
          console.log('useListings: raw rows by source/category', rawCounts)
        }

        // The source can contain duplicates (e.g. same VIN posted multiple times).
        // Since we sort by created_at desc, keep the newest row per VIN.
        // When VIN is missing (common for спецтехника), dedupe by title+year+mileage to avoid identical listings.
        const dedupedRows: ListingsRow[] = []
        const seenVins = new Set<string>()
        const seenTitleYearMileage = new Set<string>()
        for (const row of rows) {
          const vin = row.vin?.trim().toUpperCase()
          if (vin) {
            if (seenVins.has(vin)) continue
            seenVins.add(vin)
          } else {
            const titleNorm = (row.title ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
            const year = row.year ?? ''
            const mileage = row.mileage != null ? String(row.mileage).trim() : ''
            const key = `${titleNorm}|${year}|${mileage}`
            if (titleNorm && seenTitleYearMileage.has(key)) continue
            seenTitleYearMileage.add(key)
          }
          dedupedRows.push(row)
        }

        // Все объявления от Европлана опускаем в самый низ,
        // сохраняя изначальный порядок внутри каждой группы.
        const europlanKey = 'europlan'
        const nonEuroplan = dedupedRows.filter(
          (row) => row.source?.trim().toLowerCase() !== europlanKey,
        )
        const europlan = dedupedRows.filter(
          (row) => row.source?.trim().toLowerCase() === europlanKey,
        )
        const ordered = [...nonEuroplan, ...europlan]

        if (typeof window !== 'undefined') {
          const anyWindow = window as unknown as {
            __tmaRows?: ListingsRow[]
            __tmaDeduped?: ListingsRow[]
          }
          anyWindow.__tmaDeduped = ordered
        }

        // Батчируем mapRowToListing, чтобы не блокировать main thread при 1000+ лотах
        const BATCH_SIZE = 80
        const mapped: Listing[] = []
        for (let i = 0; i < ordered.length; i += BATCH_SIZE) {
          const batch = ordered.slice(i, i + BATCH_SIZE).map(mapRowToListing)
          mapped.push(...batch)
          if (i + BATCH_SIZE < ordered.length) {
            await new Promise((r) => setTimeout(r, 0))
          }
        }

        // Debug: expose items and per-category counts in browser console
        if (typeof window !== 'undefined') {
          const anyWindow = window as unknown as { __tmaListings?: Listing[] }
          anyWindow.__tmaListings = mapped

          const byCategory: Record<string, number> = {}
          for (const item of mapped) {
            const cat = item.category ?? 'legkovye'
            byCategory[cat] = (byCategory[cat] ?? 0) + 1
          }
          // eslint-disable-next-line no-console
          console.log('useListings: items by category', byCategory)
        }

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

  return { items, isLoading, isAlmostReady, error }
}
