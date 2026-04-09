import { useCallback, useEffect, useDeferredValue, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { HorizontalListingStrip } from '../components/listing/HorizontalListingStrip'
import { VirtualizedListingGrid } from '../components/listing/VirtualizedListingGrid'
import { MarketplaceSearchCard } from '../components/listing/MarketplaceSearchCard'
import type { SuggestionItem } from '../components/listing/SearchBar'
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

/** Порядок в блоке «Выгодно»: грузовые → спецтехника → легковые → прицепы */
const PROFITABLE_SECTION_CATEGORY_RANK: Record<CategoryId, number> = {
  gruzovye: 0,
  speztechnika: 1,
  legkovye: 2,
  pricepy: 3,
}

function compareListingForProfitableSection(a: Listing, b: Listing): number {
  const rank = (cat?: string) => {
    if (cat && cat in PROFITABLE_SECTION_CATEGORY_RANK) {
      return PROFITABLE_SECTION_CATEGORY_RANK[cat as CategoryId]
    }
    return 99
  }
  return rank(a.category) - rank(b.category)
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
      className={`group relative block min-h-[100px] overflow-hidden rounded-lg transition-transform active:scale-[0.98] ${className}`}
    >
      <div
        className={`relative flex h-full min-h-full flex-col justify-end p-5 pt-12 ${
          isAccent
            ? 'bg-[#FF5C34] text-white'
            : 'rounded-2xl border border-zinc-200/90 bg-white shadow-sm'
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
              isAccent ? 'text-white' : 'text-ios-label'
            }`}
          />
        </div>
        <div>
          <p
            className={`font-bold tracking-tight font-sf [font-size:clamp(18px,4.5vw,22px)] ${
              isAccent ? 'text-white' : 'text-zinc-900'
            }`}
          >
            {category.label}
          </p>
          <p
            className={`mt-1 text-sm font-sf font-normal ${
              isAccent ? 'text-white/85' : 'text-ios-label'
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

  const deferredQuery = useDeferredValue(query)
  const deferredFilters = useDeferredValue(filters)

  const filtered = useMemo(() => {
    let result = items
    const trimmed = deferredQuery.trim()
    if (trimmed) {
      result = result.filter((item) => matchesSearch(item, trimmed))
    }
    if (countActiveFilters(deferredFilters) > 0) {
      result = applyFilters(result, deferredFilters)
    }
    return result
  }, [items, deferredQuery, deferredFilters])

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
    if (!isSearchFocused) return []
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
  }, [isSearchFocused, history, baseDefaults, items])

  const effectiveSuggestions: SuggestionItem[] = isSearchFocused
    ? normalizedQuery.length > 0
      ? typedSuggestions
      : focusSuggestions
    : []

  const discountedItems = useMemo(() => {
    return items
      .filter((item) => item.badges.includes('discount'))
      .sort(compareListingForProfitableSection)
  }, [items])

  const quickCategories = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        to: c.href,
        active: false,
      })),
    [],
  )

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
            showSearchBackButton ? 'h-14 bg-app-bg/90 pb-2 pt-2 backdrop-blur-sm' : 'h-0 pb-0 pt-0 pointer-events-none'
          }`}
        >
          <button
            ref={backBtnRef}
            type="button"
            onClick={handleClearResults}
            onPointerMove={handleBackPointerMove}
            onPointerLeave={handleBackPointerLeave}
            aria-label="Назад к каталогу"
            className={`relative z-30 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200/90 bg-white text-zinc-700 shadow-md transition-all duration-300 ease-out active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg ${
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

      <MarketplaceSearchCard
        value={query}
        onChange={setQueryAndUrl}
        suggestions={effectiveSuggestions}
        onSuggestionClick={saveToHistory}
        onDeleteSuggestion={deleteFromHistory}
        onSubmit={() => saveToHistory(query)}
        isSearchFocused={isSearchFocused}
        onSearchFocusBroadcast={(focused) => {
          setIsSearchFocused(focused)
          onSearchFocusedChange?.(focused)
        }}
        hintCount={isShowingResults ? filtered.length : items.length}
        onOpenFilters={() => setIsFilterOpen(true)}
        activeFilterCount={activeFilterCount}
        quickCategories={isShowingResults ? undefined : quickCategories}
      />

      {isShowingResults ? (
        <section className="space-y-3">
          <h2 className="font-sf font-bold tracking-tight text-zinc-900 [font-size:clamp(20px,5vw,26px)]">
            {normalizedQuery ? 'Результаты поиска' : 'Все лоты'}
          </h2>
          {filtered.length > 0 ? (
            <VirtualizedListingGrid
              items={filtered}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
            />
          ) : (
            <p className="text-sm text-ios-label">
              {normalizedQuery
                ? `По запросу «${normalizedQuery}» ничего не найдено. Попробуйте другой запрос.`
                : 'По заданным фильтрам ничего не найдено. Попробуйте изменить параметры.'}
            </p>
          )}
        </section>
      ) : null}

      {!isShowingResults ? (
        <>
          <header>
            <h1 className="font-bold tracking-tight text-zinc-900 font-sf [font-size:clamp(28px,7vw,34px)]">
              Каталог
            </h1>
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
              <h2 className="font-sf font-bold tracking-tight text-zinc-900 [font-size:clamp(28px,7vw,34px)]">
                Выгодно
              </h2>
              <HorizontalListingStrip
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
