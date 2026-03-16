import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SwipeGallery } from '../components/listing/SwipeGallery'
import { PriceAnalysisBar } from '../components/listing/PriceAnalysisBar'
import { formatMileage, formatMileageHours, splitPriceRub } from '../lib/format'
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

export function ListingPage({ items, isFavorite, toggleFavorite }: ListingPageProps) {
  const { id } = useParams()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const item = items.find((entry) => entry.id === id)

  if (!item) {
    return (
      <section className="page-transition space-y-4">
        <p className="text-sm text-slate-500">Карточка не найдена.</p>
        <Link to="/" className="text-sm text-[#FF5C34]">
          Вернуться в каталог
        </Link>
      </section>
    )
  }

  return (
    <article className="page-transition space-y-4 pb-6">
      <div className="h-56 w-full overflow-hidden rounded-2xl">
        <SwipeGallery
          imageUrls={item.imageUrls}
          alt={item.title}
          className="h-full w-full rounded-2xl"
          showPlaceholderWhenFailed
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold uppercase text-slate-900">{item.title}</h1>
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

      <section className="relative overflow-hidden rounded-3xl border border-white/30 bg-white/10 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.22)] backdrop-blur-2xl">
        <div className="space-y-2">
          {item.originalPriceRub != null && item.originalPriceRub > item.priceRub ? (
            <p className="font-sf text-lg tabular-nums text-slate-500">
              <span className="line-through">{splitPriceRub(item.originalPriceRub).amount}</span>
              <span className="align-top text-slate-400 text-[0.75em]"> ₽</span>
            </p>
          ) : null}
          <p className="font-sf text-3xl font-bold tabular-nums tracking-tight text-[#FF5C34]">
            {splitPriceRub(item.priceRub).amount}
            <span className="align-top text-slate-400 text-[0.75em]"> ₽</span>
          </p>
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
      </section>

      <PriceAnalysisBar
        priceRub={item.priceRub}
        marketLowRub={item.marketLowRub}
        marketAvgRub={item.marketAvgRub}
        marketHighRub={item.marketHighRub}
      />

      <section className="space-y-2">
        <p className="text-sm font-medium text-slate-900">Описание</p>
        <div className="font-sf grid grid-cols-2 gap-x-4 gap-y-1 text-sm leading-relaxed text-slate-700">
          {item.description
            .split('\n')
            .filter(Boolean)
            .map((line, index) => (
              <span key={index}>{line}</span>
            ))}
        </div>
      </section>

      <button
        type="button"
        disabled={submitting || submitted}
        className="inline-flex rounded-xl bg-[#FF5C34] px-4 py-2 text-sm font-sf font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        onClick={async () => {
          const payload = {
            kind: 'lead' as const,
            listingId: item.id,
            listingTitle: item.title,
            priceRub: item.priceRub,
            detailUrl: item.detailUrl,
            imageUrl: item.imageUrl,
          }
          const user = getTelegramUserFromInitData()
          // Если известен пользователь — всегда отправляем через API (надёжно и для кнопки в чате, и для «Открыть приложение»)
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
          // Иначе пробуем WebApp.sendData и при неудаче открываем бота
          if (sendLeadToTelegram(payload)) setSubmitted(true)
          else window.open('https://t.me/GONKACONFBOT', '_blank', 'noreferrer')
        }}
      >
        {submitting ? 'Отправка…' : submitted ? 'Заявка отправлена!' : 'Оставить заявку'}
      </button>
    </article>
  )
}
