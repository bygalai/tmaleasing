import type { Listing } from '../types/marketplace'

const MAX_DESCRIPTION_CHARS = 14_000

/** Нормализация для поиска: транслитерация, c/k→k, свёртка повторов символов. */
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
  шакман: ['shacman', 'shakman', 'shaanxi', 'shaanxi shacman'],
  shakman: ['shacman', 'shaanxi'],
  scania: ['scania', 'skania'],
  скания: ['scania', 'skania'],
  даф: ['daf'],
  daf: ['daf'],
  ман: ['man'],
  мерс: ['mercedes', 'mersedes'],
  мерседес: ['mercedes', 'mersedes'],
  volvo: ['volvo'],
  вольво: ['volvo'],
  iveco: ['iveco'],
  ивеко: ['iveco'],
  донфенг: ['dongfeng', 'dfm'],
  донгфенг: ['dongfeng', 'dfm'],
  dongfeng: ['dongfeng', 'dfm'],
  dfm: ['dongfeng', 'dfm'],
  ситрак: ['sitrak'],
  sitrak: ['sitrak'],
  бмв: ['bmw'],
  bmw: ['bmw'],
  нива: ['niva', 'lada niva', 'lada-niva', 'lada 4x4'],
  niva: ['niva', 'lada niva', 'lada-niva', 'lada 4x4'],
  киа: ['kia'],
  kia: ['kia'],
  черри: ['chery', 'cherry', 'cheryexeed'],
  чери: ['chery', 'cherry', 'cheryexeed'],
  chery: ['chery', 'cherry', 'cheryexeed'],
  geely: ['geely'],
  джили: ['geely'],
  haval: ['haval'],
  хавал: ['haval'],
  камри: ['camry', 'toyota camry'],
  camry: ['camry', 'toyota camry'],
  ауди: ['audi'],
  audi: ['audi'],
  тойота: ['toyota'],
  тайота: ['toyota'],
  toyota: ['toyota'],
  исузу: ['isuzu'],
  изудзу: ['isuzu'],
  isuzu: ['isuzu'],
  газель: ['gazelle', 'gazel', 'gaz'],
  газел: ['gazelle', 'gazel', 'gaz'],
  gazelle: ['gazelle', 'gazel', 'gaz'],
  джак: ['jac'],
  жак: ['jac'],
  jac: ['jac'],
  шевроле: ['chevrolet', 'shevrolet'],
  шевролле: ['chevrolet', 'shevrolet'],
  chevrolet: ['chevrolet', 'shevrolet'],
  инфинити: ['infiniti'],
  infiniti: ['infiniti'],
  ниссан: ['nissan'],
  nissan: ['nissan'],
  чанган: ['changan'],
  changan: ['changan'],
  лексус: ['lexus'],
  lexus: ['lexus'],
  лифан: ['lifan'],
  lifan: ['lifan'],
  солярис: ['solaris', 'hyundai solaris'],
  solaris: ['solaris', 'hyundai solaris'],
  омода: ['omoda'],
  omoda: ['omoda'],
  хово: ['howo', 'cnhtc'],
  howo: ['howo', 'cnhtc'],
  тонли: ['tonly', 'tonly truck'],
  tonly: ['tonly', 'tonly truck'],
  форд: ['ford'],
  ford: ['ford'],
  лонкинг: ['lonking'],
  lonking: ['lonking'],
  шитц: ['shacman', 'shakman', 'sitrak'],
  сани: ['sany'],
  sany: ['sany'],
  шанмон: ['shacman', 'shakman', 'sitrak'],
}

/**
 * Семантические группы: любой токен запроса из группы сопоставляется,
 * если в тексте лота встречается любой нормализованный вариант из группы.
 * Покрывает цвета, типичные оттенки и частые обозначения в объявлениях.
 */
