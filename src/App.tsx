import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ScrollToTop } from './components/ScrollToTop'
import { BottomNav } from './components/navigation/BottomNav'
import { SplashScreen } from './components/SplashScreen'
import { useFavorites } from './hooks/useFavorites'
import { useListings } from './hooks/useListings'
import { AboutPage } from './pages/AboutPage'
import { CatalogPage } from './pages/CatalogPage'
import { CategorySelectionPage } from './pages/CategorySelectionPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { ListingPage } from './pages/ListingPage'
import { ProfilePage } from './pages/ProfilePage'

function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const isListing = location.pathname.startsWith('/listing/')
  const isCatalog = location.pathname.startsWith('/catalog/')

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/', { replace: true })
  }

  const goToCategories = () => navigate('/', { replace: true })

  if (isListing) {
    return (
      <div className="relative flex w-full items-center justify-center">
        <button
          type="button"
          onClick={goBack}
          aria-label="Назад в каталог"
          className="absolute left-0 flex h-10 w-10 shrink-0 items-center justify-center text-slate-900"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="butt"
            strokeLinejoin="miter"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="whitespace-nowrap font-bold leading-[1] tracking-tight text-[#FF5C34] [font-family:Helvetica,Arial,sans-serif] [font-size:clamp(28px,8vw,42px)]">
          "GONKA"
        </h1>
      </div>
    )
  }

  if (isCatalog) {
    return (
      <div className="relative flex w-full items-center justify-center">
        <button
          type="button"
          onClick={goToCategories}
          aria-label="Назад к выбору раздела"
          className="absolute left-0 flex h-10 w-10 shrink-0 items-center justify-center text-slate-900"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="butt"
            strokeLinejoin="miter"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="whitespace-nowrap font-bold leading-[1] tracking-tight text-[#FF5C34] [font-family:Helvetica,Arial,sans-serif] [font-size:clamp(28px,8vw,42px)]">
          "GONKA"
        </h1>
      </div>
    )
  }

  return (
    <div className="relative flex w-full items-center justify-center">
      <h1 className="whitespace-nowrap font-bold leading-[1] tracking-tight text-[#FF5C34] [font-family:Helvetica,Arial,sans-serif] [font-size:clamp(24px,7vw,38px)]">
        "GONKA" MARKETPLACE
      </h1>
    </div>
  )
}

function App() {
  const location = useLocation()
  const { items, isLoading, error } = useListings()
  const { favorites, isFavorite, toggleFavorite } = useFavorites()
  const [splashVisible, setSplashVisible] = useState(true)
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  const isStickyHeader =
    location.pathname.startsWith('/catalog/') || location.pathname.startsWith('/listing/')

  const handleSplashReady = useCallback(() => {
    setSplashVisible(false)
  }, [])

  useEffect(() => {
    function handleFocusIn(event: FocusEvent) {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setIsSearchFocused(true)
      }
    }

    function handleFocusOut() {
      // Небольшая задержка, чтобы успел сфокусироваться следующий инпут (если есть).
      window.setTimeout(() => {
        const active = document.activeElement as HTMLElement | null
        if (!active) {
          setIsSearchFocused(false)
          return
        }
        if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') {
          setIsSearchFocused(true)
        } else {
          setIsSearchFocused(false)
        }
      }, 50)
    }

    window.addEventListener('focusin', handleFocusIn)
    window.addEventListener('focusout', handleFocusOut)
    return () => {
      window.removeEventListener('focusin', handleFocusIn)
      window.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  if (splashVisible) {
    return (
      <SplashScreen onReady={handleSplashReady} isAppReady={!isLoading} />
    )
  }

  return (
    <AppLayout>
      <ScrollToTop />
      <header
        className={
          isStickyHeader
            ? 'sticky top-0 z-20 -mx-4 -mt-5 flex items-center justify-center px-4 pt-[calc(max(env(safe-area-inset-top,0px),1.25rem)+0.75rem)] pb-3 mb-5 bg-white/95 shadow-sm backdrop-blur-md'
            : 'mb-5 flex items-center justify-center'
        }
      >
        <Header />
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <CategorySelectionPage
              items={items}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
              onSearchFocusedChange={setIsSearchFocused}
            />
          }
        />
        <Route
          path="/catalog/:category"
          element={
            <CatalogPage
              items={items}
              isLoading={isLoading}
              error={error}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
              onSearchFocusedChange={setIsSearchFocused}
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
        <Route path="/catalog" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {!isSearchFocused && <BottomNav favoritesCount={favorites.length} />}
    </AppLayout>
  )
}

export default App
