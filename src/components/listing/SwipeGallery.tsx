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

const GALLERY_SCROLL_STYLE = {
  scrollSnapType: 'x mandatory' as const,
  WebkitOverflowScrolling: 'touch' as const,
  touchAction: 'pan-x' as const,
}

export function SwipeGallery({
  imageUrls,
  alt,
  className = '',
  showPlaceholderWhenFailed = false,
}: SwipeGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lightboxRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set())
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const urls = imageUrls.filter((u) => u && u.trim().length > 0)
  const validUrls = urls.filter((u) => !failedUrls.has(u))

  const handleImageError = useCallback((url: string) => {
    setFailedUrls((prev) => new Set(prev).add(url))
  }, [])

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }, [])

  const handleGalleryTap = useCallback(
    (index: number) => (e: React.TouchEvent | React.MouseEvent) => {
      const isTouch = 'touches' in e
      if (isTouch) {
        const touch = (e as React.TouchEvent).changedTouches[0]
        const start = touchStartRef.current
        if (start) {
          const dx = Math.abs(touch.clientX - start.x)
          const dy = Math.abs(touch.clientY - start.y)
          if (dx > 15 || dy > 15) return
        }
      }
      openLightbox(index)
    },
    [openLightbox],
  )

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }, [])

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null
  }, [])

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false)
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

  useEffect(() => {
    if (!lightboxOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [lightboxOpen, closeLightbox])

  useEffect(() => {
    if (!lightboxOpen || !lightboxRef.current) return
    const el = lightboxRef.current
    const itemWidth = el.offsetWidth
    el.scrollLeft = lightboxIndex * itemWidth
  }, [lightboxOpen, lightboxIndex])

  useEffect(() => {
    const el = lightboxRef.current
    if (!lightboxOpen || !el || validUrls.length <= 1) return

    let rafId = 0
    const updateLightboxIndex = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const scrollLeft = el.scrollLeft
        const itemWidth = el.offsetWidth
        const index = Math.round(scrollLeft / itemWidth)
        setLightboxIndex((prev) => {
          const next = Math.min(index, validUrls.length - 1)
          return prev !== next ? next : prev
        })
      })
    }

    el.addEventListener('scroll', updateLightboxIndex, { passive: true })
    return () => {
      el.removeEventListener('scroll', updateLightboxIndex)
      cancelAnimationFrame(rafId)
    }
  }, [lightboxOpen, validUrls.length])

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

  const imageProps = {
    draggable: false,
    referrerPolicy: 'no-referrer' as const,
    style: { touchAction: 'pan-x' as const },
    className: 'h-full w-full object-cover select-none',
  }

  if (validUrls.length === 1) {
    return (
      <div
        className={`relative flex cursor-pointer overflow-hidden ${className}`}
        onClick={() => openLightbox(0)}
        onTouchStart={handleTouchStart}
        onTouchEnd={(e) => {
          if (e.changedTouches[0]) handleGalleryTap(0)(e as unknown as React.TouchEvent)
          handleTouchEnd()
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && openLightbox(0)}
        aria-label="Открыть фото"
      >
        <img
          src={validUrls[0]}
          alt={alt}
          loading="lazy"
          onError={() => handleImageError(validUrls[0])}
          {...imageProps}
        />
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        ref={scrollRef}
        data-swipe-gallery
        className="flex h-full w-full cursor-pointer overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none]"
        style={GALLERY_SCROLL_STYLE}
        role="region"
        aria-label={`Галерея: ${validUrls.length} фото. Нажмите для просмотра`}
        onClick={() => openLightbox(activeIndex)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchEndCapture={(e) => {
          const touch = e.changedTouches[0]
          if (touch) handleGalleryTap(activeIndex)(e as unknown as React.TouchEvent)
        }}
        onKeyDown={(e) => e.key === 'Enter' && openLightbox(activeIndex)}
      >
        <style>{`
          [data-swipe-gallery]::-webkit-scrollbar { display: none; }
          [data-swipe-gallery] img { -webkit-user-drag: none; user-select: none; }
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
              loading={i === 0 ? 'eager' : 'lazy'}
              onError={() => handleImageError(url)}
              {...imageProps}
            />
          </div>
        ))}
      </div>

      <div
        className="pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center gap-1.5 px-2 py-1"
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

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фото"
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition active:bg-black/70"
            style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
            aria-label="Закрыть"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <div
            ref={lightboxRef}
            data-swipe-gallery
            className="flex flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none]"
            style={GALLERY_SCROLL_STYLE}
            onClick={(e) => e.target === e.currentTarget && closeLightbox()}
          >
            <style>{`
              [data-swipe-gallery]::-webkit-scrollbar { display: none; }
            `}</style>
            {validUrls.map((url, i) => (
              <div
                key={`lightbox-${url}-${i}`}
                className="flex min-w-full shrink-0 snap-center snap-always items-center justify-center p-4"
                style={{ scrollSnapAlign: 'center' }}
              >
                <img
                  src={url}
                  alt={`${alt} — фото ${i + 1}`}
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                  referrerPolicy="no-referrer"
                  style={{ touchAction: 'pan-x' }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-1.5 py-3">
            {validUrls.map((_, i) => (
              <span
                key={i}
                className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                  i === lightboxIndex ? 'bg-white' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
