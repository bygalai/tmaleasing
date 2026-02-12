import { ListingCard } from '../components/listing/ListingCard'
import type { Listing } from '../types/marketplace'

type FavoritesPageProps = {
  items: Listing[]
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => void
}

export function FavoritesPage({ items, isFavorite, toggleFavorite }: FavoritesPageProps) {
  const favorites = items.filter((item) => isFavorite(item.id))

  if (favorites.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/70">
        Здесь появится техника, которую вы лайкнули.
      </section>
    )
  }

  return (
    <section className="grid gap-4 pb-4">
      {favorites.map((item) => (
        <ListingCard
          key={item.id}
          item={item}
          isFavorite={isFavorite(item.id)}
          onToggleFavorite={toggleFavorite}
        />
      ))}
    </section>
  )
}
