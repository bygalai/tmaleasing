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
  'bg-slate-200 text-slate-400 flex items-center justify-center text-sm font-sf'

const GALLERY_SCROLL_STYLE = {
  scrollSnapType: 'x mandatory' as const,
  WebkitOverflowScrolling: 'touch' as const,
  touchAction: 'pan-x' as const,
}

const TAP_TOLERANCE_PX = 10
const SWIPE_THRESHOLD_PX = 36
const IMMERSIVE_GRID_RADIUS = 2
const IMMERSIVE_GRID_STRIDE = 3
const IMMERSIVE_TILE_GAP_PX = 14
const IMMERSIVE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

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

function wrapIndex(value: number, length: number): number {
  if (length <= 0) return 0
  return ((value % length) + length) % length
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(url)
}

function getImmersiveTileSizePx(): number {
  if (typeof window === 'undefined') return 128
  return Math.max(112, Math.min(180, Math.round(window.innerWidth * 0.28)))
}

export function SwipeGallery({
  imageUrls,
  alt,
  className = '',
  showPlaceholderWhenFailed = false,
}: SwipeGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const galleryTouchRef = useRef<TouchTrack>(null)
  const immersiveTouchRef = useRef<{ x: number; y: number } | null>(null)
  const suppressTapUntilRef = useRef(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set())
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [immersiveOffset, setImmersiveOffset] = useState({ x: 0, y: 0 })
  const [immersiveDragging, setImmersiveDragging] = useState(false)

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

  const handleImmersiveTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0]
    immersiveTouchRef.current = { x: t.clientX, y: t.clientY }
    setImmersiveDragging(true)
  }, [])

  const handleImmersiveTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const start = immersiveTouchRef.current
    if (!start) return
    const t = e.touches[0]
    setImmersiveOffset({ x: t.clientX - start.x, y: t.clientY - start.y })
  }, [])

  const handleImmersiveTouchEnd = useCallback(() => {
    const tileStep = getImmersiveTileSizePx() + IMMERSIVE_TILE_GAP_PX
    const movedX = immersiveOffset.x
    const movedY = immersiveOffset.y
    const threshold = Math.max(SWIPE_THRESHOLD_PX, tileStep * 0.22)

    let stepX = 0
    let stepY = 0
    if (Math.abs(movedX) >= threshold) {
      // Свайп влево -> открываем карточки справа (обратная сторона свайпа)
      stepX = movedX < 0 ? 1 : -1
    }
    if (Math.abs(movedY) >= threshold) {
      // Свайп вверх -> открываем карточки снизу (обратная сторона свайпа)
      stepY = movedY < 0 ? 1 : -1
    }

    if ((stepX !== 0 || stepY !== 0) && validUrls.length > 0) {
      const delta = stepX + stepY * IMMERSIVE_GRID_STRIDE
      setLightboxIndex((prev) => wrapIndex(prev + delta, validUrls.length))
    }

    immersiveTouchRef.current = null
    setImmersiveOffset({ x: 0, y: 0 })
    setImmersiveDragging(false)
  }, [immersiveOffset.x, immersiveOffset.y, validUrls.length])

  const handleImmersiveMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    immersiveTouchRef.current = { x: e.clientX, y: e.clientY }
    setImmersiveDragging(true)
  }, [])

  const handleImmersiveMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const start = immersiveTouchRef.current
    if (!start) return
    setImmersiveOffset({ x: e.clientX - start.x, y: e.clientY - start.y })
  }, [])

  const handleImmersiveMouseUp = useCallback(() => {
    if (!immersiveTouchRef.current) return
    const tileStep = getImmersiveTileSizePx() + IMMERSIVE_TILE_GAP_PX
    const movedX = immersiveOffset.x
    const movedY = immersiveOffset.y
    const threshold = Math.max(SWIPE_THRESHOLD_PX, tileStep * 0.22)

    let stepX = 0
    let stepY = 0
    if (Math.abs(movedX) >= threshold) stepX = movedX < 0 ? 1 : -1
    if (Math.abs(movedY) >= threshold) stepY = movedY < 0 ? 1 : -1

    if ((stepX !== 0 || stepY !== 0) && validUrls.length > 0) {
      const delta = stepX + stepY * IMMERSIVE_GRID_STRIDE
      setLightboxIndex((prev) => wrapIndex(prev + delta, validUrls.length))
    }

    immersiveTouchRef.current = null
    setImmersiveOffset({ x: 0, y: 0 })
    setImmersiveDragging(false)
  }, [immersiveOffset.x, immersiveOffset.y, validUrls.length])

  const handleImmersiveMouseLeave = useCallback(() => {
    if (!immersiveTouchRef.current) return
    immersiveTouchRef.current = null
    setImmersiveOffset({ x: 0, y: 0 })
    setImmersiveDragging(false)
  }, [])


  if (validUrls.length === 1) {
    return (
      <div
        className={`relative flex min-h-0 cursor-pointer items-center justify-center overflow-hidden bg-slate-100 ${className}`}
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
        className="flex h-full w-full cursor-pointer overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth bg-slate-100 [scrollbar-width:none] [-ms-overflow-style:none]"
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
              className="fixed inset-0 z-[999] flex flex-col bg-[#050608]"
              role="dialog"
              aria-modal="true"
              aria-label="Просмотр фото"
              style={{
                height: '100dvh',
                minHeight: '-webkit-fill-available',
                perspective: '1200px',
              }}
            >
              <button
                type="button"
                onClick={closeLightbox}
                className="absolute left-4 z-[1000] flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/35 bg-white/80 text-slate-900 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-sm transition active:scale-95"
                style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
                aria-label="Назад"
              >
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.3">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              <div
                className="pointer-events-none absolute right-4 z-[1000] rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
                style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
              >
                {lightboxIndex + 1} / {validUrls.length}
              </div>

              <div
                className="absolute inset-0 touch-none select-none overflow-hidden"
                style={{
                  top: 'max(4rem, calc(env(safe-area-inset-top) + 3rem))',
                  bottom: 'max(4.5rem, env(safe-area-inset-bottom))',
                }}
                onTouchStart={handleImmersiveTouchStart}
                onTouchMove={handleImmersiveTouchMove}
                onTouchEnd={handleImmersiveTouchEnd}
                onMouseDown={handleImmersiveMouseDown}
                onMouseMove={handleImmersiveMouseMove}
                onMouseUp={handleImmersiveMouseUp}
                onMouseLeave={handleImmersiveMouseLeave}
              >
                {Array.from({ length: (IMMERSIVE_GRID_RADIUS * 2 + 1) ** 2 }, (_, k) => {
                  const side = IMMERSIVE_GRID_RADIUS * 2 + 1
                  const y = Math.floor(k / side) - IMMERSIVE_GRID_RADIUS
                  const x = (k % side) - IMMERSIVE_GRID_RADIUS
                  const tileSize = getImmersiveTileSizePx()
                  const tileStep = tileSize + IMMERSIVE_TILE_GAP_PX
                  const mediaIndex = wrapIndex(
                    lightboxIndex + x + y * IMMERSIVE_GRID_STRIDE,
                    validUrls.length,
                  )
                  const url = validUrls[mediaIndex]
                  const distance = Math.hypot(x, y)
                  const depth = Math.max(0, 1 - distance / (IMMERSIVE_GRID_RADIUS + 1.2))
                  const scale = Math.max(0.58, 1 - distance * 0.13)
                  const translateX = x * tileStep + immersiveOffset.x
                  const translateY = y * tileStep + immersiveOffset.y
                  const z = Math.round(depth * 140)
                  const isCenter = x === 0 && y === 0
                  const transition = immersiveDragging
                    ? 'none'
                    : `transform 420ms ${IMMERSIVE_EASING}, opacity 420ms ${IMMERSIVE_EASING}, filter 420ms ${IMMERSIVE_EASING}`

                  return (
                    <div
                      key={`sphere-tile-${k}-${mediaIndex}`}
                      className="absolute left-1/2 top-1/2 overflow-hidden rounded-2xl border border-white/25 bg-black shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
                      style={{
                        width: `${tileSize}px`,
                        height: `${tileSize}px`,
                        transform: `translate3d(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px), ${z}px) scale(${scale})`,
                        opacity: isCenter ? 1 : Math.max(0.2, depth + 0.15),
                        filter: isCenter ? 'none' : `saturate(${0.72 + depth * 0.25}) brightness(${0.74 + depth * 0.26})`,
                        transition,
                        zIndex: isCenter ? 30 : Math.max(1, Math.round(depth * 20)),
                      }}
                    >
                      {url && isVideoUrl(url) ? (
                        <video
                          src={url}
                          className="h-full w-full object-cover"
                          autoPlay
                          muted
                          loop
                          playsInline
                        />
                      ) : (
                        <img
                          src={url}
                          alt={`${alt} — медиа ${mediaIndex + 1}`}
                          className="h-full w-full object-cover"
                          draggable={false}
                          referrerPolicy="no-referrer"
                          loading="eager"
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              <div
                className="pointer-events-none absolute bottom-0 left-0 right-0 flex justify-center py-4 text-center text-xs font-medium tracking-wide text-white/80"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                Свайпайте в любую сторону
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
