import { useState } from 'react'

type ImageWithFallbackProps = {
  imageUrls: string[]
  alt: string
  className?: string
  loading?: 'lazy' | 'eager'
  /** Вызывается, когда ни одно изображение не загрузилось */
  onAllFailed?: () => void
  /** Показать нейтральный placeholder вместо битой иконки, если все изображения не загрузились */
  showPlaceholderWhenFailed?: boolean
}

const PLACEHOLDER_STYLE =
  'bg-slate-200 text-slate-400 flex items-center justify-center text-sm font-sf'

export function ImageWithFallback({
  imageUrls,
  alt,
  className = '',
  loading = 'lazy',
  onAllFailed,
  showPlaceholderWhenFailed = false,
}: ImageWithFallbackProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [allFailed, setAllFailed] = useState(false)

  const urls = imageUrls.filter((u) => u && u.trim().length > 0)
  const currentUrl = urls[currentIndex]

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

  return (
    <img
      src={currentUrl}
      alt={alt}
      className={className}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={handleError}
    />
  )
}
