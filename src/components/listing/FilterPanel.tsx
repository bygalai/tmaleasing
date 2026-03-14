import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import type { Listing, CategoryId } from '../../types/marketplace'
import {
  type FilterState,
  emptyFilterState,
  getAvailableBrands,
  getAvailableBodyTypes,
  applyFilters,
  countActiveFilters,
} from '../../lib/filters'

type FilterPanelProps = {
  isOpen: boolean
  onClose: () => void
  filters: FilterState
  onApply: (filters: FilterState) => void
  items: Listing[]
  category?: CategoryId
}

function formatInputNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return Number(digits).toLocaleString('ru-RU')
}

function parseInputNumber(value: string): string {
  return value.replace(/\D/g, '')
}

function pluralizeLots(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return 'лотов'
  if (mod10 === 1) return 'лот'
  if (mod10 >= 2 && mod10 <= 4) return 'лота'
  return 'лотов'
}

export function FilterPanel({
  isOpen,
  onClose,
  filters,
  onApply,
  items,
  category,
}: FilterPanelProps) {
  const [draft, setDraft] = useState<FilterState>(filters)
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setDraft(filters)
      setIsVisible(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsAnimating(true))
      })
    } else {
      setIsAnimating(false)
      const timer = setTimeout(() => setIsVisible(false), 320)
      return () => clearTimeout(timer)
    }
  }, [isOpen, filters])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const availableBrands = useMemo(() => getAvailableBrands(items), [items])
  const availableBodyTypes = useMemo(() => getAvailableBodyTypes(items), [items])
  const resultCount = useMemo(() => applyFilters(items, draft).length, [items, draft])
  const hasChanges = countActiveFilters(draft) > 0

  const toggleBrand = useCallback((brand: string) => {
    setDraft((prev) => ({
      ...prev,
      brands: prev.brands.includes(brand)
        ? prev.brands.filter((b) => b !== brand)
        : [...prev.brands, brand],
    }))
  }, [])

  const toggleBodyType = useCallback((bt: string) => {
    setDraft((prev) => ({
      ...prev,
      bodyTypes: prev.bodyTypes.includes(bt)
        ? prev.bodyTypes.filter((t) => t !== bt)
        : [...prev.bodyTypes, bt],
    }))
  }, [])

  const updatePrice = useCallback((field: 'priceFrom' | 'priceTo', raw: string) => {
    setDraft((prev) => ({ ...prev, [field]: parseInputNumber(raw) }))
  }, [])

  const updateMileage = useCallback((field: 'mileageFrom' | 'mileageTo', raw: string) => {
    setDraft((prev) => ({ ...prev, [field]: parseInputNumber(raw) }))
  }, [])

  const handleApply = useCallback(() => {
    onApply(draft)
    onClose()
  }, [draft, onApply, onClose])

  const handleReset = useCallback(() => {
    setDraft(emptyFilterState())
  }, [])

  const handleBackdropClick = useCallback(() => {
    onApply(draft)
    onClose()
  }, [draft, onApply, onClose])

  if (!isVisible) return null

  const isTrailerCategory = category === 'pricepy'
  const mileageLabel = isTrailerCategory ? 'Наработка, м.ч.' : 'Пробег, км'
  const bodyTypeLabel =
    category === 'gruzovye'
      ? 'Тип транспорта'
      : category === 'speztechnika'
        ? 'Тип техники'
        : category === 'pricepy'
          ? 'Тип'
          : 'Тип кузова'

  return (
    <div className="fixed inset-0 z-50 font-sf">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleBackdropClick}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`absolute bottom-0 left-0 right-0 flex max-h-[88vh] flex-col rounded-t-[20px] bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out ${
          isAnimating ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Handle */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-[5px] w-9 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-1">
          <h2 className="text-[18px] font-bold tracking-tight text-slate-900">
            Фильтры
          </h2>
          {hasChanges && (
            <button
              type="button"
              onClick={handleReset}
              className="text-[14px] font-medium text-[#FF5C34] active:opacity-60"
            >
              Сбросить
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-28">
          {/* ── Brand ── */}
          {availableBrands.length > 0 && (
            <FilterSection title="Марка">
              <div className="flex flex-wrap gap-2">
                {availableBrands.map((b) => (
                  <FilterChip
                    key={b.value}
                    label={b.value}
                    count={b.count}
                    selected={draft.brands.includes(b.value)}
                    onClick={() => toggleBrand(b.value)}
                  />
                ))}
              </div>
            </FilterSection>
          )}

          {/* ── Body type ── */}
          {availableBodyTypes.length > 0 && (
            <FilterSection title={bodyTypeLabel}>
              <div className="flex flex-wrap gap-2">
                {availableBodyTypes.map((bt) => (
                  <FilterChip
                    key={bt.value}
                    label={bt.value}
                    count={bt.count}
                    selected={draft.bodyTypes.includes(bt.value)}
                    onClick={() => toggleBodyType(bt.value)}
                  />
                ))}
              </div>
            </FilterSection>
          )}

          {/* ── Price ── */}
          <FilterSection title="Цена, ₽">
            <div className="flex gap-3">
              <RangeInput
                placeholder="от"
                value={formatInputNumber(draft.priceFrom)}
                onChange={(v) => updatePrice('priceFrom', v)}
              />
              <RangeInput
                placeholder="до"
                value={formatInputNumber(draft.priceTo)}
                onChange={(v) => updatePrice('priceTo', v)}
              />
            </div>
          </FilterSection>

          {/* ── Mileage ── */}
          <FilterSection title={mileageLabel}>
            <div className="flex gap-3">
              <RangeInput
                placeholder="от"
                value={formatInputNumber(draft.mileageFrom)}
                onChange={(v) => updateMileage('mileageFrom', v)}
              />
              <RangeInput
                placeholder="до"
                value={formatInputNumber(draft.mileageTo)}
                onChange={(v) => updateMileage('mileageTo', v)}
              />
            </div>
          </FilterSection>
        </div>

        {/* Fixed bottom button */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-100 bg-white/95 px-5 pb-[max(env(safe-area-inset-bottom,12px),12px)] pt-3 backdrop-blur-md">
          <button
            type="button"
            onClick={handleApply}
            className="w-full rounded-2xl bg-[#FF5C34] py-3.5 text-[15px] font-semibold text-white shadow-[0_4px_16px_rgba(255,92,52,0.3)] transition-all active:scale-[0.98] active:bg-[#e5522e]"
          >
            {resultCount === 0
              ? 'Ничего не найдено'
              : `Показать ${resultCount.toLocaleString('ru-RU')} ${pluralizeLots(resultCount)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────

function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <p className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      {children}
    </div>
  )
}

function FilterChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string
  count: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all active:scale-[0.96] ${
        selected
          ? 'bg-[#FF5C34] text-white shadow-[0_2px_8px_rgba(255,92,52,0.25)]'
          : 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200/80'
      }`}
    >
      <span>{label}</span>
      <span
        className={`text-[11px] tabular-nums ${
          selected ? 'text-white/70' : 'text-slate-400'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function RangeInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-[14px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[#FF5C34]/40 focus:bg-white focus:ring-2 focus:ring-[#FF5C34]/10"
    />
  )
}
