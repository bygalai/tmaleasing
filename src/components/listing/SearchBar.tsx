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
  const glassRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = glassRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    glassRef.current!.style.setProperty('--mx', `${x}%`)
    glassRef.current!.style.setProperty('--my', `${y}%`)
  }, [])

  const handlePointerLeave = useCallback(() => {
    glassRef.current?.style.setProperty('--mx', '50%')
    glassRef.current?.style.setProperty('--my', '50%')
  }, [])

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
          <div
            ref={glassRef}
            className="liquid-glass rounded-none"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            <span className="liquid-glass-shimmer" aria-hidden="true" />
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
              className={`search-bar-input relative z-10 w-full bg-transparent px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 font-sf ${
                value.trim().length > 0 ? 'pr-20' : 'pr-11'
              }`}
            />
            {value.trim().length > 0 ? (
              <button
                type="button"
                aria-label="Очистить"
                onClick={handleClear}
                className="absolute right-12 top-1/2 z-10 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
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
              className="absolute right-4 top-1/2 z-10 -translate-y-1/2 text-slate-400"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </button>
          </div>
        </label>
      </form>

      {suggestions.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-white/80 shadow-sm ring-1 ring-slate-200/80 backdrop-blur-lg">
          {headerLabel ? (
            <p className="px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-sf">
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
              className="group/row flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-sf text-slate-900 transition-colors hover:bg-slate-50 active:bg-[#FFE1D5]"
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-slate-400">
                {item.kind === 'history' ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
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
                    strokeWidth="2"
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
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500">
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
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-300 hover:text-slate-500"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
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
