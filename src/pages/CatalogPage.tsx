import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ListingCard } from '../components/listing/ListingCard'
import { SearchBar } from '../components/listing/SearchBar'
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

  const filtered = useMemo(() => {
    let result = items
    if (categoryId) {
      result = result.filter((item) => (item.category ?? 'legkovye') === categoryId)
    }
    const trimmed = query.trim()
    if (!trimmed) return result
    return result.filter((item) => matchesSearch(item, trimmed))
  }, [items, query, categoryId])

  const MIN_HISTORY_QUERY_LENGTH = 3

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) return
    if (trimmed.length < MIN_HISTORY_QUERY_LENGTH) return
    if (filtered.length === 0) return

    const timeoutId = window.setTimeout(() => {
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
      } catch {
        // ignore
      }
    }, 700)

    return () => window.clearTimeout(timeoutId)
  }, [query, filtered.length, categoryId])

  const baseDefaults =
    (categoryId && DEFAULT_SUGGESTIONS_BY_CATEGORY[categoryId]) ?? DEFAULT_SUGGESTIONS_BY_CATEGORY.default
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

  const handleSuggestionClick = (value: string) => {
    // Явно подменяем запрос на выбранное слово
    setQuery(value)
  }

  return (
    <section className="space-y-4">
      <SearchBar
        value={query}
        onChange={setQuery}
        suggestions={effectiveSuggestions}
        onSuggestionClick={handleSuggestionClick}
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
