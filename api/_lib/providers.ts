import type { ProviderId } from './models.js'

export type ProviderConfig = {
  id: ProviderId
  name: string
  url: string
  selectors: string[]
  parserHint: string
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'vtb',
    name: 'ВТБ Лизинг',
    url: 'https://www.vtb-leasing.ru/auto-market/',
    selectors: ['.catalog-item', '.auto-item', '.product-card', 'article'],
    parserHint: 'vtb-market',
  },
  {
    id: 'europlan',
    name: 'Европлан',
    url: 'https://europlan.ru/auto/stock/cars',
    selectors: ['.car-card', '.stock-card', '.catalog-item', 'article'],
    parserHint: 'europlan-stock',
  },
  {
    id: 'ileasing',
    name: 'Интерлизинг',
    url: 'https://www.ileasing.ru/bu_tehnika/',
    selectors: ['.tech-item', '.catalog-item', '.card', 'article'],
    parserHint: 'ileasing-bu',
  },
  {
    id: 'alfaleasing',
    name: 'Альфа-Лизинг',
    url: 'https://alfaleasing.ru/rasprodazha-avto-s-probegom/',
    selectors: ['.sale-item', '.catalog-item', '.card', 'article'],
    parserHint: 'alfaleasing-resale',
  },
  {
    id: 'autogpbl',
    name: 'Газпромбанк Автолизинг',
    url: 'https://autogpbl.ru/avtomobili-i-tekhnika-s-probegom/',
    selectors: ['.car-item', '.vehicle-item', '.catalog-item', 'article'],
    parserHint: 'autogpbl-used',
  },
]
