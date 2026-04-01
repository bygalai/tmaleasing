type MenuButtonProps = {
  isOpen: boolean
  onClick: () => void
  className?: string
}

export function MenuButton({ isOpen, onClick, className }: MenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'liquid-glass inline-flex h-11 w-11 items-center justify-center rounded-md text-zinc-100 focus-visible:outline-none',
        className ?? '',
      ].join(' ')}
      aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={[
          'relative z-10 h-6 w-6 transition-transform duration-200',
          // Closed: horizontal ≡. Open: vertical ||| (rotate 90deg).
          isOpen ? 'rotate-90' : 'rotate-0',
        ].join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <path d="M5 7h14" />
        <path d="M5 12h14" />
        <path d="M5 17h14" />
      </svg>
    </button>
  )
}
