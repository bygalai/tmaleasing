import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ListingCard, LISTING_CARD_HEIGHT_PX } from './ListingCard'
import type { Listing } from '../../types/marketplace'

/** Ширина колонки: карточка 300px + отступ справа между слайдами */
const COLUMN_STRIDE = 316
const STRIP_VIEWPORT_HEIGHT = LISTING_CARD_HEIGHT_PX
const OVERSCAN = 5
/** Ниже порога — простой flex-ряд без виртуализатора */
const VIRTUALIZE_THRESHOLD = 16

const SWIPE_HINT_SESSION_KEY = 'tma:vygodno-swipe-hint-dismissed'
const HINT_AUTO_HIDE_MS = 12_000
const HINT_EXIT_MS = 420
const SCROLL_DISMISS_PX = 14

type HintPhase = 'off' | 'on' | 'exit'

function readHintDismissed(): boolean {
  try {
    return sessionStorage.getItem(SWIPE_HINT_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function writeHintDismissed(): void {
  try {
    sessionStorage.setItem(SWIPE_HINT_SESSION_KEY, '1')
  } catch {
    /* ignore */
  }
}

function SwipeHintOverlay({ phase, stripHeight }: { phase: 'on' | 'exit'; stripHeight: number }) {
  const exiting = phase === 'exit'
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end overflow-hidden rounded-lg"
      style={{ minHeight: stripHeight }}
      aria-hidden
    >
      <div
        className="absolute inset-y-0 right-0 w-[4.5rem] bg-gradient-to-l from-black via-black/90 to-transparent"
        style={{ maskImage: 'linear-gradient(to left, black 0%, black 55%, transparent 100%)' }}
      />
      <div className="relative flex justify-center px-4 pb-1 pt-6">
        <div
          className={`liquid-glass relative flex max-w-[min(100%,360px)] items-center gap-2 overflow-hidden rounded-md py-2 pl-2 pr-3.5 shadow-none transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            exiting ? 'translate-y-2 scale-[0.97] opacity-0' : 'translate-y-0 scale-100 opacity-100'
          }`}
        >
          <div className="liquid-glass-shimmer" aria-hidden />
          <span className="swipe-hint-arrows-anim flex shrink-0 items-center text-[#FF5C34]" aria-hidden>
            <svg
              className="-mr-2 h-6 w-6 opacity-[0.72]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
          <span className="font-sf text-left text-[13px] font-medium leading-snug text-zinc-200">
            Свайпните влево — ещё выгодные лоты
          </span>
        </div>
      </div>
    </div>
  )
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
  const hintPhaseRef = useRef<HintPhase>('off')
  const [hintPhase, setHintPhase] = useState<HintPhase>('off')

  const syncHintRef = (p: HintPhase) => {
    hintPhaseRef.current = p
    setHintPhase(p)
  }

  const beginHintExit = useCallback(() => {
    if (hintPhaseRef.current !== 'on') return
    syncHintRef('exit')
  }, [])

  useEffect(() => {
    if (items.length <= 1) {
      syncHintRef('off')
      return
    }
    if (readHintDismissed()) {
      syncHintRef('off')
      return
    }
    syncHintRef('on')
  }, [items.length])

  useEffect(() => {
    if (hintPhase !== 'exit') return
    const t = window.setTimeout(() => {
      writeHintDismissed()
      syncHintRef('off')
    }, HINT_EXIT_MS)
    return () => window.clearTimeout(t)
  }, [hintPhase])

  useEffect(() => {
    if (hintPhase !== 'on') return
    const t = window.setTimeout(() => beginHintExit(), HINT_AUTO_HIDE_MS)
    return () => window.clearTimeout(t)
  }, [hintPhase, beginHintExit])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || hintPhaseRef.current !== 'on') return
    if (el.scrollLeft > SCROLL_DISMISS_PX) beginHintExit()
  }, [beginHintExit])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => COLUMN_STRIDE,
    horizontal: true,
    overscan: OVERSCAN,
  })

  if (items.length === 0) return null

  const showHintOverlay = hintPhase === 'on' || hintPhase === 'exit'

  if (items.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div className="relative -mx-4" style={{ minHeight: STRIP_VIEWPORT_HEIGHT }}>
        {showHintOverlay ? (
          <SwipeHintOverlay phase={hintPhase === 'exit' ? 'exit' : 'on'} stripHeight={STRIP_VIEWPORT_HEIGHT} />
        ) : null}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto overflow-y-hidden px-4 pb-3 pt-0 scroll-smooth snap-x snap-mandatory"
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
                pricePresentation="compact"
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const virtualColumns = virtualizer.getVirtualItems()

  return (
    <div className="relative -mx-4" style={{ minHeight: STRIP_VIEWPORT_HEIGHT }}>
      {showHintOverlay ? (
        <SwipeHintOverlay phase={hintPhase === 'exit' ? 'exit' : 'on'} stripHeight={STRIP_VIEWPORT_HEIGHT} />
      ) : null}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-x-auto overflow-y-hidden px-4 pb-3"
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
