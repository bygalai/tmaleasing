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
      <div className="mb-3 flex items-center justify-between font-sf text-xs text-slate-600">
        <span>Анализ цены</span>
        <span>{label}</span>
      </div>

      <div className="relative h-2 rounded-full bg-black/10">
        <div
          className="absolute left-0 top-0 h-2 rounded-full bg-gradient-to-r from-[#2aa871] to-[#FF5C34]"
          style={{ width: '100%' }}
        />
        <span
          className="absolute -top-2 h-6 w-0.5 bg-slate-900"
          style={{ left: `${marker}%` }}
          aria-label="Текущая цена"
        />
      </div>

      <div className="mt-3 flex items-center justify-between font-sf text-xs text-slate-600">
        {[marketLowRub, marketAvgRub, marketHighRub].map((value, index) => {
          const { amount, currency } = splitPriceRub(value)
          return (
            <span key={index}>
              {amount}
              <span className="align-top text-slate-400/80 text-[0.75em]">{currency}</span>
            </span>
          )
        })}
      </div>
    </section>
  )
}
