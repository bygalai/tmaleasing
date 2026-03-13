import { useRef } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { ListingCard } from './ListingCard'
import type { Listing } from '../../types/marketplace'

const CARD_HEIGHT_ESTIMATE = 400
const OVERSCAN = 5
const VIRTUALIZE_THRESHOLD = 30

type VirtualizedListingGridProps = {
  items: Listing[]
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => void
}

export function VirtualizedListingGrid({
  items,
  isFavorite,
  toggleFavorite,
}: VirtualizedListingGridProps) {
  const listRef = useRef<HTMLDivElement>(null)

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => CARD_HEIGHT_ESTIMATE,
    overscan: OVERSCAN,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  })

  const virtualItems = virtualizer.getVirtualItems()

  if (items.length === 0) {
    return null
  }

  if (items.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div className="grid gap-4 pb-4">
        {items.map((item) => (
          <ListingCard
            key={item.id}
            item={item}
            isFavorite={isFavorite(item.id)}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </div>
    )
  }

  return (
    <div ref={listRef}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index]
          if (!item) return null
          return (
            <div
              key={item.id}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <div className="pb-4">
                <ListingCard
                  item={item}
                  isFavorite={isFavorite(item.id)}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
