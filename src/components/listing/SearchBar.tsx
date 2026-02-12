type SearchBarProps = {
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs tracking-[0.14em] text-white/65">ПОИСК ТЕХНИКИ</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Марка, модель, город, год"
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#F2F3F5] outline-none placeholder:text-white/45 focus:border-[#FF5C34]"
      />
    </label>
  )
}