const RAW_SEMANTIC_GROUPS: string[][] = [
  [
    'серый',
    'серого',
    'сером',
    'серую',
    'серые',
    'серебристый',
    'серебристая',
    'серебро',
    'серебрист',
    'графит',
    'графитовый',
    'металлик',
    'металик',
    'асфальт',
    'тёмно-серый',
    'темно-серый',
    'стальной',
    'gray',
    'grey',
    'silver',
    'graphite',
    'gunmetal',
    'steel',
    'anthracite',
  ],
  [
    'белый',
    'белого',
    'белая',
    'белые',
    'белоснежный',
    'белоснежная',
    'white',
    'pearl',
    'перламутр',
    'перламутровый',
    'молочный',
  ],
  [
    'чёрный',
    'черный',
    'чёрного',
    'черного',
    'чёрная',
    'черная',
    'чёрные',
    'черные',
    'black',
    'чернильный',
    'космос',
  ],
  [
    'красный',
    'красного',
    'красная',
    'бордовый',
    'бордо',
    'вишнёвый',
    'вишневый',
    'red',
    'maroon',
    'cherry',
  ],
  [
    'синий',
    'синего',
    'синяя',
    'голубой',
    'лазурный',
    'синеватый',
    'blue',
    'navy',
    'azure',
  ],
  [
    'зелёный',
    'зеленый',
    'зелёного',
    'зеленого',
    'изумрудный',
    'оливковый',
    'хаки',
    'green',
    'khaki',
    'olive',
  ],
  [
    'коричневый',
    'коричневого',
    'коричневая',
    'бежевый',
    'беж',
    'песочный',
    'капучино',
    'brown',
    'beige',
    'tan',
    'sand',
  ],
  [
    'жёлтый',
    'желтый',
    'золотой',
    'оранжевый',
    'песочно-жёлтый',
    'yellow',
    'gold',
    'orange',
  ],
  [
    'фиолетовый',
    'пурпурный',
    'фиолет',
    'purple',
    'violet',
    'plum',
  ],
]

function buildNormalizedGroups(raw: string[][]): string[][] {
  return raw.map((words) => {
    const set = new Set<string>()
    for (const w of words) {
      const n = normalizeForSearch(w)
      if (n.length >= 2) set.add(n)
    }
    return [...set]
  })
}

const SEMANTIC_GROUPS = buildNormalizedGroups(RAW_SEMANTIC_GROUPS)

/**
 * Отдельные группы на каждый ключ BRAND_SYNONYMS (без слияния пересечений),
 * иначе «shacman» и «sitrak» оказывались в одном OR и путали выдачу.
 */
const BRAND_GROUPS: string[][] = (() => {
  const groups: string[][] = []
  for (const [key, syns] of Object.entries(BRAND_SYNONYMS)) {
    const set = new Set<string>()
    const kn = normalizeForSearch(key)
    if (kn.length >= 2) set.add(kn)
    for (const s of syns) {
      const sn = normalizeForSearch(s)
      if (sn.length >= 2) set.add(sn)
    }
    if (set.size) groups.push([...set])
  }
  return groups
})()

const STOPWORDS_NORMALIZED = new Set(
  ['i', 'v', 'na', 's', 'po', 'dlja', 'ili', 'a', 'the', 'and', 'to', 'ot', 'do'].map((w) =>
    normalizeForSearch(w),
  ),
)

function findGroupContainingToken(token: string, groups: string[][]): string[] | null {
  if (token.length < 2) return null
  for (const members of groups) {
    const hit = members.some(
      (m) =>
        m === token ||
        (token.length >= 3 && (m.startsWith(token) || token.startsWith(m))) ||
        (token.length >= 4 && m.includes(token)) ||
        (m.length >= 4 && token.includes(m)),
    )
    if (hit) return members
  }
  return null
}

function haystackMatchesAnyMember(haystack: string, members: string[]): boolean {
  for (const m of members) {
    if (m.length < 2) continue
    if (haystack.includes(m)) return true
  }
  return false
}

/**
 * Собирает максимально полный текст для поиска: заголовок, подзаголовок,
 * структурированное описание, марка и поля карточки — чтобы запрос находил лоты,
 * даже если характеристики продублированы только в описании или только в title.
 */
export function buildNormalizedHaystack(listing: Listing): string {
  const desc = listing.description || ''
  const clipped =
    desc.length > MAX_DESCRIPTION_CHARS ? desc.slice(0, MAX_DESCRIPTION_CHARS) : desc
  const parts = [
    listing.brand,
    listing.title,
    listing.subtitle,
    clipped,
    listing.bodyType,
    listing.drivetrain,
    listing.location,
    listing.category,
    listing.source,
    listing.year != null ? String(listing.year) : '',
  ]
  return normalizeForSearch(parts.filter(Boolean).join(' \n '))
}

