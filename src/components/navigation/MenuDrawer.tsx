import { Link } from 'react-router-dom'
import { MenuButton } from './MenuButton'

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
        className={`fixed left-0 top-0 z-50 h-dvh w-[280px] border-r border-white/10 bg-zinc-950/95 p-5 text-zinc-100 backdrop-blur-xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <p className="ml-1 text-sm font-medium tracking-[0.22em] text-zinc-500">MENU</p>
          <MenuButton isOpen={isOpen} onClick={onClose} />
        </div>

        <nav className="space-y-2">
          {links.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              className="block rounded-md border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 transition hover:bg-zinc-800"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
    </>
  )
}
