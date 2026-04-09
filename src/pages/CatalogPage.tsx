import { useCallback, useEffect, useDeferredValue, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { VirtualizedListingGrid } from '../components/listing/VirtualizedListingGrid'
import { MarketplaceSearchCard } from '../components/listing/MarketplaceSearchCard'
import type { SuggestionItem } from '../components/listing/SearchBar'
import { FilterPanel } from '../components/listing/FilterPanel'
import { ListingSkeletonGrid } from '../components/listing/ListingCardSkeleton'
import { ScrollToTopButton } from '../components/ScrollToTopButton'
import type { Listing, CategoryId } from '../types/marketplace'

const CATALOG_QUICK_LABELS: Record<CategoryId, string> = {
  legkovye: 'Легковые',
  gruzovye: 'Грузовые',
  speztechnika: 'Спецтехника',
  pricepy: 'Прицепы',
}

const CATALOG_QUICK_IDS: CategoryId[] = ['legkovye', 'gruzovye', 'speztechnika', 'pricepy']
import { getTelegramUserFromInitData } from '../lib/telegram'
import {
  BRAND_SYNONYMS,
  DEFAULT_SUGGESTIONS_BY_CATEGORY,
  matchesSearch,
  normalizeForSearch,
} from '../lib/search'
import {
  type FilterState,
  countActiveFilters,
  applyFilters,
  parseCatalogStateFromSearchParams,
  catalogStateToSearchParams,
} from '../lib/filters'

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
  const [searchParams, setSearchParams] = useSearchParams()

  const { query, filters } = useMemo(
    () => parseCatalogStateFromSearchParams(searchParams),
    [searchParams],
  )

  const updateCatalogState = useCallback(
    (nextQuery: string, nextFilters: FilterState) => {
      const params = catalogStateToSearchParams(nextQuery, nextFilters)
      setSearchParams(params, { replace: true })
    },
    [setSearchParams],
  )

  const setQuery = useCallback(
    (value: string | ((prev: string) => string)) => {
      const next = typeof value === 'function' ? value(query) : value
      updateCatalogState(next, filters)
    },
    [query, filters, updateCatalogState],
  )

  const setFilters = useCallback(
    (value: FilterState | ((prev: FilterState) => FilterState)) => {
      const next = typeof value === 'function' ? value(filters) : value
      updateCatalogState(query, next)
    },
    [query, filters, updateCatalogState],
  )

  const [history, setHistory] = useState<string[]>([])
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const activeFilterCount = countActiveFilters(filters)

  useEffect(() => {
    try {
      const user = getTelegramUserFromInitData()
      const userKey = user?.id ?? user?.username ?? 'guest'
      const categoryKey = categoryId ?? 'all'
      const storageKey = `tma:searchHistory:${userKey}:${categoryKey}`
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
  }, [categoryId])

  const deferredQuery = useDeferredValue(query)
  const deferredFilters = useDeferredValue(filters)

  const categoryItems = useMemo(() => {
    if (!categoryId) return items
    return items.filter((item) => (item.category ?? 'legkovye') === categoryId)
  }, [items, categoryId])

  const filtered = useMemo(() => {
    let result = categoryItems
    const trimmed = deferredQuery.trim()
    if (trimmed) {
      result = result.filter((item) => matchesSearch(item, trimmed))
    }
    if (countActiveFilters(deferredFilters) > 0) {
      result = applyFilters(result, deferredFilters)
    }
    return result
  }, [categoryItems, deferredQuery, deferredFilters])

  const normalizedQuery = query.trim()

  const saveToHistory = useCallback(
    (term: string) => {
      const trimmed = term.trim()
      if (trimmed.length < 3) return
      if (!categoryItems.some((item) => matchesSearch(item, trimmed))) return
      try {
        const user = getTelegramUserFromInitData()
        const userKey = user?.id ?? user?.username ?? 'guest'
        const categoryKey = categoryId ?? 'all'
        const storageKey = `tma:searchHistory:${userKey}:${categoryKey}`
        setHistory((prev) => {
          const next = [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, 10)
          window.localStorage.setItem(storageKey, JSON.stringify(next))
          return next
        })
      } catch { /* ignore */ }
    },
    [categoryItems, categoryId],
  )

  const deleteFromHistory = useCallback(
    (term: string) => {
      try {
        const user = getTelegramUserFromInitData()
        const userKey = user?.id ?? user?.username ?? 'guest'
        const categoryKey = categoryId ?? 'all'
        const storageKey = `tma:searchHistory:${userKey}:${categoryKey}`
        setHistory((prev) => {
          const next = prev.filter((q) => q !== term)
          window.localStorage.setItem(storageKey, JSON.stringify(next))
          return next
        })
      } catch { /* ignore */ }
    },
    [categoryId],
  )

  const baseDefaults =
    (categoryId && DEFAULT_SUGGESTIONS_BY_CATEGORY[categoryId]) ?? DEFAULT_SUGGESTIONS_BY_CATEGORY.default
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
        count: categoryItems.filter((item) => matchesSearch(item, h)).length,
      }))
    }
    return baseDefaults.map((d) => ({
      label: d,
      kind: 'suggestion' as const,
      count: categoryItems.filter((item) => matchesSearch(item, d)).length,
    }))
  }, [isSearchFocused, history, baseDefaults, categoryItems])

  const effectiveSuggestions: SuggestionItem[] = isSearchFocused
    ? normalizedQuery.length > 0
      ? typedSuggestions
      : focusSuggestions
    : []

  const quickCategories = useMemo(() => {
    const qs = searchParams.toString()
    const suffix = qs ? `?${qs}` : ''
    return CATALOG_QUICK_IDS.map((id) => ({
      id,
      label: CATALOG_QUICK_LABELS[id],
      to: `/catalog/${id}${suffix}`,
      active: categoryId === id,
    }))
  }, [categoryId, searchParams])

  const handleSearchFocusChange = (focused: boolean) => {
    setIsSearchFocused(focused)
    onSearchFocusedChange?.(focused)
  }

  return (
    <section className="page-transition space-y-4">
      <MarketplaceSearchCard
        value={query}
        onChange={setQuery}
        suggestions={effectiveSuggestions}
        onSuggestionClick={(value) => {
          setQuery(value)
          saveToHistory(value)
        }}
        onDeleteSuggestion={deleteFromHistory}
        onSearchFocusBroadcast={handleSearchFocusChange}
        isSearchFocused={isSearchFocused}
        onSubmit={() => saveToHistory(query)}
        hintLoading={isLoading}
        hintCount={filtered.length}
        onOpenFilters={() => setIsFilterOpen(true)}
        activeFilterCount={activeFilterCount}
        quickCategories={quickCategories}
      />

      {error ? (
        <div className="mx-auto max-w-[560px] rounded-xl border border-brand/25 bg-brand/10 px-3 py-2.5 font-sf text-xs text-zinc-800">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <ListingSkeletonGrid count={3} />
      ) : filtered.length === 0 ? (
        <div className="mx-auto w-full max-w-[560px] px-2 text-center text-sm font-sf text-ios-label">
          Ничего не найдено.
          <br />
          Попробуйте изменить запрос или фильтры
        </div>
      ) : (
        <VirtualizedListingGrid
          items={filtered}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
        />
      )}

      <ScrollToTopButton />

      <FilterPanel
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onApply={setFilters}
        items={categoryItems}
        category={categoryId}
      />
    </section>
  )
}
