import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMileage, formatMileageHours, splitPriceRub } from '../../lib/format'
import type { Listing } from '../../types/marketplace'
import { ImageWithFallback } from './ImageWithFallback'

const isTrailer = (item: Listing) => item.category === 'pricepy'

type ListingCardProps = {
  item: Listing
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={filled ? '#FF5C34' : 'none'}
        stroke={filled ? '#FF5C34' : '#9CA3AF'}
        strokeWidth={2.4}
        transform="translate(-0.5 0)"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function badgeLabel(item: Listing, badge: Listing['badges'][number]) {
  if (badge === 'in_stock') return 'В наличии'
  if (badge === 'leasing') return 'Доступно в лизинг'
  return `Скидка ${item.discountPercent ?? 0}%`
}

export const ListingCard = memo(function ListingCard({ item, isFavorite, onToggleFavorite }: ListingCardProps) {
  const [hideDueToBrokenImages, setHideDueToBrokenImages] = useState(false)

  if (hideDueToBrokenImages) return null

  return (
    <Link
      to={`/listing/${item.id}`}
      className="relative mx-auto block w-full max-w-[560px] overflow-hidden rounded-lg border border-black/10 bg-white/70 shadow-[0_14px_45px_rgba(15,23,42,0.10)] transition active:scale-[0.99]"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
    <article>
      <div className="relative h-48 w-full">
        <ImageWithFallback
          imageUrls={item.imageUrls}
          alt={item.title}
          className="h-full w-full object-cover"
          loading="lazy"
          onAllFailed={() => setHideDueToBrokenImages(true)}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <div className="absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {item.badges
              .filter((badge) => badge !== 'in_stock')
              .map((badge) => (
                <span
                  key={`${item.id}-${badge}`}
                  className="rounded-lg bg-brand px-2.5 py-1 text-[11px] text-white"
                >
                  {badgeLabel(item, badge)}
                </span>
              ))}
          </div>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/95 shadow-[0_4px_12px_rgba(15,23,42,0.25)] backdrop-blur-md transition active:scale-95 hover:bg-white"
            aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleFavorite(item.id)
            }}
          >
            <HeartIcon filled={isFavorite} />
          </button>
        </div>
      </div>

      <div className="relative space-y-3 border-t border-black/10 bg-white/60 p-4 backdrop-blur-xl before:pointer-events-none before:absolute before:inset-0 before:content-[''] before:bg-gradient-to-br before:from-white/95 before:via-white/55 before:to-transparent before:opacity-70 after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-1/2 after:content-[''] after:bg-gradient-to-b after:from-white/80 after:to-transparent after:opacity-55">
        <div>
          <p className="relative z-10 font-sf text-lg font-semibold uppercase text-slate-900">{item.title}</p>
          <p className="relative z-10 font-sf text-sm text-slate-600">{item.subtitle}</p>
        </div>

        <div className="relative z-10 grid grid-cols-[auto_1fr] gap-2 font-sf text-xs text-slate-600">
          <span>{item.year ? `Год: ${item.year}` : 'Год: —'}</span>
          {isTrailer(item) ? (
            <span>Наработка: {formatMileageHours(item.mileageKm)}</span>
          ) : (
            <span>Пробег: {formatMileage(item.mileageKm)}</span>
          )}
          <span>{item.location ?? '—'}</span>
          <span>Проверенный лот</span>
        </div>

        <div className="relative z-10 flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              {item.originalPriceRub != null && item.originalPriceRub > item.priceRub ? (
                <p className="font-sf text-base tabular-nums text-slate-500">
                  <span className="line-through">{splitPriceRub(item.originalPriceRub).amount}</span>
                  <span className="align-top text-slate-400 text-[0.75em]"> ₽</span>
                </p>
              ) : null}
              <p className="font-sf text-2xl font-bold tabular-nums tracking-tight text-[#FF5C34]">
                {splitPriceRub(item.priceRub).amount}
                <span className="align-top text-slate-400 text-[0.75em]"> ₽</span>
              </p>
            </div>
            <span className="font-sf rounded-xl bg-[#FF5C34] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
              Подробнее
            </span>
          </div>
        </div>
      </div>
    </article>
    </Link>
  )
})
