import { ListingCard } from '../components/listing/ListingCard'
import { ScrollToTopButton } from '../components/ScrollToTopButton'
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
      <section className="page-transition flex min-h-[40vh] flex-1 items-center justify-center">
        <p className="font-sf text-zinc-500">
          Здесь пока пусто
        </p>
      </section>
    )
  }

  return (
    <section className="page-transition grid gap-4 pb-4">
      {favorites.map((item) => (
        <ListingCard
          key={item.id}
          item={item}
          isFavorite={isFavorite(item.id)}
          onToggleFavorite={toggleFavorite}
        />
      ))}
      <ScrollToTopButton />
    </section>
  )
}
