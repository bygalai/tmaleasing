import { useRef, useCallback } from 'react'

type SearchBarProps = {
  value: string
  onChange: (value: string) => void
  suggestions?: string[]
  onSuggestionClick?: (value: string) => void
  onFocusChange?: (isFocused: boolean) => void
}

export function SearchBar({
  value,
  onChange,
  suggestions = [],
  onSuggestionClick,
  onFocusChange,
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
    (item: string) => {
      onChange(item)
      onSuggestionClick?.(item)
      inputRef.current?.blur()
    },
    [onChange, onSuggestionClick],
  )

  const handleIconClick = useCallback(() => {
    inputRef.current?.blur()
  }, [])

  const handleClear = useCallback(() => {
    onChange('')
    inputRef.current?.focus()
  }, [onChange])

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-2">
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
            placeholder="Марка, модель, город..."
            className={`search-bar-input relative z-10 w-full bg-transparent px-4 py-3 text-sm text-slate-900 outline-none placeholder:italic placeholder:text-slate-500 font-sf ${
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
            type="button"
            aria-label="Поиск"
            onClick={handleIconClick}
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

      {suggestions.length > 0 ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          {suggestions.map((item, index) => (
            <button
              key={`${item}-${index}`}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault()
                handleSuggestionSelect(item)
              }}
              onClick={(e) => e.preventDefault()}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-sf text-black transition-colors hover:bg-slate-50 active:bg-[#FFE1D5]"
            >
              <span className="inline-flex h-4 w-4 items-center justify-center text-slate-400">
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
              </span>
              <span className="truncate font-sf">{item}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
