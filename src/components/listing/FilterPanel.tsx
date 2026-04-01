import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Listing, CategoryId } from '../../types/marketplace'
import {
  type FilterState,
  emptyFilterState,
  getAvailableBrands,
  getAvailableBodyTypes,
  getAvailableDrivetrains,
  getAvailableLocations,
  filterItemsExcluding,
  countStrictMatches,
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

  const itemsForBrands = useMemo(
    () => (isOpen ? filterItemsExcluding(items, draft, 'brands') : []),
    [items, draft, isOpen],
  )
  const availableBrands = useMemo(() => getAvailableBrands(itemsForBrands), [itemsForBrands])

  const itemsForBodyTypes = useMemo(
    () => (isOpen ? filterItemsExcluding(items, draft, 'bodyTypes') : []),
    [items, draft, isOpen],
  )
  const availableBodyTypes = useMemo(() => getAvailableBodyTypes(itemsForBodyTypes), [itemsForBodyTypes])

  const itemsForDrivetrains = useMemo(
    () => (isOpen ? filterItemsExcluding(items, draft, 'drivetrains') : []),
    [items, draft, isOpen],
  )
  const availableDrivetrains = useMemo(() => getAvailableDrivetrains(itemsForDrivetrains), [itemsForDrivetrains])

  const itemsForLocations = useMemo(
    () => (isOpen ? filterItemsExcluding(items, draft, 'locations') : []),
    [items, draft, isOpen],
  )
  const availableLocations = useMemo(() => getAvailableLocations(itemsForLocations), [itemsForLocations])

  const resultCount = useMemo(
    () => (isOpen ? countStrictMatches(items, draft) : 0),
    [items, draft, isOpen],
  )
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

  const toggleDrivetrain = useCallback((dt: string) => {
    setDraft((prev) => ({
      ...prev,
      drivetrains: prev.drivetrains.includes(dt)
        ? prev.drivetrains.filter((d) => d !== dt)
        : [...prev.drivetrains, dt],
    }))
  }, [])

  const toggleLocation = useCallback((loc: string) => {
    setDraft((prev) => ({
      ...prev,
      locations: prev.locations.includes(loc)
        ? prev.locations.filter((l) => l !== loc)
        : [...prev.locations, loc],
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
  const drivetrainLabel =
    category === 'legkovye'
      ? 'Привод'
      : category === 'pricepy'
        ? ''
        : !category
          ? 'Привод / Колёсная формула'
          : 'Колёсная формула'
  const bodyTypeLabel =
    category === 'gruzovye'
      ? 'Тип транспорта'
      : category === 'speztechnika'
        ? 'Тип техники'
        : category === 'pricepy'
          ? 'Тип'
          : 'Тип кузова'

  return createPortal(
    <div className="fixed inset-0 z-[60] font-sf">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleBackdropClick}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`absolute bottom-0 left-0 right-0 flex max-h-[88vh] flex-col rounded-t-md border-t border-x border-white/10 bg-zinc-950 shadow-none transition-transform duration-300 ease-out ${
          isAnimating ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Handle */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-[3px] w-8 rounded-full bg-zinc-600" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-4 pt-1">
          <h2 className="text-[17px] font-bold uppercase tracking-wide text-zinc-100">
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

          {/* ── Drivetrain ── */}
          {!isTrailerCategory && availableDrivetrains.length > 0 && drivetrainLabel && (
            <FilterSection title={drivetrainLabel}>
              <div className="flex flex-wrap gap-2">
                {availableDrivetrains.map((dt) => (
                  <FilterChip
                    key={dt.value}
                    label={dt.value}
                    count={dt.count}
                    selected={draft.drivetrains.includes(dt.value)}
                    onClick={() => toggleDrivetrain(dt.value)}
                  />
                ))}
              </div>
            </FilterSection>
          )}

          {/* ── Location ── */}
          {availableLocations.length > 0 && (
            <FilterSection title="Город">
              <div className="flex flex-wrap gap-2">
                {availableLocations.map((loc) => (
                  <FilterChip
                    key={loc.value}
                    label={loc.value}
                    count={loc.count}
                    selected={draft.locations.includes(loc.value)}
                    onClick={() => toggleLocation(loc.value)}
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
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-zinc-950/98 px-5 pb-[max(env(safe-area-inset-bottom,12px),12px)] pt-3 backdrop-blur-md">
          <button
            type="button"
            onClick={handleApply}
            className="w-full rounded-md border border-white/10 bg-[#FF5C34] py-3.5 text-[14px] font-semibold uppercase tracking-wide text-white transition-all active:scale-[0.99] active:bg-[#e5522e]"
          >
            {resultCount === 0
              ? 'Ничего не найдено'
              : `Показать ${resultCount.toLocaleString('ru-RU')} ${pluralizeLots(resultCount)}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
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
      className={`inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-[13px] font-medium transition-all active:scale-[0.98] ${
        selected
          ? 'border-[#FF5C34] bg-[#FF5C34] text-white'
          : 'border-white/10 bg-zinc-900 text-zinc-300'
      }`}
    >
      <span>{label}</span>
      <span
        className={`text-[11px] tabular-nums ${
          selected ? 'text-white/70' : 'text-zinc-500'
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
      className="w-full rounded-md border border-white/10 bg-zinc-900 px-4 py-3 text-[14px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-[#FF5C34]/50 focus:ring-1 focus:ring-[#FF5C34]/30"
    />
  )
}
