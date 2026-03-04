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

const tabs: Tab[] = [
  { to: '/', label: 'Главная', icon: <IconHome /> },
  { to: '/favorites', label: 'Избранное', icon: <IconHeart /> },
  { to: '/profile', label: 'Профиль', icon: <IconUser /> },
]

const SLOT_WIDTH = 72

type BottomNavProps = {
  favoritesCount?: number
}

export function BottomNav({ favoritesCount = 0 }: BottomNavProps) {
  const location = useLocation()

  const rawIndex = tabs.findIndex((tab) =>
    tab.to === '/' ? location.pathname === '/' : location.pathname === tab.to
  )
  const activeIndex = rawIndex >= 0 ? rawIndex : 0

  return (
    <nav
      className="fixed left-1/2 z-50 w-[min(92vw,680px)] -translate-x-1/2"
      style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 14px)' }}
      aria-label="Навигация"
    >
      <div className="liquid-glass-nav relative mx-auto flex w-fit items-center justify-center gap-8 rounded-xl px-5 py-2.5">
        {/* Sliding pill background — капля перетекает при смене таба */}
        {rawIndex >= 0 && (
          <div
            className="absolute left-2.5 top-1/2 h-10 w-14 -translate-y-1/2 rounded-full bg-brand/60 transition-all duration-300 ease-out"
            style={{
              transform: `translateX(${activeIndex * SLOT_WIDTH}px) translateY(-50%)`,
            }}
            aria-hidden
          />
        )}
        {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              aria-label={tab.to === '/favorites' && favoritesCount > 0 ? `${tab.label} (${favoritesCount})` : tab.label}
              className={[
                'relative z-10 flex h-9 w-9 items-center justify-center text-slate-900 transition-colors',
                'hover:text-slate-700',
              ].join(' ')}
            >
              {tab.icon}
              {tab.to === '/favorites' && favoritesCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-lg bg-brand px-1 text-[10px] font-sf font-medium text-white">
                  {favoritesCount > 99 ? '99+' : favoritesCount}
                </span>
              )}
            </Link>
        ))}
      </div>
    </nav>
  )
}

