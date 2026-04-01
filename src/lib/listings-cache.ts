import type { Listing } from '../types/marketplace'

const LISTINGS_CACHE_KEY = 'tma:listings:v1'

function isListingShape(value: unknown): value is Listing {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.title !== 'string' || typeof o.priceRub !== 'number') return false
  if (typeof o.subtitle !== 'string' || typeof o.description !== 'string' || typeof o.detailUrl !== 'string') return false
  if (typeof o.imageUrl !== 'string') return false
  if (
    typeof o.marketLowRub !== 'number' ||
    typeof o.marketAvgRub !== 'number' ||
    typeof o.marketHighRub !== 'number'
  ) {
    return false
  }
  if (!Array.isArray(o.badges)) return false
  if (!Array.isArray(o.imageUrls) || o.imageUrls.length === 0) return false
  if (!o.imageUrls.every((u): u is string => typeof u === 'string')) return false
  return true
}

export function readListingsCache(): Listing[] | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LISTINGS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const valid: Listing[] = []
    for (const item of parsed) {
      if (isListingShape(item)) valid.push(item)
    }
    if (valid.length === 0) return null
    return valid
  } catch {
    return null
  }
}

export function writeListingsCache(items: Listing[]): void {
  try {
    if (typeof localStorage === 'undefined' || items.length === 0) return
    localStorage.setItem(LISTINGS_CACHE_KEY, JSON.stringify(items))
  } catch (e) {
    console.warn('listings cache: write failed (quota or private mode)', e)
  }
}
