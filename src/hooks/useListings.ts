import { useEffect, useState } from 'react'
import type { Listing, ListingsResponse } from '../types/marketplace'

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
    detailUrl: 'https://t.me/GONKACONFBOT',
    description: 'Конфискованная техника от лизинговой компании.',
    badges: ['in_stock', 'leasing', 'discount'],
    discountPercent: 8,
  },
]

export function useListings() {
  const [items, setItems] = useState<Listing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const response = await fetch('/api/listings')
        if (!response.ok) throw new Error('Ошибка загрузки каталога')

        const data = (await response.json()) as ListingsResponse
        if (!cancelled) {
          setItems(data.items)
          setError(null)
        }
      } catch {
        if (!cancelled) {
          setItems(mockListings)
          setError('Показаны демо-данные. API временно недоступно.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  return { items, isLoading, error }
}
