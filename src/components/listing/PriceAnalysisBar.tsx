import { splitPriceRub } from '../../lib/format'

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
  const label = priceRub <= marketAvgRub ? 'Цена ниже рынка' : 'Цена выше рынка'

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between font-sf text-xs font-semibold uppercase tracking-wide text-ios-label">
        <span>Анализ цены</span>
        <span className="text-zinc-700">{label}</span>
      </div>

      <div className="relative h-1.5 overflow-hidden rounded-full bg-zinc-200">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-emerald-500 to-brand"
          style={{ width: '100%' }}
        />
        <span
          className="absolute -top-1 h-6 w-0.5 rounded-full bg-zinc-900 shadow-sm"
          style={{ left: `calc(${marker}% - 1px)` }}
          aria-label="Текущая цена"
        />
      </div>

      <div className="flex items-center justify-between font-sf text-xs tabular-nums text-ios-label">
        {[marketLowRub, marketAvgRub, marketHighRub].map((value, index) => {
          const { amount, currency } = splitPriceRub(value)
          return (
            <span key={index}>
              {amount}
              <span className="align-top text-[0.75em] text-zinc-400">{currency}</span>
            </span>
          )
        })}
      </div>
    </section>
  )
}
