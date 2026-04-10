import type { CategoryId } from '../types/marketplace'
import { inferEquipmentType } from './equipment-types'

/**
 * VTB кладёт в выдачу «легковых» карточки из общих JSON/API и соседних разделов.
 * Восстанавливаем рыночную категорию по заголовку и типу техники (как в каталоге GONKA).
 */

const PRICEPY_TYPES = new Set(['Полуприцеп', 'Прицеп'])

const SPEZ_TYPES = new Set([
  'Экскаватор-погрузчик',
  'Фронтальный погрузчик',
  'Телескопический погрузчик',
  'Мини-погрузчик',
  'Мини-экскаватор',
  'Буровая установка',
  'Буровая',
  'Бортовой с КМУ',
  'Бортовой с ГП',
  'Бортовая платформа',
  'Бетоносмеситель',
  'Бетононасос',
  'Топливозаправщик',
  'Автовышка',
  'Асфальтоукладчик',
  'Экскаватор',
  'Погрузчик',
  'Бульдозер',
  'Автокран',
  'Мусоровоз',
  'Манипулятор',
  'Трактор',
  'Комбайн',
  'Каток',
  'Грейдер',
  'Форвардер',
  'Харвестер',
])

const GRUZ_TYPES = new Set([
  'Седельный тягач',
  'Самосвал',
  'Фургон',
  'Рефрижератор',
  'Цистерна',
  'Бортовой',
  'Тентованный',
  'Изотермический',
  'Шторный',
  'Контейнеровоз',
  'Автобус',
  'Тягач',
  'Эвакуатор',
])

/** Марки/семейства грузовиков и колёсные формулы в заголовках VTB. */
const TRUCK_BRAND_OR_FORMULA_RE =
  /\b(?:камаз|маз|урал(?:next)?|howo|хово|шакман|shacman|sitrak|ситрак|man\b|ман\b|scania|скания|daf|даф|iveco|ивеко|renault\s+trucks|volvo\s+(?:fh|fm|fe|fl|vnr|vn|vnl|fec|fmx)|mercedes[- ]benz\s+(?:actros|atego|arocs|axor)|\bactros\b|\batego\b|\barocs\b|sany\s+(?:stc|str|src)|\b(?:[468]x[24]|[468]х[24])\b)\b/i

const TRAILER_STRONG_RE = /полуприцеп|прицеп\s+(?:schmitz|krone|wielton|kogel|grunwald|tonar|новтрак|когель)/i

function mapEquipmentTypeToCategory(equipmentType: string): CategoryId | null {
  if (PRICEPY_TYPES.has(equipmentType)) return 'pricepy'
  if (SPEZ_TYPES.has(equipmentType)) return 'speztechnika'
  if (GRUZ_TYPES.has(equipmentType)) return 'gruzovye'
  return null
}

/**
 * Возвращает категорию, если уверенно отличаем от «легковых»; иначе null (оставить как в БД).
 */
export function inferVtbCategoryFromSignals(
  title: string,
  bodyType: string | null | undefined,
): CategoryId | null {
  const t = (title ?? '').trim()
  if (!t) return null
  const haystack = `${t} ${(bodyType ?? '').trim()}`.trim()

  const eq =
    inferEquipmentType(haystack, 'speztechnika') ?? inferEquipmentType(haystack, 'gruzovye')
  if (eq) {
    const cat = mapEquipmentTypeToCategory(eq)
    if (cat) return cat
  }

  if (TRUCK_BRAND_OR_FORMULA_RE.test(t)) return 'gruzovye'

  const lower = t.toLowerCase()
  if (
    TRAILER_STRONG_RE.test(t) ||
    (lower.includes('полуприцеп') && !TRUCK_BRAND_OR_FORMULA_RE.test(t) && !/\bтягач\b/i.test(t))
  ) {
    return 'pricepy'
  }

  if (/\b(?:грузовик|грузовой\s+автомобиль|седельный|шасси\s+груз)\b/i.test(haystack)) {
    return 'gruzovye'
  }

  return null
}

/** Для source=vtb: подставляем выведенную категорию, иначе как в строке БД. */
export function resolveVtbListingCategory(
  title: string,
  bodyType: string | null | undefined,
  storedCategory: string | null | undefined,
): string | undefined {
  const inferred = inferVtbCategoryFromSignals(title, bodyType)
  if (inferred) return inferred
  if (storedCategory && String(storedCategory).trim()) return storedCategory.trim()
  return undefined
}
