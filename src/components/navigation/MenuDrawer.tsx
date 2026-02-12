import { Link } from 'react-router-dom'

type MenuDrawerProps = {
  isOpen: boolean
  onClose: () => void
}

const links = [
  { to: '/', label: 'Главная' },
  { to: '/favorites', label: 'Избранное' },
  { to: '/profile', label: 'Профиль' },
  { to: '/about', label: 'О нас' },
]

export function MenuDrawer({ isOpen, onClose }: MenuDrawerProps) {
  return (
    <>
      {isOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60"
          onClick={onClose}
          aria-label="Закрыть меню"
        />
      ) : null}
      <aside
        className={`fixed right-0 top-0 z-50 h-dvh w-[280px] border-l border-white/10 bg-[#2f343d]/95 p-5 backdrop-blur transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm font-medium tracking-[0.18em] text-white/70">MENU</p>
          <button
            type="button"
            className="rounded-lg border border-white/10 px-2 py-1 text-sm text-white/70 hover:bg-white/10"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>

        <nav className="space-y-2">
          {links.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition hover:bg-white/10"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  )
}
