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
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-[0_12px_40px_rgba(0,0,0,0.30)]">
      <div className="relative h-48 w-full">
        <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
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

      <div className="space-y-3 p-4">
        <div>
          <p className="text-lg font-semibold text-[#F2F3F5]">{item.title}</p>
          <p className="text-sm text-white/65">{item.subtitle}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-white/70">
          <span>{item.year ? `Год: ${item.year}` : 'Год: —'}</span>
          <span>{formatMileage(item.mileageKm)}</span>
          <span>{item.location ? `Город: ${item.location}` : 'Город: —'}</span>
          <span>Проверенный лот</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-[#FF5C34]">{formatPriceRub(item.priceRub)}</p>
          <Link
            to={`/listing/${item.id}`}
            className="rounded-xl border border-white/10 bg-[#4A4F58] px-3 py-2 text-xs font-medium text-[#F2F3F5] transition hover:bg-[#5a606b]"
          >
            Подробнее
          </Link>
        </div>
      </div>
    </article>
  )
}
