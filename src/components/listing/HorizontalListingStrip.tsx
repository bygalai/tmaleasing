import { memo, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ListingCard, LISTING_CARD_HEIGHT_PX } from './ListingCard'
import type { Listing } from '../../types/marketplace'

/** Ширина колонки: карточка 300px + отступ справа между слайдами */
const COLUMN_STRIDE = 316
const STRIP_VIEWPORT_HEIGHT = LISTING_CARD_HEIGHT_PX
const OVERSCAN = 5
/** Ниже порога — простой flex-ряд без виртуализатора */
const VIRTUALIZE_THRESHOLD = 16

/** Один раз за сессию вкладки: короткая анимация сдвига ряда */
const NUDGE_SESSION_KEY = 'tma:vygodno-scroll-nudge-once'

function readNudgeDone(): boolean {
  try {
    return sessionStorage.getItem(NUDGE_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function writeNudgeDone(): void {
  try {
    sessionStorage.setItem(NUDGE_SESSION_KEY, '1')
  } catch {
    /* ignore */
  }
}

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const [playNudge, setPlayNudge] = useState(false)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COLUMN_STRIDE,
    horizontal: true,
    overscan: OVERSCAN,
  })

  /**
   * Подсказка через transform на ряду карточек: видно даже без overflow
   * (раньше scrollTo не давал эффекта, если scrollWidth ≈ clientWidth).
   */
  useEffect(() => {
    if (items.length <= 1) return
    if (readNudgeDone()) return
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        writeNudgeDone()
        return
      }
    } catch {
      /* ignore */
    }

    let cancelled = false
    const t = window.setTimeout(() => {
      if (!cancelled) setPlayNudge(true)
    }, 320)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [items.length])

  const handleNudgeEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    const name = e.animationName.replace(/^['"]|['"]$/g, '')
    if (!name.includes('vygodno-row-nudge')) return
    writeNudgeDone()
    setPlayNudge(false)
  }

  if (items.length === 0) return null

  const rowNudgeClass = playNudge ? 'vygodno-nudge-once' : ''

  if (items.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div className="relative -mx-4" style={{ minHeight: STRIP_VIEWPORT_HEIGHT }}>
        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-hidden px-4 pb-3 pt-0 scroll-smooth snap-x snap-mandatory"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div
            className={`flex gap-4 ${rowNudgeClass}`}
            onAnimationEnd={handleNudgeEnd}
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
                  pricePresentation="compact"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const virtualColumns = virtualizer.getVirtualItems()

  return (
    <div className="relative -mx-4" style={{ minHeight: STRIP_VIEWPORT_HEIGHT }}>
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden px-4 pb-3"
        style={{
          WebkitOverflowScrolling: 'touch',
          height: STRIP_VIEWPORT_HEIGHT,
        }}
      >
        <div
          className={`relative h-full ${rowNudgeClass}`}
          style={{
            width: virtualizer.getTotalSize(),
            minHeight: STRIP_VIEWPORT_HEIGHT,
          }}
          onAnimationEnd={handleNudgeEnd}
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
                    pricePresentation="compact"
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})
