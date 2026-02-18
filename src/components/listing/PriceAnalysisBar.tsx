import { formatPriceRub } from '../../lib/format'

type PriceAnalysisBarProps = {
  priceRub: number
  marketLowRub: number
  marketAvgRub: number
  marketHighRub: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function PriceAnalysisBar({
  priceRub,
  marketLowRub,
  marketAvgRub,
  marketHighRub,
}: PriceAnalysisBarProps) {
  const range = Math.max(1, marketHighRub - marketLowRub)
  const marker = clamp(((priceRub - marketLowRub) / range) * 100, 0, 100)
  const average = clamp(((marketAvgRub - marketLowRub) / range) * 100, 0, 100)
  const label = priceRub <= marketAvgRub ? 'Цена ниже рынка' : 'Цена выше рынка'

  return (
    <section className="rounded-2xl border border-black/10 bg-black/5 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between text-xs text-slate-600">
        <span>Анализ цены</span>
        <span>{label}</span>
      </div>

      <div className="relative h-2 rounded-full bg-black/10">
        <div
          className="absolute left-0 top-0 h-2 rounded-full bg-gradient-to-r from-[#2aa871] to-[#FF5C34]"
          style={{ width: `${average}%` }}
        />
        <span
          className="absolute -top-2 h-6 w-0.5 bg-slate-900"
          style={{ left: `${marker}%` }}
          aria-label="Текущая цена"
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
        <span>{formatPriceRub(marketLowRub)}</span>
        <span>{formatPriceRub(marketAvgRub)}</span>
        <span>{formatPriceRub(marketHighRub)}</span>
      </div>
    </section>
  )
}
