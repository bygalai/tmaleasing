type MenuButtonProps = {
  onClick: () => void
}

export function MenuButton({ onClick }: MenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition hover:bg-white/10"
      aria-label="Открыть меню"
    >
      <span className="flex w-5 flex-col gap-1.5">
        <span className="h-0.5 w-full rounded bg-[#F2F3F5]" />
        <span className="h-0.5 w-full rounded bg-[#F2F3F5]" />
        <span className="h-0.5 w-full rounded bg-[#F2F3F5]" />
        <span className="h-0.5 w-full rounded bg-[#F2F3F5]" />
      </span>
    </button>
  )
}
