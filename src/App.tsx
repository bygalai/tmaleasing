import { useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { MenuButton } from './components/navigation/MenuButton'
import { MenuDrawer } from './components/navigation/MenuDrawer'
import { useFavorites } from './hooks/useFavorites'
import { useListings } from './hooks/useListings'
import { AboutPage } from './pages/AboutPage'
import { CatalogPage } from './pages/CatalogPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { ListingPage } from './pages/ListingPage'
import { ProfilePage } from './pages/ProfilePage'

function Header() {
  const location = useLocation()
  const pageTitle =
    location.pathname === '/'
      ? 'Маркетплейс техники'
      : location.pathname.startsWith('/listing/')
        ? 'Карточка техники'
        : location.pathname === '/favorites'
          ? 'Избранное'
          : location.pathname === '/profile'
            ? 'Профиль'
            : 'О нас'

  return (
    <div className="space-y-1">
      <p className="text-xs tracking-[0.2em] text-white/60">GONKA</p>
      <h1 className="text-xl font-semibold text-[#F2F3F5]">{pageTitle}</h1>
    </div>
  )
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { items, isLoading, error } = useListings()
  const { isFavorite, toggleFavorite } = useFavorites()

  return (
    <AppLayout>
      <header className="mb-5 flex items-center justify-between gap-4">
        <Header />
        <MenuButton onClick={() => setMenuOpen(true)} />
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <CatalogPage
              items={items}
              isLoading={isLoading}
              error={error}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
            />
          }
        />
        <Route
          path="/listing/:id"
          element={
            <ListingPage items={items} isFavorite={isFavorite} toggleFavorite={toggleFavorite} />
          }
        />
        <Route
          path="/favorites"
          element={
            <FavoritesPage items={items} isFavorite={isFavorite} toggleFavorite={toggleFavorite} />
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <MenuDrawer isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </AppLayout>
  )
}

export default App
