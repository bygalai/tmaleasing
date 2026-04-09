import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SwipeGallery } from '../components/listing/SwipeGallery'
import { PriceAnalysisBar } from '../components/listing/PriceAnalysisBar'
import { formatMileage, formatMileageHours, splitPriceRub } from '../lib/format'
import { buildListingSpecLine } from '../lib/listing-spec-line'
import {
  getTelegramUserFromInitData,
  sendLeadToTelegram,
  submitLeadViaApi,
} from '../lib/telegram'
import type { Listing } from '../types/marketplace'

const isTrailer = (item: Listing) => item.category === 'pricepy'

type ListingPageProps = {
  items: Listing[]
  isFavorite: (id: string) => boolean
  toggleFavorite: (id: string) => void
}

function SpecRow({ label, value }: { label: string; value: string }) {
  const display = value.trim() ? value.trim() : '—'
  return (
    <div className="flex gap-4 border-b border-zinc-100 py-3.5 last:border-b-0">
      <span className="w-[42%] shrink-0 text-[15px] leading-snug text-ios-label">{label}</span>
      <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-zinc-900">{display}</span>
    </div>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" focusable="false">
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

export function ListingPage({ items, isFavorite, toggleFavorite }: ListingPageProps) {
  const { id } = useParams()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const item = items.find((entry) => entry.id === id)

  const submitLead = async () => {
    if (!item) return
    const payload = {
      kind: 'lead' as const,
      listingId: item.id,
      listingTitle: item.title,
      priceRub: item.priceRub,
      detailUrl: item.detailUrl,
      imageUrl: item.imageUrl,
    }
    const user = getTelegramUserFromInitData()
    if (user?.id) {
      setSubmitting(true)
      try {
        const ok = await submitLeadViaApi(payload)
        if (ok) setSubmitted(true)
        else window.open('https://t.me/GONKACONFBOT', '_blank', 'noreferrer')
      } finally {
        setSubmitting(false)
      }
      return
    }
    if (sendLeadToTelegram(payload)) setSubmitted(true)
    else window.open('https://t.me/GONKACONFBOT', '_blank', 'noreferrer')
  }

  if (!item) {
    return (
      <section className="page-transition space-y-4">
        <p className="font-sf text-sm text-ios-label">Карточка не найдена.</p>
        <Link to="/" className="font-sf text-sm font-medium text-brand">
          Вернуться в каталог
        </Link>
      </section>
    )
  }

  const fav = isFavorite(item.id)
  const specLine = buildListingSpecLine(item)

  return (
    <>
      <article className="page-transition pb-36">
        <div className="relative -mx-4 mb-1 aspect-[4/3] w-[calc(100%+2rem)] max-h-[min(52vh,440px)] min-h-[200px] overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-100 shadow-sm">
          <SwipeGallery
            imageUrls={item.imageUrls}
            alt={item.title}
            className="h-full min-h-0 w-full"
            showPlaceholderWhenFailed
            fit="cover"
            surface="light"
          />
        </div>

        <div className="space-y-3 pt-2">
          <div>
            <h1 className="font-sf text-xl font-bold leading-tight tracking-tight text-zinc-900">
              {item.title}
              {item.year ? (
                <span className="font-semibold text-zinc-600">, {item.year}</span>
              ) : null}
            </h1>
            {item.originalPriceRub != null && item.originalPriceRub > item.priceRub ? (
              <p className="mt-1 font-sf text-lg tabular-nums text-ios-label line-through">
                {splitPriceRub(item.originalPriceRub).amount}
                <span className="text-[0.75em]"> ₽</span>
              </p>
            ) : null}
            <p className="mt-1 font-sf text-[1.65rem] font-bold tabular-nums leading-none tracking-tight text-zinc-900">
              {splitPriceRub(item.priceRub).amount}
              <span className="text-[0.55em] font-semibold text-zinc-600"> ₽</span>
            </p>
            <p className="mt-2 font-sf text-[13px] leading-snug text-ios-label line-clamp-2">{specLine}</p>
          </div>

          <div className="flex items-center justify-between gap-3 font-sf text-[13px] text-ios-label">
            <span className="min-w-0 truncate">{item.location ?? 'Город не указан'}</span>
            <span className="shrink-0">Проверенный лот</span>
          </div>
        </div>

        <section className="mt-5 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white px-4 py-1 shadow-sm">
          <h2 className="border-b border-zinc-100 py-4 font-sf text-xl font-bold text-zinc-900">
            Характеристики
          </h2>
          <SpecRow label="Год выпуска" value={item.year != null ? String(item.year) : '—'} />
          <SpecRow
            label={isTrailer(item) ? 'Наработка, м.ч.' : 'Пробег'}
            value={isTrailer(item) ? formatMileageHours(item.mileageKm) : formatMileage(item.mileageKm)}
          />
          <SpecRow label="Кузов / тип" value={item.bodyType?.trim() ?? '—'} />
          {!isTrailer(item) ? <SpecRow label="Привод" value={item.drivetrain?.trim() ?? '—'} /> : null}
          <SpecRow label="Город" value={item.location?.trim() ?? '—'} />
          <SpecRow label="Марка" value={item.brand?.trim() ?? '—'} />
        </section>

        <section className="mt-4 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
          <PriceAnalysisBar
            priceRub={item.priceRub}
            marketLowRub={item.marketLowRub}
            marketAvgRub={item.marketAvgRub}
            marketHighRub={item.marketHighRub}
          />
        </section>

        {item.description.trim() ? (
          <section className="mt-4 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-sf text-xl font-bold text-zinc-900">Описание</h2>
            <div className="space-y-2 font-sf text-[15px] leading-relaxed text-zinc-700">
              {item.description
                .split('\n')
                .filter(Boolean)
                .map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
            </div>
          </section>
        ) : null}

        {item.subtitle.trim() ? (
          <p className="mt-3 font-sf text-[13px] leading-snug text-ios-label">{item.subtitle}</p>
        ) : null}
      </article>

      <div
        className="fixed left-1/2 z-[46] w-[min(92vw,680px)] -translate-x-1/2 border-t border-zinc-200/90 bg-white/95 px-4 py-3 shadow-[0_-6px_32px_rgba(0,0,0,0.08)] backdrop-blur-md"
        style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 14px) + 58px)' }}
      >
        <div className="mx-auto flex max-w-[560px] gap-2">
          <button
            type="button"
            disabled={submitting || submitted}
            onClick={() => void submitLead()}
            className="flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl bg-brand px-4 font-sf text-[16px] font-semibold leading-tight text-white shadow-sm shadow-brand/25 transition active:scale-[0.99] disabled:opacity-60"
          >
            <span>{submitting ? 'Отправка…' : submitted ? 'Заявка отправлена' : 'Связаться'}</span>
            {!submitting && !submitted ? (
              <span className="mt-0.5 text-[11px] font-medium text-white/90">Менеджер GONKA</span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => toggleFavorite(item.id)}
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white shadow-sm transition active:scale-95"
            aria-label={fav ? 'Убрать из избранного' : 'В избранное'}
          >
            <HeartIcon filled={fav} />
          </button>
        </div>
      </div>
    </>
  )
}
