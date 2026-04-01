import { useRef, useCallback, useMemo } from 'react'

export type SuggestionItem = {
  label: string
  kind: 'history' | 'suggestion'
  count?: number
}

type SearchBarProps = {
  value: string
  onChange: (value: string) => void
  suggestions?: SuggestionItem[]
  onSuggestionClick?: (value: string) => void
  onDeleteSuggestion?: (value: string) => void
  onFocusChange?: (isFocused: boolean) => void
  onSubmit?: () => void
}

export function SearchBar({
  value,
  onChange,
  suggestions = [],
  onSuggestionClick,
  onDeleteSuggestion,
  onFocusChange,
  onSubmit,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFocus = useCallback(() => {
    onFocusChange?.(true)
  }, [onFocusChange])

  const handleBlur = useCallback(() => {
    onFocusChange?.(false)
  }, [onFocusChange])

  const handleSuggestionSelect = useCallback(
    (label: string) => {
      onChange(label)
      onSuggestionClick?.(label)
      inputRef.current?.blur()
    },
    [onChange, onSuggestionClick],
  )

  const handleFormSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      inputRef.current?.blur()
      onSubmit?.()
    },
    [onSubmit],
  )

  const handleClear = useCallback(() => {
    onChange('')
    inputRef.current?.focus()
  }, [onChange])

  const headerLabel = useMemo(() => {
    if (suggestions.length === 0) return null
    if (suggestions.every((s) => s.kind === 'history')) return 'Недавние'
    if (value.trim().length === 0 && suggestions.every((s) => s.kind === 'suggestion'))
      return 'Популярные'
    return null
  }, [suggestions, value])

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-2">
      <form action="" onSubmit={handleFormSubmit}>
        <label className="block">
          <div className="relative flex items-center rounded-md bg-zinc-900/80 transition-colors duration-150 focus-within:bg-zinc-900">
            <input
              ref={inputRef}
              type="search"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Найдите свою гонку"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={`search-bar-input min-h-[44px] w-full bg-transparent py-2.5 pl-3.5 text-[15px] font-normal leading-snug text-zinc-100 outline-none placeholder:text-zinc-600 font-sf ${
                value.trim().length > 0 ? 'pr-[4.25rem]' : 'pr-11'
              }`}
            />
            {value.trim().length > 0 ? (
              <button
                type="button"
                aria-label="Очистить"
                onClick={handleClear}
                className="absolute right-11 top-1/2 -translate-y-1/2 text-zinc-600 transition-colors hover:text-zinc-400"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            ) : null}
            <button
              type="submit"
              aria-label="Поиск"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 transition-colors hover:text-zinc-400"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </button>
          </div>
        </label>
      </form>

      {suggestions.length > 0 ? (
        <div className="overflow-hidden rounded-md bg-zinc-900/80">
          {headerLabel ? (
            <p className="px-3.5 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600 font-sf">
              {headerLabel}
            </p>
          ) : null}
          {suggestions.map((item, index) => (
            <button
              key={`${item.label}-${index}`}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault()
                handleSuggestionSelect(item.label)
              }}
              onClick={(e) => e.preventDefault()}
              className="group/row flex w-full items-center gap-2.5 border-t border-zinc-800 px-3.5 py-2.5 text-left text-[14px] font-sf font-normal text-zinc-200 first:border-t-0 transition-colors hover:bg-zinc-800/60"
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-zinc-600">
                {item.kind === 'history' ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                )}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.count != null && item.count > 0 ? (
                <span className="shrink-0 tabular-nums text-[11px] text-zinc-600">
                  {item.count}
                </span>
              ) : null}
              {item.kind === 'history' && onDeleteSuggestion ? (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Удалить из истории"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onDeleteSuggestion(item.label)
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center text-zinc-600 transition-colors hover:text-zinc-400"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
