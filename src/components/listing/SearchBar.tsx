import { useRef, useCallback } from 'react'

type SearchBarProps = {
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const glassRef = useRef<HTMLDivElement>(null)

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

  return (
    <label className="mx-auto block w-full max-w-[560px]">
      <div
        ref={glassRef}
        className="liquid-glass rounded-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <span className="liquid-glass-shimmer" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Марка, модель, город..."
          className="relative z-10 w-full bg-transparent px-4 py-3 pr-11 text-sm text-slate-900 outline-none placeholder:italic placeholder:text-slate-500"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute right-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </div>
    </label>
  )
}
