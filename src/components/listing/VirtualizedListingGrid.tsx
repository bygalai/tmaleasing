import { memo, useRef, useLayoutEffect, useReducer } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { ListingCard, LISTING_CARD_HEIGHT_PX } from './ListingCard'
import type { Listing } from '../../types/marketplace'

/** Высота строки: карточка + отступ pb-4 под следующий ряд */
const CARD_HEIGHT_ESTIMATE = LISTING_CARD_HEIGHT_PX + 16
const OVERSCAN = 3
const VIRTUALIZE_THRESHOLD = 15

type VirtualizedListingGridProps = {
  items: Listing[]
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => void
}

export const VirtualizedListingGrid = memo(function VirtualizedListingGrid({
  items,
  isFavorite,
  toggleFavorite,
}: VirtualizedListingGridProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  useLayoutEffect(() => {
    forceUpdate()
  }, [])

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
        {items.map((item, index) => (
          <ListingCard
            key={item.id}
            item={item}
            isFavorite={isFavorite(item.id)}
            onToggleFavorite={toggleFavorite}
            imagePriority={index < 4}
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
              ref={virtualizer.measureElement}
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
                  imagePriority={virtualRow.index < 4}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
