import type { Listing } from '../types/marketplace'

// ── Brand extraction ────────────────────────────────────────

const BRAND_DISPLAY: Record<string, string> = {
  // Китайские грузовые / спецтехника
  shacman: 'Shacman', шакман: 'Shacman',
  sitrak: 'Sitrak', ситрак: 'Sitrak',
  howo: 'HOWO', хово: 'HOWO',
  dongfeng: 'Dongfeng', донгфенг: 'Dongfeng', донфенг: 'Dongfeng', dfm: 'Dongfeng',
  faw: 'FAW', фав: 'FAW',
  foton: 'Foton', фотон: 'Foton',
  jac: 'JAC', джак: 'JAC', жак: 'JAC',
  tonly: 'Tonly', тонли: 'Tonly',
  sany: 'SANY', сани: 'SANY',
  lonking: 'Lonking', лонкинг: 'Lonking',
  xcmg: 'XCMG', sdlg: 'SDLG', liugong: 'LiuGong', shantui: 'Shantui',
  zoomlion: 'Zoomlion', зумлион: 'Zoomlion',

  // Европейские грузовые
  scania: 'Scania', скания: 'Scania',
  volvo: 'Volvo', вольво: 'Volvo',
  man: 'MAN', ман: 'MAN',
  daf: 'DAF', даф: 'DAF',
  iveco: 'Iveco', ивеко: 'Iveco',
  mercedes: 'Mercedes-Benz', мерседес: 'Mercedes-Benz', 'mercedes-benz': 'Mercedes-Benz',
  renault: 'Renault', рено: 'Renault',

  // Российские
  камаз: 'КАМАЗ', kamaz: 'КАМАЗ',
  маз: 'МАЗ', maz: 'МАЗ',
  газ: 'ГАЗ', gaz: 'ГАЗ', газель: 'ГАЗ', газон: 'ГАЗ',
  урал: 'Урал', ural: 'Урал',
  lada: 'LADA', лада: 'LADA', ваз: 'LADA',
  уаз: 'УАЗ', uaz: 'УАЗ',
  нефаз: 'НЕФАЗ', nefaz: 'НЕФАЗ',
  тонар: 'Тонар', tonar: 'Тонар',

  // Японские
  toyota: 'Toyota', тойота: 'Toyota', тайота: 'Toyota',
  nissan: 'Nissan', ниссан: 'Nissan',
  honda: 'Honda', хонда: 'Honda',
  mazda: 'Mazda', мазда: 'Mazda',
  mitsubishi: 'Mitsubishi', мицубиси: 'Mitsubishi', митсубиши: 'Mitsubishi',
  subaru: 'Subaru', субару: 'Subaru',
  suzuki: 'Suzuki', сузуки: 'Suzuki',
  lexus: 'Lexus', лексус: 'Lexus',
  infiniti: 'Infiniti', инфинити: 'Infiniti',
  isuzu: 'Isuzu', исузу: 'Isuzu',
  hino: 'Hino', хино: 'Hino',

  // Корейские
  hyundai: 'Hyundai', хёндай: 'Hyundai', хендай: 'Hyundai', хундай: 'Hyundai', хендэ: 'Hyundai',
  kia: 'Kia', киа: 'Kia',
  genesis: 'Genesis',
  ssangyong: 'SsangYong', ссангйонг: 'SsangYong',
  daewoo: 'Daewoo', дэу: 'Daewoo',

  // Китайские легковые
  chery: 'Chery', чери: 'Chery', черри: 'Chery',
  geely: 'Geely', джили: 'Geely',
  haval: 'Haval', хавал: 'Haval',
  changan: 'Changan', чанган: 'Changan',
  omoda: 'Omoda', омода: 'Omoda',
  exeed: 'Exeed', эксид: 'Exeed',
  byd: 'BYD', бид: 'BYD',
  tank: 'Tank',
  lifan: 'Lifan', лифан: 'Lifan',
  gac: 'GAC',
  jetour: 'Jetour', джетур: 'Jetour',

  // Немецкие
  bmw: 'BMW', бмв: 'BMW',
  audi: 'Audi', ауди: 'Audi',
  volkswagen: 'Volkswagen', фольксваген: 'Volkswagen',
  porsche: 'Porsche', порше: 'Porsche',
  opel: 'Opel', опель: 'Opel',

  // Французские
  peugeot: 'Peugeot', пежо: 'Peugeot',
  citroen: 'Citroen', ситроен: 'Citroen',

  // Американские
  ford: 'Ford', форд: 'Ford',
  chevrolet: 'Chevrolet', шевроле: 'Chevrolet', шевролле: 'Chevrolet',
  jeep: 'Jeep', джип: 'Jeep',
  cadillac: 'Cadillac', кадиллак: 'Cadillac',
  chrysler: 'Chrysler', dodge: 'Dodge',

  // Другие
  skoda: 'Skoda', шкода: 'Skoda',
  fiat: 'Fiat', фиат: 'Fiat',
  mini: 'MINI',

  // Прицепные бренды
  schmitz: 'Schmitz', шмитц: 'Schmitz',
  krone: 'Krone', кроне: 'Krone',
  wielton: 'Wielton', grunwald: 'Grunwald',
  cimc: 'CIMC',
  kogel: 'Kögel', кёгель: 'Kögel',
}

