import { useCallback, useMemo, useState } from 'react'

const STORAGE_KEY = 'gonka:favorites'

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites())

  const toggleFavorite = useCallback((listingId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(listingId)
        ? prev.filter((id) => id !== listingId)
        : [...prev, listingId]

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const isFavorite = useCallback(
    (listingId: string) => favorites.includes(listingId),
    [favorites],
  )

  return useMemo(
    () => ({
      favorites,
      isFavorite,
      toggleFavorite,
    }),
    [favorites, isFavorite, toggleFavorite],
  )
}
