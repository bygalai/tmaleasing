import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { VirtualizedListingGrid } from '../components/listing/VirtualizedListingGrid'
import { SearchBar, type SuggestionItem } from '../components/listing/SearchBar'
import type { Listing } from '../types/marketplace'
import type { CategoryId } from './CategorySelectionPage'
import { getTelegramUserFromInitData } from '../lib/telegram'
import {
  BRAND_SYNONYMS,
  DEFAULT_SUGGESTIONS_BY_CATEGORY,
  matchesSearch,
  normalizeForSearch,
} from '../lib/search'

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
  }, [])

  const categoryItems = useMemo(() => {
    if (!categoryId) return items
    return items.filter((item) => (item.category ?? 'legkovye') === categoryId)
  }, [items, categoryId])

  const filtered = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return categoryItems
    return categoryItems.filter((item) => matchesSearch(item, trimmed))
  }, [categoryItems, query])

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
  }, [history, baseDefaults, categoryItems])

  const effectiveSuggestions: SuggestionItem[] = isSearchFocused
    ? normalizedQuery.length > 0
      ? typedSuggestions
      : focusSuggestions
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
        onSuggestionClick={(value) => {
          setQuery(value)
          saveToHistory(value)
        }}
        onDeleteSuggestion={deleteFromHistory}
        onFocusChange={handleSearchFocusChange}
        onSubmit={() => saveToHistory(query)}
      />

      {error ? (
        <div className="mx-auto max-w-[560px] rounded-xl border border-[#FF5C34]/40 bg-[#FF5C34]/10 px-3 py-2 text-xs text-[#9A3412]">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-center text-sm text-slate-600">Загружаем лучшие предложения...</p>
      ) : filtered.length === 0 ? (
        <div className="mx-auto w-full max-w-[560px] px-2 text-center text-sm font-sf text-slate-900">
          Ничего не найдено. Попробуйте ещё раз
        </div>
      ) : (
        <VirtualizedListingGrid
          items={filtered}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
        />
      )}
    </section>
  )
}