const MULTI_WORD_BRANDS: [string, string][] = [
  ['great wall', 'Great Wall'],
  ['грейт волл', 'Great Wall'],
  ['land rover', 'Land Rover'],
  ['ленд ровер', 'Land Rover'],
  ['lada (ваз)', 'LADA'],
  ['mercedes-benz', 'Mercedes-Benz'],
  ['мерседес-бенц', 'Mercedes-Benz'],
  ['мерседес бенц', 'Mercedes-Benz'],
].sort((a, b) => b[0].length - a[0].length) as [string, string][]

export function extractBrand(title: string): string | undefined {
  const lower = title.toLowerCase().trim()

  for (const [pattern, brand] of MULTI_WORD_BRANDS) {
    if (lower.startsWith(pattern + ' ') || lower.startsWith(pattern + ',') || lower === pattern) {
      return brand
    }
  }

  const words = lower.split(/[\s(,/]+/).filter((w) => w.length > 0)
  for (let i = 0; i < Math.min(words.length, 5); i++) {
    const word = words[i].replace(/^["'«]+|["'»]+$/g, '')
    if (BRAND_DISPLAY[word]) return BRAND_DISPLAY[word]
  }

  return undefined
}

// ── Filter state ────────────────────────────────────────────

export type FilterState = {
  brands: string[]
  bodyTypes: string[]
  drivetrains: string[]
  locations: string[]
  priceFrom: string
  priceTo: string
  mileageFrom: string
  mileageTo: string
}

export function emptyFilterState(): FilterState {
  return { brands: [], bodyTypes: [], drivetrains: [], locations: [], priceFrom: '', priceTo: '', mileageFrom: '', mileageTo: '' }
}

export function countActiveFilters(f: FilterState): number {
  let n = 0
  if (f.brands.length > 0) n++
  if (f.bodyTypes.length > 0) n++
  if (f.drivetrains.length > 0) n++
  if (f.locations.length > 0) n++
  if (f.priceFrom || f.priceTo) n++
  if (f.mileageFrom || f.mileageTo) n++
  return n
}

// ── Available options (derived from data) ───────────────────

export type FilterOption = { value: string; count: number }

export function getAvailableBrands(items: Listing[]): FilterOption[] {
  const map = new Map<string, number>()
  for (const item of items) {
    if (!item.brand) continue
    map.set(item.brand, (map.get(item.brand) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
}

export function getAvailableBodyTypes(items: Listing[]): FilterOption[] {
  const map = new Map<string, number>()
  for (const item of items) {
    if (!item.bodyType) continue
    const normalized = capitalizeFirst(item.bodyType.trim())
    if (!normalized) continue
    map.set(normalized, (map.get(normalized) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
}

export function getAvailableDrivetrains(items: Listing[]): FilterOption[] {
  const map = new Map<string, number>()
  for (const item of items) {
    if (!item.drivetrain) continue
    const val = item.drivetrain.trim()
    if (!val) continue
    map.set(val, (map.get(val) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
}

export function getAvailableLocations(items: Listing[]): FilterOption[] {
  const map = new Map<string, number>()
  for (const item of items) {
    if (!item.location) continue
    const val = item.location.trim()
    if (!val) continue
    map.set(val, (map.get(val) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
}

function capitalizeFirst(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// ── Cross-filtering (faceted counts) ────────────────────────

type FilterField = 'brands' | 'bodyTypes' | 'drivetrains' | 'locations'

/**
 * Фильтрует лоты по всем параметрам draft, кроме одного (`exclude`).
 * Используется для вычисления счётчиков в каждой секции фильтров:
 * счётчик у города учитывает выбранный бренд, тип кузова и т.д.
 */
export function filterItemsExcluding(items: Listing[], f: FilterState, exclude: FilterField): Listing[] {
  return items.filter((item) => {
    if (exclude !== 'brands' && f.brands.length > 0) {
      if (!item.brand || !f.brands.includes(item.brand)) return false
    }
    if (exclude !== 'bodyTypes' && f.bodyTypes.length > 0) {
      if (!item.bodyType) return false
      const bt = capitalizeFirst(item.bodyType.trim())
      if (!f.bodyTypes.includes(bt)) return false
    }
    if (exclude !== 'drivetrains' && f.drivetrains.length > 0) {
      if (!item.drivetrain || !f.drivetrains.includes(item.drivetrain.trim())) return false
    }
    if (exclude !== 'locations' && f.locations.length > 0) {
      if (!item.location || !f.locations.includes(item.location.trim())) return false
    }
    const priceFrom = f.priceFrom ? Number(f.priceFrom) : undefined
    const priceTo = f.priceTo ? Number(f.priceTo) : undefined
    if (priceFrom && item.priceRub < priceFrom) return false
    if (priceTo && item.priceRub > priceTo) return false
    const mileageFrom = f.mileageFrom ? Number(f.mileageFrom) : undefined
    const mileageTo = f.mileageTo ? Number(f.mileageTo) : undefined
    if (mileageFrom != null && (item.mileageKm == null || item.mileageKm < mileageFrom)) return false
    if (mileageTo != null && (item.mileageKm == null || item.mileageKm > mileageTo)) return false
    return true
  })
}

// ── Filter application ──────────────────────────────────────

function isVtbOrEuroplan(source?: string): boolean {
  if (!source) return false
  const s = source.toLowerCase().trim()
  return s === 'vtb' || s === 'europlan'
}

function matchesNonBodyTypeFilters(item: Listing, f: FilterState): boolean {
  if (f.brands.length > 0) {
    if (!item.brand || !f.brands.includes(item.brand)) return false
  }

  if (f.drivetrains.length > 0) {
    if (!item.drivetrain || !f.drivetrains.includes(item.drivetrain.trim())) return false
  }

  if (f.locations.length > 0) {
    if (!item.location || !f.locations.includes(item.location.trim())) return false
  }

  const priceFrom = f.priceFrom ? Number(f.priceFrom) : undefined
  const priceTo = f.priceTo ? Number(f.priceTo) : undefined
  if (priceFrom && item.priceRub < priceFrom) return false
  if (priceTo && item.priceRub > priceTo) return false

  const mileageFrom = f.mileageFrom ? Number(f.mileageFrom) : undefined
  const mileageTo = f.mileageTo ? Number(f.mileageTo) : undefined
  if (mileageFrom != null && (item.mileageKm == null || item.mileageKm < mileageFrom)) return false
  if (mileageTo != null && (item.mileageKm == null || item.mileageKm > mileageTo)) return false

  return true
}

function matchesBodyType(item: Listing, selectedTypes: string[]): boolean {
  if (selectedTypes.length === 0) return true
  if (!item.bodyType) return false
  const itemType = capitalizeFirst(item.bodyType.trim())
  return selectedTypes.includes(itemType)
}

/**
 * Применяет фильтры к списку объявлений.
 *
 * Особое правило: если активен фильтр по типу кузова, лоты из ВТБ/Европлан
 * без указанного типа всё равно показываются — после основных отфильтрованных
 * результатов (при условии соответствия остальным фильтрам).
 */
export function applyFilters(items: Listing[], f: FilterState): Listing[] {
  const hasAny =
    f.brands.length > 0 ||
    f.bodyTypes.length > 0 ||
    f.drivetrains.length > 0 ||
    f.locations.length > 0 ||
    f.priceFrom !== '' ||
    f.priceTo !== '' ||
    f.mileageFrom !== '' ||
    f.mileageTo !== ''
  if (!hasAny) return items

  const hasBodyTypeFilter = f.bodyTypes.length > 0

  if (!hasBodyTypeFilter) {
    return items.filter((item) => matchesNonBodyTypeFilters(item, f))
  }

  const matched: Listing[] = []
  const vtbEpFallback: Listing[] = []

  for (const item of items) {
    if (!matchesNonBodyTypeFilters(item, f)) continue

    if (matchesBodyType(item, f.bodyTypes)) {
      matched.push(item)
    } else if (!item.bodyType && isVtbOrEuroplan(item.source)) {
      vtbEpFallback.push(item)
    }
  }

  return [...matched, ...vtbEpFallback]
}

/**
 * Число строго подходящих лотов (без VTB/Europlan fallback).
 * Используется для кнопки «Показать N лотов» в панели фильтров.
 */
export function countStrictMatches(items: Listing[], f: FilterState): number {
  const hasAny =
    f.brands.length > 0 ||
    f.bodyTypes.length > 0 ||
    f.drivetrains.length > 0 ||
    f.locations.length > 0 ||
    f.priceFrom !== '' ||
    f.priceTo !== '' ||
    f.mileageFrom !== '' ||
    f.mileageTo !== ''
  if (!hasAny) return items.length

  let count = 0
  for (const item of items) {
    if (!matchesNonBodyTypeFilters(item, f)) continue
    if (!matchesBodyType(item, f.bodyTypes)) continue
    count++
  }
  return count
}
