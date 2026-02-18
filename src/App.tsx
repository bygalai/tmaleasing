import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { BottomNav } from './components/navigation/BottomNav'
import { useFavorites } from './hooks/useFavorites'
import { useListings } from './hooks/useListings'
import { AboutPage } from './pages/AboutPage'
import { CatalogPage } from './pages/CatalogPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { ListingPage } from './pages/ListingPage'
import { ProfilePage } from './pages/ProfilePage'

function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const isListing = location.pathname.startsWith('/listing/')

  const goBack = () => {
    // In Mini Apps the history stack can be empty, so keep a safe fallback.
    if (window.history.length > 1) navigate(-1)
    else navigate('/', { replace: true })
  }

  return (
    <div className="relative flex w-full items-center justify-center">
      {isListing ? (
        <button
          type="button"
          onClick={goBack}
          aria-label="Назад в каталог"
          className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-black/5 text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.10)] backdrop-blur-xl"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      ) : null}
      <h1 className="min-w-0 whitespace-nowrap text-[38px] font-bold leading-[1] tracking-tight text-[#FF5C34] [font-family:Helvetica,Arial,sans-serif]">
        "GONKA" MARKETPLACE
      </h1>
    </div>
  )
}

function App() {
  const { items, isLoading, error } = useListings()
  const { isFavorite, toggleFavorite } = useFavorites()

  return (
    <AppLayout>
      <header className="mb-5 flex items-center justify-center">
        <Header />
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

      <BottomNav />
    </AppLayout>
  )
}

export default App
