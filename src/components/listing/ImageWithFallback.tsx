import { useEffect, useRef, useState } from 'react'

type ImageWithFallbackProps = {
  imageUrls: string[]
  alt: string
  className?: string
  loading?: 'lazy' | 'eager'
  /** Подсказка браузеру для LCP: первые карточки в списке. */
  fetchPriority?: 'high' | 'low' | 'auto'
  /** Для ответной вёрстки превью (карточка ~560px). */
  sizes?: string
  /** Вызывается, когда ни одно изображение не загрузилось */
  onAllFailed?: () => void
  /** Показать нейтральный placeholder вместо битой иконки, если все изображения не загрузились */
  showPlaceholderWhenFailed?: boolean
}

const PLACEHOLDER_STYLE =
  'bg-zinc-900 text-zinc-600 flex items-center justify-center text-sm font-sf'

const DEFAULT_SIZES = '(max-width: 680px) min(calc(100vw - 2rem), 560px), 560px'

export function ImageWithFallback({
  imageUrls,
  alt,
  className = '',
  loading = 'lazy',
  fetchPriority,
  sizes = DEFAULT_SIZES,
  onAllFailed,
  showPlaceholderWhenFailed = false,
}: ImageWithFallbackProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [allFailed, setAllFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const urls = imageUrls.filter((u) => u && u.trim().length > 0)
  const currentUrl = urls[currentIndex]

  useEffect(() => {
    setLoaded(false)
  }, [currentIndex, currentUrl])

  useEffect(() => {
    const el = imgRef.current
    if (el?.complete && el.naturalWidth > 0) {
      setLoaded(true)
    }
  }, [currentUrl, currentIndex])

  const handleError = () => {
    const nextIndex = currentIndex + 1
    if (nextIndex < urls.length) {
      setCurrentIndex(nextIndex)
    } else {
      setAllFailed(true)
      onAllFailed?.()
    }
  }

  if (allFailed && showPlaceholderWhenFailed) {
    return (
      <div className={`${PLACEHOLDER_STYLE} ${className}`} role="img" aria-label={alt}>
        Нет фото
      </div>
    )
  }

  if (allFailed) {
    return null
  }

  if (!currentUrl) {
    if (urls.length === 0) onAllFailed?.()
    return null
  }

  const showShimmer = !loaded && !allFailed

  return (
    <div className="relative h-full w-full">
      {showShimmer ? (
        <div
          className="absolute inset-0 animate-pulse bg-zinc-800"
          aria-hidden
        />
      ) : null}
      <img
        ref={imgRef}
        src={currentUrl}
        alt={alt}
        sizes={sizes}
        decoding="async"
        {...(fetchPriority != null ? { fetchPriority } : {})}
        className={`${className} ${showShimmer ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
        loading={loading}
        referrerPolicy="no-referrer"
        onError={handleError}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}
