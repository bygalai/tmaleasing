export function formatPriceRub(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)
}

/** Возвращает части цены: число и символ ₽ отдельно, без пробела перед символом. */
export function splitPriceRub(value: number): { amount: string; currency: string } {
  const currency = '₽'
  // Форматируем число без валюты и заменяем пробелы между разрядами на точки: 2.475.000
  const rawNumber = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(value)

  const amount = rawNumber.replace(/\s/g, '.')
  return { amount, currency }
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