/** Строка для сопоставления с запросом: из кэша лота или расчёт на лету (моки / старые данные). */
export function getListingSearchHaystack(listing: Listing): string {
  const cached = listing.searchHaystackNormalized
  if (typeof cached === 'string' && cached.length > 0) return cached
  return buildNormalizedHaystack(listing)
}

/**
 * Дозаполняет `searchHaystackNormalized` у лотов без поля (например, прочитанных из старого localStorage).
 * Возвращает исходный массив, если менять ничего не нужно.
 */
export function ensureListingsSearchHaystack(items: Listing[]): Listing[] {
  let changed = false
  const out = items.map((item) => {
    if (item.searchHaystackNormalized != null && item.searchHaystackNormalized.length > 0) {
      return item
    }
    changed = true
    return {
      ...item,
      searchHaystackNormalized: buildNormalizedHaystack(item),
    }
  })
  return changed ? out : items
}

function tokenMatchesHaystack(token: string, haystack: string, hayWords: string[]): boolean {
  if (token.length < 2) return false

  if (token.length >= 5 && haystack.includes(token)) return true

  if (hayWords.includes(token)) return true
  if (token.length >= 3 && hayWords.some((w) => w.startsWith(token))) return true

  const brandGroup = findGroupContainingToken(token, BRAND_GROUPS)
  if (brandGroup && haystackMatchesAnyMember(haystack, brandGroup)) return true

  const colorGroup = findGroupContainingToken(token, SEMANTIC_GROUPS)
  if (colorGroup && haystackMatchesAnyMember(haystack, colorGroup)) return true

  if (token.length >= 4 && haystack.includes(token)) return true

  return false
}

function expandQueryWithBrandSynonyms(rawQuery: string, normalizedQuery: string): string[] {
  const variants = new Set<string>()
  variants.add(normalizedQuery)
  const rawLower = rawQuery.toLowerCase()

  for (const [key, synonyms] of Object.entries(BRAND_SYNONYMS)) {
    if (!rawLower.includes(key)) continue
    for (const synonym of synonyms) {
      const expanded = normalizeForSearch(rawLower.split(key).join(synonym))
      if (expanded) variants.add(expanded)
    }
  }
  return [...variants]
}

function significantTokens(normalizedQuery: string): string[] {
  const tokens = normalizedQuery.split(' ').filter((t) => t.length > 0)
  const filtered = tokens.filter((t) => !STOPWORDS_NORMALIZED.has(t) || tokens.length <= 2)
  return filtered.length > 0 ? filtered : tokens
}

/**
 * Поиск по лоту: полный текст, пословное AND по значимым токенам,
 * синонимы брендов и семантические группы (цвет и т.д.).
 */
export function matchesSearch(listing: Listing, rawQuery: string): boolean {
  const haystack = getListingSearchHaystack(listing)
  const hayWords = haystack.split(' ').filter(Boolean)
  const normalizedQuery = normalizeForSearch(rawQuery)
  if (!normalizedQuery) return true

  if (haystack.includes(normalizedQuery)) return true

  const queryVariants = expandQueryWithBrandSynonyms(rawQuery, normalizedQuery)
  for (const qv of queryVariants) {
    if (haystack.includes(qv)) return true
    const words = significantTokens(qv)
    if (words.length > 1 && words.every((w) => tokenMatchesHaystack(w, haystack, hayWords))) return true
  }

  const words = significantTokens(normalizedQuery)
  if (words.length === 0) return true
  if (words.every((w) => tokenMatchesHaystack(w, haystack, hayWords))) return true

  return false
}

export const DEFAULT_SUGGESTIONS_BY_CATEGORY: Record<string, string[]> = {
  legkovye: ['Lada', 'Toyota', 'Camry', 'KIA', 'Haval'],
  gruzovye: ['Shacman', 'Sitrak', 'Scania', 'Howo', 'MAN'],
  speztechnika: ['Lonking', 'Sany'],
  pricepy: ['Полуприцеп', 'Прицеп'],
  default: ['Shacman', 'Sitrak', 'Scania', 'Lada', 'Toyota'],
}
