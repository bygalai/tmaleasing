/**
 * Чистит поле города от хвостов источников (часто Alfaleasing: «Москва АЛЬФАЛИЗИНГ» / обрезанное «АЛ»).
 */
export function normalizeListingCity(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined
  let s = raw.replace(/\s+/g, ' ').trim()
  if (!s) return undefined

  // Полные хвосты бренда
  s = s.replace(/\s+АЛЬФАЛИЗИНГ\s*$/iu, '')
  s = s.replace(/\s+АЛЬФА\s*$/iu, '')
  s = s.replace(/\s+Альфа[-\s]?Лизинг\s*$/iu, '')
  // Обрезанное «АЛ…» после города (не трогаем однословные значения)
  s = s.replace(/\s+АЛ\s*$/u, '')

  s = s.replace(/\s+/g, ' ').trim()
  return s || undefined
}
