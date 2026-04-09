import { Link } from 'react-router-dom'
import { SearchBar, type SuggestionItem } from './SearchBar'
import { pluralizeOffers } from '../../lib/format'

export type QuickCategoryPill = {
  id: string
  label: string
  to: string
  active?: boolean
}

export type MarketplaceSearchCardProps = {
  value: string
  onChange: (value: string) => void
  suggestions: SuggestionItem[]
  onSuggestionClick?: (value: string) => void
  onDeleteSuggestion?: (value: string) => void
  onSubmit?: () => void
  onSearchFocusBroadcast?: (focused: boolean) => void
  isSearchFocused: boolean
  /** Пока идёт загрузка лотов — подсказка под полем. */
  hintLoading?: boolean
  /** Число для строки «N предложений»; при фокусе поиска скрывается. */
  hintCount: number | null
  onOpenFilters: () => void
  activeFilterCount: number
  quickCategories?: QuickCategoryPill[]
}

function CarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M18 11h1.5a1 1 0 0 1 1 1v1.5a1 1 0 0 1-1 1H18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M6 11H4.5a1 1 0 0 0-1 1v1.5a1 1 0 0 0 1 1H6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M5 14.5V9.2c0-.53.2-1.04.56-1.42l1.5-1.58A2 2 0 0 1 8.38 5.5h7.24c.57 0 1.12.24 1.5.66l1.42 1.58c.36.38.56.89.56 1.42v5.3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 14.5h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="7.5" cy="14.5" r="1.75" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16.5" cy="14.5" r="1.75" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function FilterSlidersIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  )
}

export function MarketplaceSearchCard({
  value,
  onChange,
  suggestions,
  onSuggestionClick,
  onDeleteSuggestion,
  onSubmit,
  onSearchFocusBroadcast,
  hintLoading,
  hintCount,
  onOpenFilters,
  activeFilterCount,
  quickCategories,
  isSearchFocused,
}: MarketplaceSearchCardProps) {
  const showHint = !isSearchFocused && !hintLoading && hintCount != null
  const showPills = quickCategories && quickCategories.length > 0 && !isSearchFocused

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div className="rounded-[1.25rem] border border-zinc-200/90 bg-white p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <div
            className="mt-2.5 shrink-0 text-ios-label"
            aria-hidden
          >
            <CarIcon className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <SearchBar
              variant="hub"
              value={value}
              onChange={onChange}
              suggestions={suggestions}
              onSuggestionClick={onSuggestionClick}
              onDeleteSuggestion={onDeleteSuggestion}
              onFocusChange={(focused) => {
                onSearchFocusBroadcast?.(focused)
              }}
              onSubmit={onSubmit}
            />
            {hintLoading ? (
              <p className="mt-1 px-0.5 font-sf text-[13px] text-ios-label">Загрузка…</p>
            ) : showHint ? (
              <p className="mt-1 px-0.5 font-sf text-[13px] leading-snug text-ios-label">
                {hintCount.toLocaleString('ru-RU')} {pluralizeOffers(hintCount)}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            aria-label="Параметры и фильтры"
            onClick={onOpenFilters}
            className="relative mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200/90 bg-zinc-50 text-zinc-700 transition active:scale-95 active:bg-zinc-100"
          >
            <FilterSlidersIcon className="h-5 w-5" />
            {activeFilterCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 font-sf text-[10px] font-bold text-white ring-2 ring-white">
                {activeFilterCount > 99 ? '99+' : activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        {showPills ? (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-0.5 pt-1">
            {quickCategories.map((pill) => (
              <Link
                key={pill.id}
                to={pill.to}
                className={`shrink-0 rounded-full border px-4 py-2 font-sf text-[14px] font-medium transition active:scale-[0.98] ${
                  pill.active
                    ? 'border-brand bg-brand text-white shadow-sm shadow-brand/20'
                    : 'border-zinc-200/90 bg-zinc-50 text-zinc-800 hover:border-zinc-300 hover:bg-white'
                }`}
              >
                {pill.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
