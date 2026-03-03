import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ListingCard } from '../components/listing/ListingCard'
import { SearchBar } from '../components/listing/SearchBar'
import type { Listing } from '../types/marketplace'
import type { CategoryId } from './CategorySelectionPage'

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
    const normalized = query.trim().toLowerCase()
    if (!normalized) return result
    return result.filter((item) =>
      [item.title, item.subtitle, item.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    )
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
