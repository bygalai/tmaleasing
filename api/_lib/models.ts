export type ProviderId = 'vtb' | 'europlan' | 'ileasing' | 'alfaleasing' | 'autogpbl'

export type ListingBadge = 'in_stock' | 'leasing' | 'discount'

export type InternalSource = {
  providerId: ProviderId
  providerName: string
  providerUrl: string
  listingUrl: string
  parserHint: string
  fallback: boolean
}

export type InternalListing = {
  id: string
  title: string
  subtitle: string
  priceRub: number
  marketLowRub: number
  marketAvgRub: number
  marketHighRub: number
  year?: number
  mileageKm?: number
  location?: string
  imageUrl: string
  detailUrl: string
  description: string
  badges: ListingBadge[]
  discountPercent?: number
  source: InternalSource
}

export type PublicListing = Omit<InternalListing, 'source'>
