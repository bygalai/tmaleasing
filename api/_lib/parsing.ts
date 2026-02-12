import { createHash } from 'node:crypto'
import type { ProviderId } from './models.js'

export const FALLBACK_IMAGE =
  'https://dummyimage.com/1200x800/1f2937/e5e7eb&text=Vehicle+Photo+Pending'

export function parsePrice(text: string): number | undefined {
  const normalized = text.replace(/\s+/g, ' ')
  const currencyMatches = normalized.match(/(\d[\d\s]{2,15})\s*(?:₽|руб(?:\.|лей|ля|ль)?|rur)/gi) ?? []
  const currencyValues: number[] = []
  for (const raw of currencyMatches) {
    const value = Number(raw.replace(/[^\d]/g, ''))
    if (Number.isFinite(value) && value >= 300000 && value <= 200000000) {
      currencyValues.push(value)
    }
  }
  if (currencyValues.length > 0) {
    return Math.max(...currencyValues)
  }

  // Fallback for pages where currency sign is hidden in markup/entities.
  const candidates = normalized.match(/\d[\d\s]{5,9}/g) ?? []
  for (const candidate of candidates) {
    const value = Number(candidate.replace(/[^\d]/g, ''))
    if (Number.isFinite(value) && value >= 300000 && value <= 200000000) {
      return value
    }
  }

  return undefined
}

export function parseYear(text: string): number | undefined {
  const match = text.match(/(19|20)\d{2}/)
  if (!match) return undefined
  const value = Number(match[0])
  return value >= 1990 && value <= new Date().getFullYear() + 1 ? value : undefined
}

export function parseMileage(text: string): number | undefined {
  const match = text.match(/(\d[\d\s]{2,})\s*(км|km)/i)
  if (!match) return undefined
  const value = Number(match[1].replace(/[^\d]/g, ''))
  return Number.isFinite(value) ? value : undefined
}

export function normalizeUrl(url: string | undefined, base: string): string {
  if (!url) return base
  const normalized = url.trim().replace(/^['"]|['"]$/g, '')
  if (!normalized) return base
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized
  if (normalized.startsWith('//')) return `https:${normalized}`
  return new URL(normalized, base).toString()
}

export function normalizeOptionalUrl(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined
  const normalized = url.trim().replace(/^['"]|['"]$/g, '')
  if (!normalized) return undefined
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized
  if (normalized.startsWith('//')) return `https:${normalized}`
  return new URL(normalized, base).toString()
}

export function makeId(providerId: ProviderId, title: string, priceRub: number): string {
  const hash = createHash('sha1')
    .update(`${providerId}:${title}:${priceRub}`)
    .digest('hex')
    .slice(0, 14)
  return `${providerId}-${hash}`
}

export function pickText(...parts: Array<string | undefined>): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function estimateMarket(priceRub: number) {
  return {
    marketLowRub: Math.round(priceRub * 0.88),
    marketAvgRub: Math.round(priceRub * 1.02),
    marketHighRub: Math.round(priceRub * 1.17),
  }
}
