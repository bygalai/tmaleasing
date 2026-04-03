import { memo } from 'react'
import { Link } from 'react-router-dom'
import { formatMileage, formatMileageHours, splitPriceRub } from '../../lib/format'
import type { Listing } from '../../types/marketplace'
import { ImageWithFallback } from './ImageWithFallback'

/** Единая высота карточки (px); виртуализаторы импортируют это значение. */
export const LISTING_CARD_HEIGHT_PX = 452

const isTrailer = (item: Listing) => item.category === 'pricepy'

export type ListingCardPricePresentation = 'default' | 'compact'

type ListingCardProps = {
  item: Listing
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  /** `compact` — лента «Выгодно»; `default` — каталог / избранное (крупная плашка текста и цена) */
  pricePresentation?: ListingCardPricePresentation
  /** Первые карточки на экране — выше приоритет загрузки фото (LCP). */
  imagePriority?: boolean
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

export const ListingCard = memo(function ListingCard({
  item,
  isFavorite,
  onToggleFavorite,
  pricePresentation = 'default',
  imagePriority = false,
}: ListingCardProps) {
  const compact = pricePresentation === 'compact'
  return (
    <Link
      to={`/listing/${item.id}`}
      className="relative mx-auto flex w-full max-w-[560px] flex-col overflow-hidden rounded-md border border-white/10 bg-zinc-950 shadow-none transition active:scale-[0.99]"
      style={{ WebkitTapHighlightColor: 'transparent', height: LISTING_CARD_HEIGHT_PX }}
    >
    <article className="flex h-full min-h-0 flex-col">
      <div className="relative h-48 w-full shrink-0">
        <ImageWithFallback
          imageUrls={item.imageUrls}
          alt={item.title}
          className="h-full w-full object-cover"
          loading={imagePriority ? 'eager' : 'lazy'}
          fetchPriority={imagePriority ? 'high' : undefined}
          showPlaceholderWhenFailed
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        {item.imageUrls.length > 1 && (
          <div className="absolute bottom-3 left-3 z-20 rounded-lg bg-black/50 px-2 py-1 font-sf text-[11px] text-white backdrop-blur-sm">
            {item.imageUrls.length} фото
          </div>
        )}
        <div className="absolute left-3 right-3 top-3 z-20 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {item.badges
              .filter((badge) => badge !== 'in_stock')
              .map((badge) => (
                <span
                  key={`${item.id}-${badge}`}
                  className={`rounded-lg bg-brand text-white ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}
                >
                  {badgeLabel(item, badge)}
                </span>
              ))}
          </div>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-zinc-900 text-zinc-100 shadow-none transition active:scale-95 hover:bg-zinc-800"
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

      <div
        className={`relative flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/10 bg-zinc-950 ${
          compact ? 'p-3.5' : 'p-4'
        }`}
      >
        <div className={`flex min-h-0 flex-1 flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
          <div className="min-h-0 shrink-0">
            <p
              className={`relative z-10 line-clamp-2 font-sf font-semibold uppercase leading-tight text-zinc-100 ${
                compact ? 'text-base' : 'text-xl'
              }`}
            >
              {item.title}
            </p>
            <p
              className={`relative z-10 mt-1 line-clamp-2 font-sf leading-snug text-zinc-400 ${
                compact ? 'text-xs' : 'text-sm'
              }`}
            >
              {item.subtitle}
            </p>
          </div>

          <div
            className={`relative z-10 grid min-h-0 shrink-0 grid-cols-[auto_1fr] gap-x-2 gap-y-1 font-sf text-zinc-500 ${
              compact ? 'text-[11px] leading-snug' : 'text-sm'
            }`}
          >
            <span className="whitespace-nowrap">{item.year ? `Год: ${item.year}` : 'Год: —'}</span>
            {isTrailer(item) ? (
              <span className="min-w-0 truncate text-right">Наработка: {formatMileageHours(item.mileageKm)}</span>
            ) : (
              <span className="min-w-0 truncate text-right">Пробег: {formatMileage(item.mileageKm)}</span>
            )}
            <span className="min-w-0 truncate">{item.location ?? '—'}</span>
            <span className="text-right text-zinc-500">Проверенный лот</span>
          </div>

          <div className="relative z-10 mt-auto flex shrink-0 flex-col gap-0.5 pt-1">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 flex flex-col gap-0.5">
                {item.originalPriceRub != null && item.originalPriceRub > item.priceRub ? (
                  <p
                    className={`font-sf tabular-nums text-zinc-400 ${compact ? 'text-sm' : 'text-base'}`}
                  >
                    <span className="line-through">{splitPriceRub(item.originalPriceRub).amount}</span>
                    <span className="align-top text-zinc-500 text-[0.75em]"> ₽</span>
                  </p>
                ) : null}
                <p
                  className={`font-sf font-bold tabular-nums tracking-tight text-[#FF5C34] ${
                    compact ? 'text-lg' : 'text-3xl'
                  }`}
                >
                  {splitPriceRub(item.priceRub).amount}
                  <span className="align-top text-zinc-500 text-[0.75em]"> ₽</span>
                </p>
              </div>
              <span
                className={`shrink-0 font-sf rounded-xl bg-[#FF5C34] font-semibold text-white transition hover:opacity-90 ${
                  compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm sm:px-4 sm:py-2.5'
                }`}
              >
                Подробнее
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
    </Link>
  )
})
