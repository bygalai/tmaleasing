import { memo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ListingCard, LISTING_CARD_HEIGHT_PX } from './ListingCard'
import type { Listing } from '../../types/marketplace'

/** Ширина колонки: карточка 300px + отступ справа между слайдами */
const COLUMN_STRIDE = 316
const STRIP_VIEWPORT_HEIGHT = LISTING_CARD_HEIGHT_PX
const OVERSCAN = 5
/** Ниже порога — простой flex-ряд без виртуализатора */
const VIRTUALIZE_THRESHOLD = 16

type HorizontalListingStripProps = {
  items: Listing[]
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => void
}

export const HorizontalListingStrip = memo(function HorizontalListingStrip({
  items,
  isFavorite,
  toggleFavorite,
}: HorizontalListingStripProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => COLUMN_STRIDE,
    horizontal: true,
    overscan: OVERSCAN,
  })

  if (items.length === 0) return null

  if (items.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div
        className="-mx-4 flex gap-4 overflow-x-auto overflow-y-hidden px-4 pb-3 pt-0 scroll-smooth snap-x snap-mandatory"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="w-[min(85vw,300px)] shrink-0 snap-center [scroll-snap-align:center]"
          >
            <ListingCard
              item={item}
              isFavorite={isFavorite(item.id)}
              onToggleFavorite={toggleFavorite}
            />
          </div>
        ))}
      </div>
    )
  }

  const virtualColumns = virtualizer.getVirtualItems()

  return (
    <div
      ref={parentRef}
      className="-mx-4 overflow-x-auto overflow-y-hidden px-4 pb-3"
      style={{
        WebkitOverflowScrolling: 'touch',
        height: STRIP_VIEWPORT_HEIGHT,
      }}
    >
      <div
        className="relative h-full"
        style={{
          width: virtualizer.getTotalSize(),
          minHeight: STRIP_VIEWPORT_HEIGHT,
        }}
      >
        {virtualColumns.map((vi) => {
          const item = items[vi.index]
          if (!item) return null
          return (
            <div
              key={item.id}
              data-index={vi.index}
              className="absolute left-0 top-0 flex h-full justify-start"
              style={{
                width: vi.size,
                transform: `translateX(${vi.start}px)`,
              }}
            >
              <div className="w-[min(300px,85vw)] shrink-0 pr-4">
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
})
