export type ListingBadge = 'in_stock' | 'leasing' | 'discount'

export type Listing = {
  id: string
  category?: string
  title: string
  subtitle: string
  priceRub: number
  /** Старая цена до скидки — показываем зачёркнутой серым. */
  originalPriceRub?: number
  marketLowRub: number
  marketAvgRub: number
  marketHighRub: number
  year?: number
  mileageKm?: number
  location?: string
  imageUrl: string
  imageUrls: string[]
  detailUrl: string
  description: string
  badges: ListingBadge[]
  discountPercent?: number
}

export type ListingsResponse = {
  items: Listing[]
  updatedAt: string
}
