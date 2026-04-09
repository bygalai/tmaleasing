import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { ImageWithFallback } from './ImageWithFallback'

type ListingFeedGalleryProps = {
  imageUrls: string[]
  alt: string
  imagePriority?: boolean
  density?: 'default' | 'compact'
  className?: string
}

const SCROLL_STYLE: CSSProperties = {
  scrollSnapType: 'x mandatory',
  WebkitOverflowScrolling: 'touch',
  touchAction: 'pan-x',
  overscrollBehaviorX: 'contain',
}

export const ListingFeedGallery = memo(function ListingFeedGallery({
  imageUrls,
  alt,
  imagePriority = false,
  density = 'default',
  className = '',
}: ListingFeedGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const urls = imageUrls.filter((u) => u?.trim())
  const hClass = density === 'compact' ? 'h-[176px]' : 'h-[200px]'
  const multi = urls.length > 1

  useEffect(() => {
    const el = scrollRef.current
    if (!el || urls.length <= 1) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const cw = el.clientWidth
        const slideW = cw * 0.92
        const gap = 8
        const idx = Math.round(el.scrollLeft / Math.max(1, slideW + gap))
        setActiveIndex(Math.min(Math.max(0, idx), urls.length - 1))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [urls.length])

  if (urls.length === 0) {
    return (
      <div
        className={`${hClass} w-full bg-zinc-200/80 ${className}`}
        role="img"
        aria-label={alt}
      />
    )
  }

  return (
    <div className={`relative ${hClass} w-full min-w-0 max-w-full overflow-hidden bg-zinc-100 ${className}`}>
      <div
        ref={scrollRef}
        data-feed-gallery
        className={`flex h-full min-h-0 min-w-0 w-full max-w-full touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] ${
          multi ? 'gap-2 px-3' : 'scroll-smooth'
        }`}
        style={SCROLL_STYLE}
        aria-label={`Фотографии: ${urls.length}`}
        role="region"
      >
        <style>{`[data-feed-gallery]::-webkit-scrollbar { display: none; }`}</style>
        {urls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className={`relative h-full min-w-0 shrink-0 snap-center snap-always overflow-hidden bg-zinc-100 touch-pan-x ${
              multi ? 'w-[92%] rounded-xl' : 'w-full min-w-full'
            }`}
          >
            <ImageWithFallback
              imageUrls={[url]}
              alt={`${alt} — фото ${i + 1}`}
              className="h-full w-full object-cover"
              loading={imagePriority && i === 0 ? 'eager' : 'lazy'}
              fetchPriority={imagePriority && i === 0 ? 'high' : undefined}
              showPlaceholderWhenFailed
              passiveImgTouches={multi}
            />
          </div>
        ))}
      </div>

      {multi ? (
        <div
          className="pointer-events-none absolute bottom-2.5 left-0 right-0 flex justify-center gap-1"
          aria-hidden
        >
          {urls.map((_, i) => (
            <span
              key={i}
              className={`h-1 w-1 rounded-full transition-colors ${
                i === activeIndex ? 'bg-zinc-900' : 'bg-black/20'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
})
