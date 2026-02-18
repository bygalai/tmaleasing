import { Link } from 'react-router-dom'
import { formatMileage, formatPriceRub } from '../../lib/format'
import type { Listing } from '../../types/marketplace'

type ListingCardProps = {
  item: Listing
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
}

function badgeLabel(item: Listing, badge: Listing['badges'][number]) {
  if (badge === 'in_stock') return 'В наличии'
  if (badge === 'leasing') return 'Доступно в лизинг'
  return `Скидка ${item.discountPercent ?? 0}%`
}

export function ListingCard({ item, isFavorite, onToggleFavorite }: ListingCardProps) {
  return (
    <article className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-black/10 bg-white/70 shadow-[0_14px_45px_rgba(15,23,42,0.10)]">
      <div className="relative h-48 w-full">
        <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {item.badges.map((badge) => (
            <span
              key={`${item.id}-${badge}`}
              className="rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11px] text-[#F2F3F5]"
            >
              {badgeLabel(item, badge)}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/55 p-2 text-sm text-white/90"
          aria-label="Добавить в избранное"
          onClick={() => onToggleFavorite(item.id)}
        >
          {isFavorite ? '♥' : '♡'}
        </button>
      </div>

      <div className="relative space-y-3 border-t border-black/10 bg-white/60 p-4 backdrop-blur-xl before:pointer-events-none before:absolute before:inset-0 before:content-[''] before:bg-gradient-to-br before:from-white/95 before:via-white/55 before:to-transparent before:opacity-70 after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-1/2 after:content-[''] after:bg-gradient-to-b after:from-white/80 after:to-transparent after:opacity-55">
        <div>
          <p className="relative z-10 text-lg font-semibold text-slate-900">{item.title}</p>
          <p className="relative z-10 text-sm text-slate-600">{item.subtitle}</p>
        </div>

        <div className="relative z-10 grid grid-cols-[auto_1fr] gap-2 text-xs text-slate-600">
          <span>{item.year ? `Год: ${item.year}` : 'Год: —'}</span>
          <span>Пробег: {formatMileage(item.mileageKm)}</span>
          <span>{item.location ?? '—'}</span>
          <span>Проверенный лот</span>
        </div>

        <div className="relative z-10 flex items-center justify-between gap-3">
          <p className="text-2xl font-bold tabular-nums tracking-tight text-[#FF5C34]">
            {formatPriceRub(item.priceRub)}
          </p>
          <Link
            to={`/listing/${item.id}`}
            className="rounded-xl bg-[#FF5C34] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Подробнее
          </Link>
        </div>
      </div>
    </article>
  )
}
