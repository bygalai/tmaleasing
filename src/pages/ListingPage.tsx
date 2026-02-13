import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PriceAnalysisBar } from '../components/listing/PriceAnalysisBar'
import { formatMileage, formatPriceRub } from '../lib/format'
import type { Listing } from '../types/marketplace'

type ListingPageProps = {
  items: Listing[]
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => void
}

export function ListingPage({ items, isFavorite, toggleFavorite }: ListingPageProps) {
  const { id } = useParams()
  const item = items.find((entry) => entry.id === id)
  const [photoIndex, setPhotoIndex] = useState(0)

  useEffect(() => {
    setPhotoIndex(0)
  }, [id])

  if (!item) {
    return (
      <section className="space-y-4">
        <p className="text-sm text-white/70">Карточка не найдена.</p>
        <Link to="/" className="text-sm text-[#FF5C34]">
          Вернуться в каталог
        </Link>
      </section>
    )
  }

  const gallery = item.imageUrls.length > 0 ? item.imageUrls : [item.imageUrl]
  const currentImage = gallery[Math.min(photoIndex, gallery.length - 1)]

  const toPrevPhoto = () => {
    setPhotoIndex((value) => (value - 1 + gallery.length) % gallery.length)
  }

  const toNextPhoto = () => {
    setPhotoIndex((value) => (value + 1) % gallery.length)
  }

  return (
    <article className="space-y-4 pb-6">
      <div className="relative">
        <img src={currentImage} alt={item.title} className="h-56 w-full rounded-2xl object-cover" />
        <div className="absolute bottom-2 right-2 rounded-full border border-white/20 bg-black/60 px-2 py-1 text-[11px] text-white/90">
          Фото {photoIndex + 1}/{gallery.length}
        </div>
        {gallery.length > 1 ? (
          <>
            <button
              type="button"
              onClick={toPrevPhoto}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/55 px-2 py-1 text-sm text-white"
              aria-label="Предыдущее фото"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={toNextPhoto}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/55 px-2 py-1 text-sm text-white"
              aria-label="Следующее фото"
            >
              ›
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {gallery.map((_, index) => (
                <button
                  type="button"
                  key={`${item.id}-photo-${index}`}
                  aria-label={`Фото ${index + 1}`}
                  onClick={() => setPhotoIndex(index)}
                  className={`h-1.5 rounded-full transition ${
                    index === photoIndex ? 'w-5 bg-white' : 'w-2 bg-white/45'
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold text-[#F2F3F5]">{item.title}</h1>
          <button
            type="button"
            onClick={() => toggleFavorite(item.id)}
            className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-sm text-white/90"
          >
            {isFavorite(item.id) ? '♥ В избранном' : '♡ В избранное'}
          </button>
        </div>
        <p className="text-sm text-white/70">{item.subtitle}</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-lg font-semibold text-[#FF5C34]">{formatPriceRub(item.priceRub)}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/70">
          <span>Год: {item.year ?? '—'}</span>
          <span>{formatMileage(item.mileageKm)}</span>
          <span>Город: {item.location ?? '—'}</span>
          <span>Юридическая проверка</span>
        </div>
      </div>

      <PriceAnalysisBar
        priceRub={item.priceRub}
        marketLowRub={item.marketLowRub}
        marketAvgRub={item.marketAvgRub}
        marketHighRub={item.marketHighRub}
      />

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="mb-2 text-sm font-medium text-[#F2F3F5]">Описание</p>
        <p className="text-sm leading-relaxed text-white/75">{item.description}</p>
      </div>

      <a
        href="https://t.me/GONKACONFBOT"
        target="_blank"
        rel="noreferrer"
        className="inline-flex rounded-xl bg-[#FF5C34] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
      >
        Оставить заявку
      </a>
    </article>
  )
}
