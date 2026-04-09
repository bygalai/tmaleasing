import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Listing, CategoryId } from '../../types/marketplace'
import { normalizeForSearch } from '../../lib/search'
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

function formatYearInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  return digits
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
  const [brandQuery, setBrandQuery] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setDraft(filters)
      setBrandQuery('')
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

  const filteredBrands = useMemo(() => {
    const q = brandQuery.trim()
    if (!q) return availableBrands
    const nq = normalizeForSearch(q)
    if (!nq) return availableBrands
    return availableBrands.filter((b) => {
      const nb = normalizeForSearch(b.value)
      return nb.includes(nq) || nq.includes(nb)
    })
  }, [availableBrands, brandQuery])

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

  const updateYear = useCallback((field: 'yearFrom' | 'yearTo', raw: string) => {
    setDraft((prev) => ({ ...prev, [field]: formatYearInput(raw) }))
  }, [])

  const handleApply = useCallback(() => {
    onApply(draft)
    onClose()
  }, [draft, onApply, onClose])

  const handleReset = useCallback(() => {
    setDraft(emptyFilterState())
  }, [])

  const handleDismiss = useCallback(() => {
    onClose()
  }, [onClose])

  const handleBackdropClick = useCallback(() => {
    handleDismiss()
  }, [handleDismiss])

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
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleBackdropClick}
        aria-hidden
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-sheet-title"
        className={`absolute bottom-0 left-0 right-0 flex max-h-[92vh] flex-col rounded-t-[1.25rem] border-t border-x border-zinc-200/90 bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out ${
          isAnimating ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-zinc-300" />
        </div>

        <div className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-1">
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Закрыть"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-600 transition active:scale-95 active:bg-zinc-100"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
          <h2
            id="filter-sheet-title"
            className="flex-1 text-center text-[17px] font-bold tracking-tight text-zinc-900"
          >
            Параметры
          </h2>
          <button
            type="button"
            onClick={handleReset}
            disabled={!hasChanges}
            className={`min-w-[4.5rem] shrink-0 text-right text-[16px] font-medium transition ${
              hasChanges
                ? 'text-brand active:opacity-70'
                : 'cursor-default text-zinc-400'
            }`}
          >
            Сбросить
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-36">
          {availableBrands.length > 0 && (
            <section className="mb-6">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h3 className="text-[20px] font-bold leading-tight tracking-tight text-zinc-900">Марка</h3>
                <span className="text-[13px] text-ios-label">несколько</span>
              </div>
              <label className="mb-3 block">
                <span className="sr-only">Поиск марки</span>
                <div className="relative">
                  <svg
                    viewBox="0 0 24 24"
                    className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ios-label"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden
                  >
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
                  </svg>
                  <input
                    type="search"
                    value={brandQuery}
                    onChange={(e) => setBrandQuery(e.target.value)}
                    placeholder="Поиск марки"
                    autoComplete="off"
                    className="w-full rounded-xl border border-zinc-200/90 bg-zinc-50 py-3 pl-10 pr-3 text-[16px] text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-brand/40 focus:ring-1 focus:ring-brand/25"
                  />
                </div>
              </label>
              <div className="max-h-[220px] overflow-y-auto overscroll-contain rounded-xl border border-zinc-200/90 bg-zinc-50/80 p-2">
                <div className="flex flex-wrap gap-2">
                  {filteredBrands.length === 0 ? (
                    <p className="w-full py-4 text-center text-[14px] text-ios-label">Ничего не найдено</p>
                  ) : (
                    filteredBrands.map((b) => (
                      <FilterChip
                        key={b.value}
                        label={b.value}
                        count={b.count}
                        selected={draft.brands.includes(b.value)}
                        onClick={() => toggleBrand(b.value)}
                      />
                    ))
                  )}
                </div>
              </div>
            </section>
          )}

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

          <section className="mb-6">
            <h3 className="mb-3 text-[20px] font-bold leading-tight tracking-tight text-zinc-900">
              Основные параметры
            </h3>
            <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-50/50">
              <ParamRow label="Цена, ₽">
                <div className="flex gap-2">
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
              </ParamRow>
              <ParamRow label={mileageLabel}>
                <div className="flex gap-2">
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
              </ParamRow>
              <ParamRow label="Год выпуска">
                <div className="flex gap-2">
                  <RangeInput
                    placeholder="от"
                    value={draft.yearFrom}
                    onChange={(v) => updateYear('yearFrom', v)}
                    inputMode="numeric"
                    maxLength={4}
                  />
                  <RangeInput
                    placeholder="до"
                    value={draft.yearTo}
                    onChange={(v) => updateYear('yearTo', v)}
                    inputMode="numeric"
                    maxLength={4}
                  />
                </div>
              </ParamRow>
            </div>
          </section>
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-zinc-200/90 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom,12px),12px)] pt-3 backdrop-blur-md">
          <button
            type="button"
            onClick={handleApply}
            className="w-full rounded-xl bg-ios-green py-4 text-[16px] font-semibold text-white shadow-sm transition active:scale-[0.99] active:opacity-95"
          >
            {resultCount === 0 ? (
              'Ничего не найдено'
            ) : (
              <>
                Показать {resultCount.toLocaleString('ru-RU')} {pluralizeLots(resultCount)}
              </>
            )}
          </button>
          <p className="mt-2 text-center text-[12px] leading-snug text-ios-label">
            Лизинговые лоты из каталога GONKA
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-6">
      <h3 className="mb-3 text-[20px] font-bold leading-tight tracking-tight text-zinc-900">{title}</h3>
      {children}
    </section>
  )
}

function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
      <span className="shrink-0 text-[15px] text-ios-label sm:w-[8.5rem]">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
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
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-all active:scale-[0.98] ${
        selected
          ? 'border-brand bg-brand text-white'
          : 'border-zinc-200 bg-zinc-50 text-zinc-700'
      }`}
    >
      <span>{label}</span>
      <span
        className={`text-[11px] tabular-nums ${selected ? 'text-white/80' : 'text-ios-label'}`}
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
  inputMode = 'numeric',
  maxLength,
}: {
  placeholder: string
  value: string
  onChange: (value: string) => void
  inputMode?: 'numeric' | 'text' | 'decimal'
  maxLength?: number
}) {
  return (
    <input
      type="text"
      inputMode={inputMode}
      maxLength={maxLength}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      className="min-w-0 flex-1 rounded-lg border border-zinc-200/90 bg-white px-3 py-2.5 text-[15px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-brand/45 focus:ring-1 focus:ring-brand/20"
    />
  )
}
