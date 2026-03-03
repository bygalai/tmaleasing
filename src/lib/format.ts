export function formatPriceRub(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatMileage(value?: number): string {
  if (!value) return 'Пробег не указан'
  return `${new Intl.NumberFormat('ru-RU').format(value)} км`
}

/** Для прицепов: наработка в м.ч. */
export function formatMileageHours(value?: number): string {
  if (!value) return 'Наработка не указана'
  return `${new Intl.NumberFormat('ru-RU').format(value)} м.ч.`
}
