import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ListingCard } from '../components/listing/ListingCard'
import { SearchBar } from '../components/listing/SearchBar'
import type { Listing } from '../types/marketplace'
import type { CategoryId } from './CategorySelectionPage'
import { getTelegramUserFromInitData } from '../lib/telegram'

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
  onSearchFocusedChange?: (isFocused: boolean) => void
}

export function CatalogPage({
  items,
  isLoading,
  error,
  isFavorite,
  toggleFavorite,
  onSearchFocusedChange,
}: CatalogPageProps) {
  const { category } = useParams<{ category?: string }>()
  const categoryId = category as CategoryId | undefined

  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  useEffect(() => {
    try {
      const user = getTelegramUserFromInitData()
      const userKey = user?.id ?? user?.username ?? 'guest'
      const storageKey = `tma:searchHistory:${userKey}`
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
        setHistory(normalized)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) return

    const timeoutId = window.setTimeout(() => {
      try {
        const user = getTelegramUserFromInitData()
        const userKey = user?.id ?? user?.username ?? 'guest'
        const storageKey = `tma:searchHistory:${userKey}`

        setHistory((prev) => {
          const next = [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, 10)
          window.localStorage.setItem(storageKey, JSON.stringify(next))
          return next
        })
      } catch {
        // ignore
      }
    }, 700)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [query])

  const filtered = useMemo(() => {
    let result = items
    if (categoryId) {
      result = result.filter((item) => (item.category ?? 'legkovye') === categoryId)
    }
    const trimmed = query.trim()
    if (!trimmed) return result
    return result.filter((item) => matchesSearch(item, trimmed))
  }, [items, query, categoryId])

  const defaultSuggestionsByCategory: Record<string, string[]> = {
    legkovye: ['Lada', 'Toyota', 'Camry', 'KIA', 'Haval'],
    gruzovye: ['Shacman', 'Sitrak', 'Scania', 'Howo', 'MAN'],
    speztechnika: ['Lonking', 'Sany'],
    pricepy: ['Полуприцеп', 'Прицеп'],
    default: ['Shacman', 'Sitrak', 'Scania', 'Lada', 'Toyota'],
  }
  const baseDefaults =
    (categoryId && defaultSuggestionsByCategory[categoryId]) ?? defaultSuggestionsByCategory.default
  const normalizedQuery = query.trim()
  const allCandidates = Array.from(
    new Set<string>([
      ...baseDefaults,
      ...history,
      ...Object.keys(BRAND_SYNONYMS),
    ]),
  )

  const typedSuggestions =
    normalizedQuery.length > 0
      ? allCandidates
          .filter((item) => {
            const normItem = normalizeForSearch(item)
            const normQuery = normalizeForSearch(normalizedQuery)
            if (!normItem || !normQuery) return false
            return normItem.includes(normQuery) || normQuery.includes(normItem)
          })
          .slice(0, 6)
      : []

  const effectiveSuggestions =
    isSearchFocused && normalizedQuery.length > 0
      ? typedSuggestions
      : isSearchFocused && history.length > 0
        ? history.slice(0, 3)
        : isSearchFocused
          ? baseDefaults
          : []

  const handleSearchFocusChange = (focused: boolean) => {
    setIsSearchFocused(focused)
    onSearchFocusedChange?.(focused)
  }

  return (
    <section className="space-y-4">
      <SearchBar
        value={query}
        onChange={setQuery}
        suggestions={effectiveSuggestions}
        onSuggestionClick={(value) => setQuery(value)}
        onFocusChange={handleSearchFocusChange}
      />

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
            <div className="mx-auto w-full max-w-[560px] px-2 text-center text-sm font-sf text-slate-900">
              Ничего не найдено. Попробуйте ещё раз
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
