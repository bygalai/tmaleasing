import { Link, useLocation } from 'react-router-dom'

type Tab = {
  to: string
  label: string
  icon: React.ReactNode
}

function IconHome() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor">
      <path
        d="M4 10.5l8-6 8 6V20a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 20v-9.5Z"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9.5 21.5v-6.5h5v6.5" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

function IconHeart() {
  return (
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
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
      />
    </svg>
  )
}

function IconUser() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor">
      <path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Z" strokeWidth="2" />
      <path
        d="M4.5 21a7.5 7.5 0 0 1 15 0"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconInfo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor">
      <path d="M12 21a9 9 0 1 0-9-9 9 9 0 0 0 9 9Z" strokeWidth="2" />
      <path d="M12 10.5V16" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 7.5h.01" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

const tabs: Tab[] = [
  { to: '/', label: 'Главная', icon: <IconHome /> },
  { to: '/favorites', label: 'Избранное', icon: <IconHeart /> },
  { to: '/profile', label: 'Профиль', icon: <IconUser /> },
  { to: '/about', label: 'О нас', icon: <IconInfo /> },
]

export function BottomNav() {
  const location = useLocation()

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/'
    return location.pathname === to
  }

  return (
    <nav
      className="fixed left-1/2 z-50 w-[min(92vw,680px)] -translate-x-1/2"
      style={{ bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 0px) + 14px)' }}
      aria-label="Навигация"
    >
      <div className="liquid-glass-apple-dark mx-auto flex w-fit items-center gap-2 rounded-full px-3 py-2">
        {tabs.map((tab) => {
          const active = isActive(tab.to)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-label={tab.label}
              className={[
                'group relative flex h-12 w-12 items-center justify-center rounded-full text-slate-900/70 transition',
                active ? 'bg-black/10 text-slate-900' : 'hover:bg-black/5',
              ].join(' ')}
            >
              <span className="relative z-10">{tab.icon}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

