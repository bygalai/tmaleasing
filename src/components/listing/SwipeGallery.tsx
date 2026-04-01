import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react'

type SwipeGalleryProps = {
  imageUrls: string[]
  alt: string
  className?: string
  /** Показать placeholder при ошибке загрузки всех фото */
  showPlaceholderWhenFailed?: boolean
}

const PLACEHOLDER_STYLE =
  'bg-zinc-900 text-zinc-600 flex items-center justify-center text-sm font-sf'

const GALLERY_SCROLL_STYLE = {
  scrollSnapType: 'x mandatory' as const,
  WebkitOverflowScrolling: 'touch' as const,
  touchAction: 'pan-x' as const,
}

const TAP_TOLERANCE_PX = 10
const SWIPE_THRESHOLD_PX = 36

type TouchTrack = {
  x: number
  y: number
  scrollLeft: number
  moved: boolean
} | null

function clampIndex(value: number, max: number): number {
  return Math.max(0, Math.min(value, max))
}

function snapToIndex(el: HTMLDivElement | null, index: number, behavior: ScrollBehavior = 'smooth') {
  if (!el) return
  const width = el.clientWidth || 1
  el.scrollTo({ left: width * index, behavior })
}

export function SwipeGallery({
  imageUrls,
  alt,
  className = '',
  showPlaceholderWhenFailed = false,
}: SwipeGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lightboxRef = useRef<HTMLDivElement>(null)
  const galleryTouchRef = useRef<TouchTrack>(null)
  const suppressTapUntilRef = useRef(0)
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
    if (validUrls.length === 0) return
    setActiveIndex((prev) => clampIndex(prev, validUrls.length - 1))
    setLightboxIndex((prev) => clampIndex(prev, validUrls.length - 1))
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
    const scrollToIndex = () => {
      const w = el.clientWidth || el.offsetWidth || 1
      el.scrollLeft = lightboxIndex * w
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToIndex)
    })
    const t = setTimeout(scrollToIndex, 100)
    return () => clearTimeout(t)
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
    className: 'min-h-0 min-w-0 max-h-full max-w-full shrink-0 object-contain object-center select-none',
  }

  const handleGalleryTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0]
    const el = scrollRef.current
    galleryTouchRef.current = {
      x: t.clientX,
      y: t.clientY,
      scrollLeft: el?.scrollLeft ?? 0,
      moved: false,
    }
  }, [])

  const handleGalleryTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0]
    const data = galleryTouchRef.current
    if (!data) return
    if (Math.abs(t.clientX - data.x) > TAP_TOLERANCE_PX || Math.abs(t.clientY - data.y) > TAP_TOLERANCE_PX) {
      data.moved = true
    }
  }, [])

  const handleGalleryTouchEnd = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const data = galleryTouchRef.current
    const el = scrollRef.current
    if (!data || !el || validUrls.length <= 1) {
      galleryTouchRef.current = null
      return
    }
    const t = e.changedTouches[0]
    const deltaX = data.x - t.clientX
    const width = el.clientWidth || 1
    const startIndex = clampIndex(Math.round(data.scrollLeft / width), validUrls.length - 1)
    const nearestIndex = clampIndex(Math.round(el.scrollLeft / width), validUrls.length - 1)
    let targetIndex = nearestIndex
    if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX) {
      targetIndex = clampIndex(startIndex + (deltaX > 0 ? 1 : -1), validUrls.length - 1)
    }
    snapToIndex(el, targetIndex)
    setActiveIndex(targetIndex)
    if (data.moved) suppressTapUntilRef.current = Date.now() + 250
    galleryTouchRef.current = null
  }, [validUrls.length])

  const handleGalleryClick = useCallback((_e: MouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressTapUntilRef.current) return
    openLightbox(activeIndex)
  }, [activeIndex, openLightbox])


  if (validUrls.length === 1) {
    return (
      <div
        className={`relative flex min-h-0 cursor-pointer items-center justify-center overflow-hidden bg-zinc-950 ${className}`}
        onClick={() => openLightbox(0)}
        onTouchStart={handleGalleryTouchStart}
        onTouchMove={handleGalleryTouchMove}
        onTouchEnd={handleGalleryTouchEnd}
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
          className="min-h-0 min-w-0 max-h-full max-w-full shrink-0 object-contain object-center select-none"
          draggable={false}
          referrerPolicy="no-referrer"
          style={{ touchAction: 'pan-x' }}
        />
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        ref={scrollRef}
        data-swipe-gallery
        className="flex h-full w-full cursor-pointer overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth bg-zinc-950 [scrollbar-width:none] [-ms-overflow-style:none]"
        style={GALLERY_SCROLL_STYLE}
        role="region"
        aria-label={`Галерея: ${validUrls.length} фото. Нажмите для просмотра`}
        onClick={handleGalleryClick}
        onTouchStart={handleGalleryTouchStart}
        onTouchMove={handleGalleryTouchMove}
        onTouchEnd={handleGalleryTouchEnd}
        onKeyDown={(e) => e.key === 'Enter' && openLightbox(activeIndex)}
      >
        <style>{`
          [data-swipe-gallery]::-webkit-scrollbar { display: none; }
          [data-swipe-gallery] img { -webkit-user-drag: none; user-select: none; }
        `}</style>
        {validUrls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="flex h-full min-w-full shrink-0 snap-center snap-always items-center justify-center"
            style={{ scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
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

      {lightboxOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[999] flex flex-col bg-black"
              role="dialog"
              aria-modal="true"
              aria-label="Просмотр фото"
              style={{
                height: '100dvh',
                minHeight: '-webkit-fill-available',
              }}
            >
              <button
                type="button"
                onClick={closeLightbox}
                className="absolute right-4 z-[1000] flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition active:bg-black/80"
                style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
                aria-label="Закрыть"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>

              <div
                className="pointer-events-none absolute left-4 z-[1000] rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white"
                style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
              >
                {lightboxIndex + 1} / {validUrls.length}
              </div>

              <div
                ref={lightboxRef}
                data-swipe-gallery
                className="absolute left-0 right-0 top-0 bottom-0 flex overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none]"
                style={{
                  ...GALLERY_SCROLL_STYLE,
                  top: 'max(3rem, calc(env(safe-area-inset-top) + 3rem))',
                  bottom: 'max(4rem, env(safe-area-inset-bottom))',
                  minHeight: 0,
                }}
                onClick={(e) => e.target === e.currentTarget && closeLightbox()}
              >
                <style>{`
                  [data-swipe-gallery]::-webkit-scrollbar { display: none; }
                `}</style>
                {validUrls.map((url, i) => (
                  <div
                    key={`lightbox-${url}-${i}`}
                    className="flex h-full w-full min-w-full shrink-0 snap-center snap-always items-center justify-center bg-black p-4"
                    style={{
                      scrollSnapAlign: 'center',
                      scrollSnapStop: 'always',
                      width: '100%',
                      minWidth: '100%',
                    }}
                  >
                    <img
                      src={url}
                      alt={`${alt} — фото ${i + 1}`}
                      className="h-auto max-h-full w-auto max-w-full object-contain select-none"
                      draggable={false}
                      referrerPolicy="no-referrer"
                      loading="eager"
                      style={{ touchAction: 'pan-x' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                ))}
              </div>

              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 flex justify-center gap-2 py-4"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                {validUrls.map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                      i === lightboxIndex ? 'bg-white' : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
