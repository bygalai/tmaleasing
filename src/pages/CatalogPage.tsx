import { useMemo, useState } from 'react'
import { ListingCard } from '../components/listing/ListingCard'
import { SearchBar } from '../components/listing/SearchBar'
import type { Listing } from '../types/marketplace'

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
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items

    return items.filter((item) =>
      [item.title, item.subtitle, item.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    )
  }, [items, query])

  return (
    <section className="space-y-4">
      <SearchBar value={query} onChange={setQuery} />

      {error ? (
        <div className="rounded-xl border border-[#FF5C34]/40 bg-[#FF5C34]/10 px-3 py-2 text-xs text-[#FFD1C7]">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-white/70">Загружаем предложения...</p>
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
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/70">
              По вашему запросу ничего не найдено.
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
