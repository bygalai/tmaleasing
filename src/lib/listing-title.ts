/**
 * Единый заголовок лота в ленте и на странице: без дублей характеристик из парсера, в верхнем регистре.
 * Инференс body_type / поиск по сырому title делаются отдельно (до вызова), здесь только отображение.
 */

/** Скобки с типичным мусором двигателя / объёма / мощности (часто Газпром и др.). */
const PAREN_ENGINE_RE =
  /\([^)]*(?:дизельн|бензинов|гибридн|электрич|турбир|турбо|\d+[.,]\d+\s*л\b|\d+\s*л\.?\s*с|л\.?\s*с\.?|квт\.?|л\/100|объё?м|цилиндр|мощност|куб\.?\s*см|рабочий\s+об)[^)]*\)/gi

/** Фразы типа техники, которые дублируют подзаголовок — убираем из названия (от длинных к коротким). */
const INLINE_TYPE_PHRASES: string[] = [
  'Автотопливозаправщик',
  'Автобетоносмеситель',
  'Автобетононасос',
  'Экскаватор-погрузчик',
  'Фронтальный погрузчик',
  'Бортовая платформа',
  'Изотермический фургон',
  'Тентованный фургон',
  'Топливозаправщик',
  'Седельный тягач',
  'Экскаватор погрузчик',
  'Бортовой с КМУ',
  'Бортовой с ГП',
  'Рефрижератор',
  'Контейнеровоз',
  'Мусоровоз',
  'Самосвал',
  'Комбайн',
  'Каток',
  'Грейдер',
  'Автокран',
  'Эвакуатор',
  'Бульдозер',
  'Экскаватор',
  'Погрузчик',
  'Ричтрак',
  'Фургон',
  'Цистерна',
  'Бортовой',
  'Тягач',
  'Трактор',
  'Прицеп',
  'Полуприцеп',
  'Внедорожник',
  'Кроссовер',
  'Минивэн',
  'Универсал',
  'Лифтбэк',
  'Хэтчбек',
  'Седан',
  'Купе',
  'Пикап',
].sort((a, b) => b.length - a.length)

function stripPipeSuffix(text: string): string {
  const pipe = text.indexOf('|')
  if (pipe >= 0) return text.slice(0, pipe).trim()
  return text
}

function stripParentheticalSpecs(text: string): string {
  let out = text
  let prev = ''
  while (out !== prev) {
    prev = out
    out = out.replace(PAREN_ENGINE_RE, '')
  }
  const openIdx = out.indexOf('(')
  if (openIdx >= 0 && !out.slice(openIdx).includes(')')) {
    out = out.slice(0, openIdx).trim()
  }
  return out.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim()
}

function stripWheelFormulaGaps(text: string): string {
  return text
    .replace(/^\d+[xхX]\d+\s+/i, '')
    .replace(/\s+\d+[xхX]\d+\s+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripBodyTypeDuplicate(text: string, bodyType: string): string {
  const trimmed = bodyType.trim()
  if (trimmed.length < 4) return text
  const esc = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\s*${esc}\\s*`, 'gi')
  return text.replace(re, ' ').replace(/\s+/g, ' ').trim()
}

function stripInlineTypePhrases(text: string): string {
  let out = text
  for (const phrase of INLINE_TYPE_PHRASES) {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`\\s*${esc}\\s*`, 'gi'), ' ').replace(/\s+/g, ' ').trim()
  }
  return out
}

/**
 * Нормализует заголовок для UI: без технических вставок, единый верхний регистр.
 */
export function formatListingDisplayTitle(
  rawTitle: string,
  resolvedBodyType: string | null | undefined,
): string {
  let t = (rawTitle ?? '').replace(/\s+/g, ' ').trim()
  const rawFallback = t
  if (!t) return 'ЛОТ'

  t = stripPipeSuffix(t)
  t = stripParentheticalSpecs(t)
  t = stripWheelFormulaGaps(t)

  if (resolvedBodyType?.trim() && resolvedBodyType.trim().length >= 4) {
    t = stripBodyTypeDuplicate(t, resolvedBodyType)
  }
  t = stripInlineTypePhrases(t)

  t = t.replace(/[,;.]+$/g, '').replace(/\s*[•·]+$/g, '').trim()

  if (!t) {
    return rawFallback.toLocaleUpperCase('ru-RU')
  }

  return t.toLocaleUpperCase('ru-RU')
}
