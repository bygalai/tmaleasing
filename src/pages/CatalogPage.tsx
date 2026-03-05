import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ListingCard } from '../components/listing/ListingCard'
import { SearchBar } from '../components/listing/SearchBar'
import type { Listing } from '../types/marketplace'
import type { CategoryId } from './CategorySelectionPage'

function normalizeForSearch(value: string | undefined | null): string {
  if (!value) return ''
  const lower = value.toLowerCase()

  const cyrToLat: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'i',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'c',
    ч: 'ch',
    ш: 'sh',
    щ: 'sh',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  }

  let out = ''
  for (const ch of lower) {
    if (cyrToLat[ch] !== undefined) {
      out += cyrToLat[ch]
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch
    } else {
      out += ' '
    }
  }

  // Небольшая нормализация для часто путаемых букв (Shacman vs «Шакман» и т.п.)
  out = out.replace(/[ck]/g, 'k')

  // Чуть сглаживаем повторы букв в запросе: «мерседесс» → «merse dess» и т.п.
  out = out.replace(/(.)\1{2,}/g, '$1$1')

  return out.replace(/\s+/g, ' ').trim()
}

const BRAND_SYNONYMS: Record<string, string[]> = {
  // грузовики
  'шакман': ['shacman', 'shakman'],
  'shakman': ['shacman', 'shakman'],
  'scania': ['scania', 'skania'],
  'скания': ['scania', 'skania'],
  'даф': ['daf'],
  'daf': ['daf'],
  'ман': ['man'],
  'мерс': ['mercedes', 'mersedes'],
  'мерседес': ['mercedes', 'mersedes'],
  'volvo': ['volvo'],
  'вольво': ['volvo'],
  'iveco': ['iveco'],
  'ивеко': ['iveco'],
  // китайские и популярные бренды
  'донфенг': ['dongfeng', 'dfm'],
  'донгфенг': ['dongfeng', 'dfm'],
  'dongfeng': ['dongfeng', 'dfm'],
  'dfm': ['dongfeng', 'dfm'],
  'ситрак': ['sitrak'],
  'sitrak': ['sitrak'],
  'бмв': ['bmw'],
  'bmw': ['bmw'],
  'нива': ['niva', 'lada niva', 'lada-niva', 'lada 4x4'],
  'niva': ['niva', 'lada niva', 'lada-niva', 'lada 4x4'],
  'киа': ['kia'],
  'kia': ['kia'],
  'черри': ['chery', 'cherry', 'cheryexeed'],
  'чери': ['chery', 'cherry', 'cheryexeed'],
  'chery': ['chery', 'cherry', 'cheryexeed'],
  'geely': ['geely'],
  'джили': ['geely'],
  'haval': ['haval'],
  'хавал': ['haval'],
  // классика и популярные модели
  'камри': ['camry', 'toyota camry'],
  'camry': ['camry', 'toyota camry'],
  'ауди': ['audi'],
  'audi': ['audi'],
  'тойота': ['toyota'],
  'тайота': ['toyota'],
  'toyota': ['toyota'],
  'исузу': ['isuzu'],
  'изудзу': ['isuzu'],
  'isuzu': ['isuzu'],
  'газель': ['gazelle', 'gazel', 'gaz'],
  'газел': ['gazelle', 'gazel', 'gaz'],
  'gazelle': ['gazelle', 'gazel', 'gaz'],
  'джак': ['jac'],
  'жак': ['jac'],
  'jac': ['jac'],
  'шевроле': ['chevrolet', 'shevrolet'],
  'шевролле': ['chevrolet', 'shevrolet'],
  'chevrolet': ['chevrolet', 'shevrolet'],
  'инфинити': ['infiniti'],
  'infiniti': ['infiniti'],
  'ниссан': ['nissan'],
  'nissan': ['nissan'],
  'чанган': ['changan'],
  'changan': ['changan'],
  'лексус': ['lexus'],
  'lexus': ['lexus'],
  'лифан': ['lifan'],
  'lifan': ['lifan'],
  'солярис': ['solaris', 'hyundai solaris'],
  'solaris': ['solaris', 'hyundai solaris'],
  'омода': ['omoda'],
  'omoda': ['omoda'],
  'хово': ['howo', 'cnhtc'],
  'howo': ['howo', 'cnhtc'],
  'тонли': ['tonly', 'tonly truck'],
  'tonly': ['tonly', 'tonly truck'],
  'форд': ['ford'],
  'ford': ['ford'],
  'лонкинг': ['lonking'],
  'lonking': ['lonking'],
  'шитц': ['shacman', 'shakman', 'sitrak'],
  'сани': ['sany'],
  'sany': ['sany'],
  'шанмон': ['shacman', 'shakman', 'sitrak'],
}

function matchesSearch(listing: Listing, rawQuery: string): boolean {
  const haystack = normalizeForSearch(
    [listing.title, listing.subtitle, listing.location].filter(Boolean).join(' '),
  )
  const normalizedQuery = normalizeForSearch(rawQuery)
  if (!normalizedQuery) return true

  if (haystack.includes(normalizedQuery)) return true

  const rawLower = rawQuery.toLowerCase()
  for (const [key, synonyms] of Object.entries(BRAND_SYNONYMS)) {
    if (!rawLower.includes(key)) continue
    for (const synonym of synonyms) {
      const normSynonym = normalizeForSearch(synonym)
      if (normSynonym && haystack.includes(normSynonym)) {
        return true
      }
    }
  }

  return false
}

type CatalogPageProps = {
  items: Listing[]
  isLoading: boolean
  error: string | null
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => void
}

export function CatalogPage({
  items,
  isLoading,
  error,
  isFavorite,
  toggleFavorite,
}: CatalogPageProps) {
  const { category } = useParams<{ category?: string }>()
  const categoryId = category as CategoryId | undefined

  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    let result = items
    if (categoryId) {
      result = result.filter((item) => (item.category ?? 'legkovye') === categoryId)
    }
    const trimmed = query.trim()
    if (!trimmed) return result
    return result.filter((item) => matchesSearch(item, trimmed))
  }, [items, query, categoryId])

  return (
    <section className="space-y-4">
      <SearchBar value={query} onChange={setQuery} />

      {error ? (
        <div className="mx-auto max-w-[560px] rounded-xl border border-[#FF5C34]/40 bg-[#FF5C34]/10 px-3 py-2 text-xs text-[#9A3412]">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-center text-sm text-slate-600">Загружаем лучшие предложения...</p>
      ) : (
        <div className="grid gap-4 pb-4">
          {filtered.map((item) => (
            <ListingCard
              key={item.id}
              item={item}
              isFavorite={isFavorite(item.id)}
              onToggleFavorite={toggleFavorite}
            />
          ))}
          {filtered.length === 0 ? (
            <div className="mx-auto w-full max-w-[560px] rounded-2xl border border-black/10 bg-black/5 p-6 text-center text-sm text-slate-600">
              По вашему запросу ничего не найдено.
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
