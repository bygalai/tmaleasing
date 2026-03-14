import type { Listing } from '../types/marketplace'

export function normalizeForSearch(value: string | undefined | null): string {
  if (!value) return ''
  const lower = value.toLowerCase()

  const cyrToLat: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'i',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'c',
    ч: 'ch',
    ш: 'sh',
    щ: 'sh',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  }

  let out = ''
  for (const ch of lower) {
    if (cyrToLat[ch] !== undefined) {
      out += cyrToLat[ch]
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch
    } else {
      out += ' '
    }
  }

  out = out.replace(/[ck]/g, 'k')
  out = out.replace(/(.)\1{2,}/g, '$1$1')

  return out.replace(/\s+/g, ' ').trim()
}

export const BRAND_SYNONYMS: Record<string, string[]> = {
  'шакман': ['shacman', 'shakman'],
  'shakman': ['shacman', 'shakman'],
  'scania': ['scania', 'skania'],
  'скания': ['scania', 'skania'],
  'даф': ['daf'],
  'daf': ['daf'],
  'ман': ['man'],
  'мерс': ['mercedes', 'mersedes'],
  'мерседес': ['mercedes', 'mersedes'],
  'volvo': ['volvo'],
  'вольво': ['volvo'],
  'iveco': ['iveco'],
  'ивеко': ['iveco'],
  'донфенг': ['dongfeng', 'dfm'],
  'донгфенг': ['dongfeng', 'dfm'],
  'dongfeng': ['dongfeng', 'dfm'],
  'dfm': ['dongfeng', 'dfm'],
  'ситрак': ['sitrak'],
  'sitrak': ['sitrak'],
  'бмв': ['bmw'],
  'bmw': ['bmw'],
  'нива': ['niva', 'lada niva', 'lada-niva', 'lada 4x4'],
  'niva': ['niva', 'lada niva', 'lada-niva', 'lada 4x4'],
  'киа': ['kia'],
  'kia': ['kia'],
  'черри': ['chery', 'cherry', 'cheryexeed'],
  'чери': ['chery', 'cherry', 'cheryexeed'],
  'chery': ['chery', 'cherry', 'cheryexeed'],
  'geely': ['geely'],
  'джили': ['geely'],
  'haval': ['haval'],
  'хавал': ['haval'],
  'камри': ['camry', 'toyota camry'],
  'camry': ['camry', 'toyota camry'],
  'ауди': ['audi'],
  'audi': ['audi'],
  'тойота': ['toyota'],
  'тайота': ['toyota'],
  'toyota': ['toyota'],
  'исузу': ['isuzu'],
  'изудзу': ['isuzu'],
  'isuzu': ['isuzu'],
  'газель': ['gazelle', 'gazel', 'gaz'],
  'газел': ['gazelle', 'gazel', 'gaz'],
  'gazelle': ['gazelle', 'gazel', 'gaz'],
  'джак': ['jac'],
  'жак': ['jac'],
  'jac': ['jac'],
  'шевроле': ['chevrolet', 'shevrolet'],
  'шевролле': ['chevrolet', 'shevrolet'],
  'chevrolet': ['chevrolet', 'shevrolet'],
  'инфинити': ['infiniti'],
  'infiniti': ['infiniti'],
  'ниссан': ['nissan'],
  'nissan': ['nissan'],
  'чанган': ['changan'],
  'changan': ['changan'],
  'лексус': ['lexus'],
  'lexus': ['lexus'],
  'лифан': ['lifan'],
  'lifan': ['lifan'],
  'солярис': ['solaris', 'hyundai solaris'],
  'solaris': ['solaris', 'hyundai solaris'],
  'омода': ['omoda'],
  'omoda': ['omoda'],
  'хово': ['howo', 'cnhtc'],
  'howo': ['howo', 'cnhtc'],
  'тонли': ['tonly', 'tonly truck'],
  'tonly': ['tonly', 'tonly truck'],
  'форд': ['ford'],
  'ford': ['ford'],
  'лонкинг': ['lonking'],
  'lonking': ['lonking'],
  'шитц': ['shacman', 'shakman', 'sitrak'],
  'сани': ['sany'],
  'sany': ['sany'],
  'шанмон': ['shacman', 'shakman', 'sitrak'],
}

export function matchesSearch(listing: Listing, rawQuery: string): boolean {
  const haystack = normalizeForSearch(
    [listing.title, listing.subtitle, listing.location].filter(Boolean).join(' '),
  )
  const normalizedQuery = normalizeForSearch(rawQuery)
  if (!normalizedQuery) return true

  // Точное вхождение подстроки
  if (haystack.includes(normalizedQuery)) return true

  // Пословный поиск: каждое слово запроса должно быть в haystack
  const queryWords = normalizedQuery.split(' ').filter((w) => w.length > 0)
  if (queryWords.length > 1 && queryWords.every((w) => haystack.includes(w))) return true

  // Синонимы бренда: подменяем бренд в запросе, проверяем ПОЛНЫЙ расширенный запрос
  const rawLower = rawQuery.toLowerCase()
  for (const [key, synonyms] of Object.entries(BRAND_SYNONYMS)) {
    if (!rawLower.includes(key)) continue
    for (const synonym of synonyms) {
      const expanded = normalizeForSearch(rawLower.replace(key, synonym))
      if (!expanded) continue
      if (haystack.includes(expanded)) return true
      const expandedWords = expanded.split(' ').filter((w) => w.length > 0)
      if (expandedWords.length > 1 && expandedWords.every((w) => haystack.includes(w))) return true
    }
  }

  return false
}

export const DEFAULT_SUGGESTIONS_BY_CATEGORY: Record<string, string[]> = {
  legkovye: ['Lada', 'Toyota', 'Camry', 'KIA', 'Haval'],
  gruzovye: ['Shacman', 'Sitrak', 'Scania', 'Howo', 'MAN'],
  speztechnika: ['Lonking', 'Sany'],
  pricepy: ['Полуприцеп', 'Прицеп'],
  default: ['Shacman', 'Sitrak', 'Scania', 'Lada', 'Toyota'],
}
