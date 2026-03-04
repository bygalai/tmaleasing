import { Link, useParams } from 'react-router-dom'
import { PriceAnalysisBar } from '../components/listing/PriceAnalysisBar'
import { formatMileage, formatMileageHours, splitPriceRub } from '../lib/format'
import { sendLeadToTelegram } from '../lib/telegram'
import type { Listing } from '../types/marketplace'

const isTrailer = (item: Listing) => item.category === 'pricepy'

type ListingPageProps = {
  items: Listing[]
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => void
}

export function ListingPage({ items, isFavorite, toggleFavorite }: ListingPageProps) {
  const { id } = useParams()
  const item = items.find((entry) => entry.id === id)

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

  return (
    <article className="space-y-4 pb-6">
      <img
        src={item.imageUrl}
        alt={item.title}
        className="h-56 w-full rounded-2xl object-cover"
        referrerPolicy="no-referrer"
      />

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">{item.title}</h1>
          <button
            type="button"
            onClick={() => toggleFavorite(item.id)}
            aria-label={isFavorite(item.id) ? 'Убрать из избранного' : 'Добавить в избранное'}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-black/5 text-2xl leading-none text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.10)] backdrop-blur-xl"
          >
            {isFavorite(item.id) ? '♥' : '♡'}
          </button>
        </div>
        <p className="text-sm text-slate-600">{item.subtitle}</p>
      </div>

      <div className="rounded-2xl border border-black/10 bg-black/5 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        {(() => {
          const { amount, currency } = splitPriceRub(item.priceRub)
          return (
            <p className="text-3xl font-bold tabular-nums tracking-tight text-[#FF5C34]">
              {amount}
              <span className="align-top text-slate-400 text-[0.75em]">{currency}</span>
            </p>
          )
        })()}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
          <span>Год: {item.year ?? '—'}</span>
          {isTrailer(item) ? (
            <span>Наработка: {formatMileageHours(item.mileageKm)}</span>
          ) : (
            <span>Пробег: {formatMileage(item.mileageKm)}</span>
          )}
          <span>{item.location ?? '—'}</span>
          <span>Юридическая проверка</span>
        </div>
      </div>

      <PriceAnalysisBar
        priceRub={item.priceRub}
        marketLowRub={item.marketLowRub}
        marketAvgRub={item.marketAvgRub}
        marketHighRub={item.marketHighRub}
      />

      <div className="rounded-2xl border border-black/10 bg-black/5 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <p className="mb-2 text-sm font-medium text-slate-900">Описание</p>
        <p className="font-sf whitespace-pre-line text-sm leading-relaxed text-slate-700">
          {item.description}
        </p>
      </div>

      <button
        type="button"
        className="inline-flex rounded-xl bg-[#FF5C34] px-4 py-2 text-sm font-sf font-semibold text-white transition hover:opacity-90"
        onClick={() => {
          const ok = sendLeadToTelegram({
            kind: 'lead',
            listingId: item.id,
            listingTitle: item.title,
            priceRub: item.priceRub,
            detailUrl: item.detailUrl,
            imageUrl: item.imageUrl,
          })
          if (!ok) {
            // Fallback: открыть диалог с ботом, если Mini App запущено не в Telegram
            window.open('https://t.me/GONKACONFBOT', '_blank', 'noreferrer')
          }
        }}
      >
        Оставить заявку
      </button>
    </article>
  )
}
