import { formatMileage, formatMileageHours } from './format'
import type { Listing } from '../types/marketplace'

/** Краткая строка характеристик для ленты (как на Auto.ru): части через « · ». */
export function buildListingSpecLine(item: Listing): string {
  const parts: string[] = []

  if (item.category === 'pricepy') {
    parts.push(formatMileageHours(item.mileageKm))
  } else {
    parts.push(formatMileage(item.mileageKm))
  }

  const subtitleBits = item.subtitle
    ? item.subtitle
        .split(/[·•,|]/g)
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  if (item.bodyType?.trim()) {
    parts.push(item.bodyType.trim())
  } else if (subtitleBits[0]) {
    parts.push(subtitleBits[0])
  }

  if (item.drivetrain?.trim()) {
    parts.push(item.drivetrain.trim())
  } else if (subtitleBits[1]) {
    parts.push(subtitleBits[1])
  } else if (subtitleBits[2]) {
    parts.push(subtitleBits[2])
  }

  return parts.filter(Boolean).join(' · ')
}
