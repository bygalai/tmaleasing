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
