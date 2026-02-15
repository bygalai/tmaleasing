import { useEffect, useState } from 'react'
import type { Listing } from '../types/marketplace'

const FALLBACK_IMAGE =
  'https://dummyimage.com/1200x800/1f2937/e5e7eb&text=Vehicle+Photo+Pending'

const mockListings: Listing[] = [
  {
    id: 'mock-1',
    title: 'KAMAZ 5490 NEO',
    subtitle: 'Тягач, дизель, 4x2',
    priceRub: 4890000,
    marketLowRub: 4500000,
    marketAvgRub: 4970000,
    marketHighRub: 5500000,
    year: 2020,
    mileageKm: 267000,
    location: 'Москва',
    imageUrl: FALLBACK_IMAGE,
    imageUrls: [FALLBACK_IMAGE],
    detailUrl: 'https://t.me/GONKACONFBOT',
    description: 'Конфискованная техника от лизинговой компании.',
    badges: ['in_stock', 'leasing', 'discount'],
    discountPercent: 8,
  },
]

export function useListings() {
  const [items, setItems] = useState<Listing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    function load() {
      if (cancelled) return
      setIsLoading(true)
      setItems(mockListings)
      setIsLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  return { items, isLoading, error }
}
