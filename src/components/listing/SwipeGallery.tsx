import { useCallback, useEffect, useRef, useState } from 'react'

type SwipeGalleryProps = {
  imageUrls: string[]
  alt: string
  className?: string
  /** Показать placeholder при ошибке загрузки всех фото */
  showPlaceholderWhenFailed?: boolean
}

const PLACEHOLDER_STYLE =
  'bg-slate-200 text-slate-400 flex items-center justify-center text-sm font-sf'

export function SwipeGallery({
  imageUrls,
  alt,
  className = '',
  showPlaceholderWhenFailed = false,
}: SwipeGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set())

  const urls = imageUrls.filter((u) => u && u.trim().length > 0)
  const validUrls = urls.filter((u) => !failedUrls.has(u))

  const handleImageError = useCallback((url: string) => {
    setFailedUrls((prev) => new Set(prev).add(url))
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || validUrls.length <= 1) return

    let rafId = 0
    const updateIndex = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const scrollLeft = el.scrollLeft
        const itemWidth = el.offsetWidth
        const index = Math.round(scrollLeft / itemWidth)
        setActiveIndex((prev) => {
          const next = Math.min(index, validUrls.length - 1)
          return prev !== next ? next : prev
        })
      })
    }

    el.addEventListener('scroll', updateIndex, { passive: true })
    return () => {
      el.removeEventListener('scroll', updateIndex)
      cancelAnimationFrame(rafId)
    }
  }, [validUrls.length])

  if (validUrls.length === 0) {
    if (showPlaceholderWhenFailed) {
      return (
        <div className={`${PLACEHOLDER_STYLE} ${className}`} role="img" aria-label={alt}>
          Нет фото
        </div>
      )
    }
    return null
  }

  if (validUrls.length === 1) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img
          src={validUrls[0]}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => handleImageError(validUrls[0])}
        />
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        ref={scrollRef}
        data-swipe-gallery
        className="flex h-full w-full overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none]"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
        role="region"
        aria-label={`Галерея: ${validUrls.length} фото`}
      >
        <style>{`
          [data-swipe-gallery]::-webkit-scrollbar { display: none; }
        `}</style>
        {validUrls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="h-full min-w-full shrink-0 snap-center snap-always"
            style={{ scrollSnapAlign: 'center' }}
          >
            <img
              src={url}
              alt={`${alt} — фото ${i + 1}`}
              className="h-full w-full object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
              referrerPolicy="no-referrer"
              onError={() => handleImageError(url)}
            />
          </div>
        ))}
      </div>

      <div
        className="absolute bottom-3 left-0 right-0 z-10 flex justify-center gap-1.5 px-2 py-1"
        aria-hidden
      >
        <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 backdrop-blur-sm">
          {validUrls.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                i === activeIndex ? 'bg-white' : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
