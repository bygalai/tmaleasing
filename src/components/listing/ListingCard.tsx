import { memo } from 'react'
import { Link } from 'react-router-dom'
import { splitPriceRub } from '../../lib/format'
import { buildListingSpecLine } from '../../lib/listing-spec-line'
import type { Listing } from '../../types/marketplace'
import { ListingFeedGallery } from './ListingFeedGallery'

/** Единая высота карточки (px); виртуализаторы каталога импортируют это значение. */
export const LISTING_CARD_HEIGHT_PX = 428
/** Лента «Выгодно»: компактнее по высоте. */
export const LISTING_CARD_COMPACT_HEIGHT_PX = 380

export type ListingCardPricePresentation = 'default' | 'compact'

type ListingCardProps = {
  item: Listing
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  pricePresentation?: ListingCardPricePresentation
  imagePriority?: boolean
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" focusable="false">
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={filled ? '#FF5C34' : 'none'}
        stroke={filled ? '#FF5C34' : '#AEAEB2'}
        strokeWidth={2.2}
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

function listingTitleLine(item: Listing): string {
  if (item.year) {
    const t = item.title.trim()
    if (/\d{4}/.test(t)) return t
    return `${t}, ${item.year}`
  }
  return item.title
}

export const ListingCard = memo(function ListingCard({
  item,
  isFavorite,
  onToggleFavorite,
  pricePresentation = 'default',
  imagePriority = false,
}: ListingCardProps) {
  const compact = pricePresentation === 'compact'
  const specLine = buildListingSpecLine(item)
  const density = compact ? 'compact' : 'default'

  return (
    <article
      className="relative mx-auto flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-transform active:scale-[0.995]"
      style={{
        WebkitTapHighlightColor: 'transparent',
        height: compact ? LISTING_CARD_COMPACT_HEIGHT_PX : LISTING_CARD_HEIGHT_PX,
      }}
    >
      <div className="relative shrink-0">
        <ListingFeedGallery
          imageUrls={item.imageUrls}
          alt={item.title}
          imagePriority={imagePriority}
          density={density}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 p-3">
          <div className="pointer-events-auto flex max-w-[90%] flex-wrap gap-1.5">
            {item.badges
              .filter((badge) => badge !== 'in_stock')
              .map((badge) => (
                <span
                  key={`${item.id}-${badge}`}
                  className={`rounded-lg bg-brand font-sf font-semibold text-white shadow-sm ${
                    compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
                  }`}
                >
                  {badgeLabel(item, badge)}
                </span>
              ))}
          </div>
        </div>
      </div>

      <Link
        to={`/listing/${item.id}`}
        className="flex min-h-0 min-w-0 flex-1 flex-col px-4 pt-3 pb-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/35"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
            {item.originalPriceRub != null && item.originalPriceRub > item.priceRub ? (
              <p
                className={`font-sf tabular-nums text-ios-label line-through ${
                  compact ? 'text-sm' : 'text-[15px]'
                }`}
              >
                {splitPriceRub(item.originalPriceRub).amount}
                <span className="text-[0.75em]"> ₽</span>
              </p>
            ) : null}
            <p
              className={`font-sf font-bold tabular-nums tracking-tight text-zinc-900 ${
                compact ? 'text-xl' : 'text-2xl'
              }`}
            >
              {splitPriceRub(item.priceRub).amount}
              <span className="font-semibold text-zinc-600 text-[0.55em]"> ₽</span>
            </p>
          </div>

          <p
            className={`font-sf leading-snug text-ios-label line-clamp-2 ${
              compact ? 'text-[12px]' : 'text-[13px]'
            }`}
          >
            {specLine}
          </p>

          <p
            className={`mt-1 font-sf font-medium leading-snug text-zinc-800 line-clamp-2 ${
              compact ? 'text-[14px]' : 'text-[15px]'
            }`}
          >
            {listingTitleLine(item)}
          </p>

          <p className="mt-1 flex items-center gap-1.5 font-sf text-[12px] text-ios-label">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            <span className="min-w-0 truncate">{item.location ?? 'Город не указан'}</span>
          </p>
        </div>
      </Link>

      <div className="mt-auto flex gap-2 border-t border-zinc-100 px-4 py-3">
        <Link
          to={`/listing/${item.id}`}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-brand font-sf text-[15px] font-semibold text-white shadow-sm shadow-brand/25 transition active:scale-[0.99] active:opacity-95"
        >
          Связаться
        </Link>
        <button
          type="button"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-sm transition active:scale-95"
          aria-label={isFavorite ? 'Убрать из избранного' : 'В избранное'}
          onClick={() => onToggleFavorite(item.id)}
        >
          <HeartIcon filled={isFavorite} />
        </button>
      </div>
    </article>
  )
})
