import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ListingCard } from './ListingCard'
import type { Listing } from '../../types/marketplace'

const CARD_HEIGHT_ESTIMATE = 400
const OVERSCAN = 5
/** Виртуализируем только если карточек больше этого порога. */
const VIRTUALIZE_THRESHOLD = 30

type VirtualizedListingGridProps = {
  items: Listing[]
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => void
  /** Высота скролл-контейнера (по умолчанию — почти весь экран для каталога). */
  height?: string
}

export function VirtualizedListingGrid({
  items,
  isFavorite,
  toggleFavorite,
  height = 'calc(100dvh - 200px)',
}: VirtualizedListingGridProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT_ESTIMATE,
    overscan: OVERSCAN,
    useFlushSync: false,
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
    <div
      ref={parentRef}
      className="overflow-y-auto overscroll-contain"
      style={{ height, contain: 'strict' }}
    >
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
                transform: `translateY(${virtualRow.start}px)`,
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
