import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListingCard } from '../components/listing/ListingCard'
import { SearchBar } from '../components/listing/SearchBar'
import type { Listing } from '../types/marketplace'
import {
  BRAND_SYNONYMS,
  DEFAULT_SUGGESTIONS_BY_CATEGORY,
  matchesSearch,
  normalizeForSearch,
} from '../lib/search'
import { getTelegramUserFromInitData } from '../lib/telegram'

export type CategoryId = 'legkovye' | 'gruzovye' | 'speztechnika' | 'pricepy'

type Category = {
  id: CategoryId
  label: string
  subtitle: string
  href: string
  accent?: boolean
  topLeftText?: string
}

const CATEGORIES: Category[] = [
  {
    id: 'legkovye',
    label: 'Легковые',
    subtitle: 'Автомобили с пробегом',
    href: '/catalog/legkovye',
  },
  {
    id: 'gruzovye',
    label: 'Грузовые',
    subtitle: 'Грузовики и фуры',
    href: '/catalog/gruzovye',
    accent: true,
    topLeftText: 'Посмотреть подробнее',
  },
  {
    id: 'speztechnika',
    label: 'Спецтехника',
    subtitle: 'Экскаваторы, краны и др.',
    href: '/catalog/speztechnika',
  },
  {
    id: 'pricepy',
    label: 'Прицепы',
    subtitle: 'Прицепы и полуприцепы',
    href: '/catalog/pricepy',
  },
]

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden
    >
      <path d="M6 18L18 6" />
      <path d="M11 6h7v7" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  )
}

function CategoryCard({
  category,
  className = '',
}: {
  category: Category
  className?: string
}) {
  const isAccent = category.accent

  return (
    <Link
      to={category.href}
      className={`group relative block min-h-[100px] overflow-hidden rounded-2xl transition-transform active:scale-[0.98] ${className}`}
    >
      <div
        className={`relative flex h-full min-h-full flex-col justify-end p-5 pt-12 ${
          isAccent
            ? 'bg-[#FF5C34] text-white'
            : 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]'
        }`}
      >
        {category.topLeftText ? (
          <p className="absolute left-4 right-12 top-4 max-w-[9.5rem] text-xs font-sf font-normal leading-snug text-white/85">
            {category.topLeftText}
          </p>
        ) : null}
        <div className="absolute right-4 top-4">
          <ArrowIcon
            className={`h-7 w-7 opacity-70 transition-opacity group-hover:opacity-100 ${
              isAccent ? 'text-white' : 'text-slate-400'
            }`}
          />
        </div>
        <div>
          <p
            className={`font-bold tracking-tight font-sf [font-size:clamp(18px,4.5vw,22px)] ${
              isAccent ? 'text-white' : 'text-slate-900'
            }`}
          >
            {category.label}
          </p>
          <p
            className={`mt-1 text-sm font-sf font-normal ${
              isAccent ? 'text-white/85' : 'text-slate-500'
            }`}
          >
            {category.subtitle}
          </p>
        </div>
      </div>
    </Link>
  )
}

type CategorySelectionPageProps = {
  items: Listing[]
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => void
  onSearchFocusedChange?: (isFocused: boolean) => void
}

export function CategorySelectionPage({
  items,
  isFavorite,
  toggleFavorite,
  onSearchFocusedChange,
}: CategorySelectionPageProps) {
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  useEffect(() => {
    try {
      const user = getTelegramUserFromInitData()
      const userKey = user?.id ?? user?.username ?? 'guest'
      const storageKey = `tma:searchHistory:${userKey}:all`
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
        const storageKey = `tma:searchHistory:${userKey}:all`

        setHistory((prev) => {
          const next = [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, 10)
          window.localStorage.setItem(storageKey, JSON.stringify(next))
          return next
        })
      } catch {
        // ignore
      }
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [query])

  const filtered = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return items
    return items.filter((item) => matchesSearch(item, trimmed))
  }, [items, query])

  const baseDefaults = DEFAULT_SUGGESTIONS_BY_CATEGORY.default
  const normalizedQuery = query.trim()
  const allCandidates = Array.from(
    new Set<string>([...baseDefaults, ...history, ...Object.keys(BRAND_SYNONYMS)]),
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

  const discountedItems = items.filter((item) => item.badges.includes('discount'))

  return (
    <section className="space-y-6">
      <SearchBar
        value={query}
        onChange={setQuery}
        suggestions={effectiveSuggestions}
        onSuggestionClick={(value) => setQuery(value)}
        onFocusChange={(focused) => {
          setIsSearchFocused(focused)
          onSearchFocusedChange?.(focused)
        }}
      />

      {normalizedQuery.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-sf font-bold tracking-tight text-slate-900 [font-size:clamp(20px,5vw,26px)]">
            Результаты поиска
          </h2>
          {filtered.length > 0 ? (
            <div className="grid gap-4 pb-4">
              {filtered.map((item) => (
                <ListingCard
                  key={item.id}
                  item={item}
                  isFavorite={isFavorite(item.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              По запросу «{normalizedQuery}» ничего не найдено. Попробуйте другой запрос.
            </p>
          )}
        </section>
      ) : null}

      {normalizedQuery.length === 0 ? (
        <>
          <header className="flex items-center justify-between">
            <h1 className="font-bold tracking-tight text-slate-900 font-sf [font-size:clamp(28px,7vw,34px)]">
              Каталог
            </h1>
            <button
              type="button"
              aria-label="Фильтры"
              className="flex h-10 w-10 items-center justify-center text-slate-600 transition hover:text-slate-900"
            >
              <FilterIcon />
            </button>
          </header>

          <div className="grid grid-cols-2 grid-rows-3 gap-3 pb-4">
        <CategoryCard
          category={CATEGORIES.find((c) => c.id === 'gruzovye')!}
          className="col-start-2 row-span-3 row-start-1"
        />
        <CategoryCard category={CATEGORIES.find((c) => c.id === 'legkovye')!} />
        <CategoryCard category={CATEGORIES.find((c) => c.id === 'speztechnika')!} />
        <CategoryCard category={CATEGORIES.find((c) => c.id === 'pricepy')!} />
      </div>

          {discountedItems.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-sf font-bold tracking-tight text-slate-900 [font-size:clamp(28px,7vw,34px)]">
                Выгодно
              </h2>
              <div className="grid gap-4 pb-4">
                {discountedItems.map((item) => (
                  <ListingCard
                    key={item.id}
                    item={item}
                    isFavorite={isFavorite(item.id)}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </section>
  )
}
