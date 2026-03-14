import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { VirtualizedListingGrid } from '../components/listing/VirtualizedListingGrid'
import { SearchBar, type SuggestionItem } from '../components/listing/SearchBar'
import { FilterPanel } from '../components/listing/FilterPanel'
import { ScrollToTopButton } from '../components/ScrollToTopButton'
import type { Listing, CategoryId } from '../types/marketplace'
import {
  BRAND_SYNONYMS,
  DEFAULT_SUGGESTIONS_BY_CATEGORY,
  matchesSearch,
  normalizeForSearch,
} from '../lib/search'
import {
  type FilterState,
  emptyFilterState,
  countActiveFilters,
  applyFilters,
} from '../lib/filters'
import { getTelegramUserFromInitData } from '../lib/telegram'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const qFromUrl = searchParams.get('q') ?? ''
  const [query, setQuery] = useState(qFromUrl)
  const [history, setHistory] = useState<string[]>([])
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [showSearchBackButton, setShowSearchBackButton] = useState(false)
  const [filters, setFilters] = useState<FilterState>(emptyFilterState)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const activeFilterCount = countActiveFilters(filters)

  useEffect(() => {
    if (qFromUrl !== query) setQuery(qFromUrl)
  }, [qFromUrl])

  const setQueryAndUrl = useCallback(
    (value: string) => {
      setQuery(value)
      const trimmed = value.trim()
      if (trimmed) {
        setSearchParams({ q: trimmed }, { replace: true })
      } else {
        setSearchParams({}, { replace: true })
      }
    },
    [setSearchParams],
  )

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
          .filter((v) => v.length >= 3)
        setHistory(normalized)
        if (normalized.length !== parsed.length) {
          window.localStorage.setItem(storageKey, JSON.stringify(normalized))
        }
      }
    } catch {
      // ignore
    }
  }, [])

  const filtered = useMemo(() => {
    let result = items
    const trimmed = query.trim()
    if (trimmed) {
      result = result.filter((item) => matchesSearch(item, trimmed))
    }
    if (countActiveFilters(filters) > 0) {
      result = applyFilters(result, filters)
    }
    return result
  }, [items, query, filters])

  const normalizedQuery = query.trim()
  const hasActiveFilters = activeFilterCount > 0
  const isShowingResults = normalizedQuery.length > 0 || hasActiveFilters

  const saveToHistory = useCallback(
    (term: string) => {
      const trimmed = term.trim()
      if (trimmed.length < 3) return
      if (!items.some((item) => matchesSearch(item, trimmed))) return
      try {
        const user = getTelegramUserFromInitData()
        const userKey = user?.id ?? user?.username ?? 'guest'
        const storageKey = `tma:searchHistory:${userKey}:all`
        setHistory((prev) => {
          const next = [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, 10)
          window.localStorage.setItem(storageKey, JSON.stringify(next))
          return next
        })
      } catch { /* ignore */ }
    },
    [items],
  )

  const deleteFromHistory = useCallback(
    (term: string) => {
      try {
        const user = getTelegramUserFromInitData()
        const userKey = user?.id ?? user?.username ?? 'guest'
        const storageKey = `tma:searchHistory:${userKey}:all`
        setHistory((prev) => {
          const next = prev.filter((q) => q !== term)
          window.localStorage.setItem(storageKey, JSON.stringify(next))
          return next
        })
      } catch { /* ignore */ }
    },
    [],
  )

  const baseDefaults = DEFAULT_SUGGESTIONS_BY_CATEGORY.default
  const allCandidates = useMemo(
    () => Array.from(new Set<string>([...baseDefaults, ...history, ...Object.keys(BRAND_SYNONYMS)])),
    [baseDefaults, history],
  )

  const typedSuggestions: SuggestionItem[] = useMemo(() => {
    if (normalizedQuery.length === 0) return []
    const nq = normalizeForSearch(normalizedQuery)
    if (!nq) return []
    return allCandidates
      .filter((c) => {
        const n = normalizeForSearch(c)
        return n && (n.startsWith(nq) || n.includes(nq) || nq.includes(n))
      })
      .sort((a, b) => {
        const na = normalizeForSearch(a)
        const nb = normalizeForSearch(b)
        return (nb.startsWith(nq) ? 2 : nb.includes(nq) ? 1 : 0) -
               (na.startsWith(nq) ? 2 : na.includes(nq) ? 1 : 0)
      })
      .slice(0, 6)
      .map((label) => ({ label, kind: 'suggestion' as const }))
  }, [normalizedQuery, allCandidates])

  const focusSuggestions: SuggestionItem[] = useMemo(() => {
    if (history.length > 0) {
      return history.slice(0, 5).map((h) => ({
        label: h,
        kind: 'history' as const,
        count: items.filter((item) => matchesSearch(item, h)).length,
      }))
    }
    return baseDefaults.map((d) => ({
      label: d,
      kind: 'suggestion' as const,
      count: items.filter((item) => matchesSearch(item, d)).length,
    }))
  }, [history, baseDefaults, items])

  const effectiveSuggestions: SuggestionItem[] = isSearchFocused
    ? normalizedQuery.length > 0
      ? typedSuggestions
      : focusSuggestions
    : []

  const discountedItems = items.filter((item) => item.badges.includes('discount'))

  useEffect(() => {
    if (!isShowingResults) {
      setShowSearchBackButton(false)
      return
    }

    const handleScroll = () => {
      const scrollTop =
        window.scrollY ?? document.documentElement.scrollTop ?? document.body.scrollTop ?? 0
      setShowSearchBackButton(scrollTop > 64)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => window.removeEventListener('scroll', handleScroll)
  }, [isShowingResults])

  const backBtnRef = useRef<HTMLButtonElement>(null)
  const handleBackPointerMove = useCallback((e: React.PointerEvent) => {
    const rect = backBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    backBtnRef.current!.style.setProperty('--mx', `${x}%`)
    backBtnRef.current!.style.setProperty('--my', `${y}%`)
  }, [])
  const handleBackPointerLeave = useCallback(() => {
    backBtnRef.current?.style.setProperty('--mx', '50%')
    backBtnRef.current?.style.setProperty('--my', '50%')
  }, [])

  const handleClearResults = useCallback(() => {
    setQueryAndUrl('')
    setFilters(emptyFilterState())
  }, [setQueryAndUrl])

  return (
    <section className="page-transition space-y-6">
      {isShowingResults ? (
        <div
          className={`sticky top-0 z-30 -mx-4 -mt-1 flex w-full items-center justify-start overflow-hidden px-4 transition-all duration-300 ease-out ${
            showSearchBackButton ? 'h-14 pb-2 pt-2' : 'h-0 pb-0 pt-0 pointer-events-none'
          }`}
        >
          <button
            ref={backBtnRef}
            type="button"
            onClick={handleClearResults}
            onPointerMove={handleBackPointerMove}
            onPointerLeave={handleBackPointerLeave}
            aria-label="Назад к каталогу"
            className={`liquid-glass relative z-30 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-900 transition-all duration-300 ease-out active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
              showSearchBackButton
                ? 'opacity-100 translate-x-0'
                : 'pointer-events-none opacity-0 -translate-x-4'
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="relative z-10 h-8 w-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="butt"
              strokeLinejoin="miter"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>
      ) : null}

      <SearchBar
        value={query}
        onChange={setQueryAndUrl}
        suggestions={effectiveSuggestions}
        onSuggestionClick={saveToHistory}
        onDeleteSuggestion={deleteFromHistory}
        onFocusChange={(focused) => {
          setIsSearchFocused(focused)
          onSearchFocusedChange?.(focused)
        }}
        onSubmit={() => saveToHistory(query)}
      />

      {isShowingResults ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-sf font-bold tracking-tight text-slate-900 [font-size:clamp(20px,5vw,26px)]">
              {normalizedQuery ? 'Результаты поиска' : 'Все лоты'}
            </h2>
            <button
              type="button"
              aria-label="Фильтры"
              onClick={() => setIsFilterOpen(true)}
              className="relative flex h-10 w-10 items-center justify-center text-slate-600 transition hover:text-slate-900"
            >
              <FilterIcon />
              {activeFilterCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF5C34] px-1 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          {filtered.length > 0 ? (
            <VirtualizedListingGrid
              items={filtered}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
            />
          ) : (
            <p className="text-sm text-slate-600">
              {normalizedQuery
                ? `По запросу «${normalizedQuery}» ничего не найдено. Попробуйте другой запрос.`
                : 'По заданным фильтрам ничего не найдено. Попробуйте изменить параметры.'}
            </p>
          )}
        </section>
      ) : null}

      {!isShowingResults ? (
        <>
          <header className="flex items-center justify-between">
            <h1 className="font-bold tracking-tight text-slate-900 font-sf [font-size:clamp(28px,7vw,34px)]">
              Каталог
            </h1>
            <button
              type="button"
              aria-label="Фильтры"
              onClick={() => setIsFilterOpen(true)}
              className="relative flex h-10 w-10 items-center justify-center text-slate-600 transition hover:text-slate-900"
            >
              <FilterIcon />
              {activeFilterCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF5C34] px-1 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
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
              <VirtualizedListingGrid
                items={discountedItems}
                isFavorite={isFavorite}
                toggleFavorite={toggleFavorite}
              />
            </section>
          )}
        </>
      ) : null}

      <ScrollToTopButton />

      <FilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onApply={setFilters}
        items={items}
      />
    </section>
  )
}
