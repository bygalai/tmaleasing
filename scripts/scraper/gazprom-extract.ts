/**
 * Извлечение данных из HTML карточки Газпром Автолизинг.
 * Вынесено в отдельный модуль для запуска в worker thread — гарантированный kill при зависании.
 */

const GAZPROM_BASE_URL = 'https://autogpbl.ru'
const ALLOWED_DOMAIN = 'autogpbl.ru'
const DETAIL_PATH_REGEX = /^\/avtomobili-i-tekhnika-s-probegom\/[^/]+\/[^/]+\/\d+\/?$/

const BAD_IMAGE_SUBSTRINGS = [
  'logo', 'favicon', 'sprite', 'icon', 'apple-touch-icon', 'button', 'banner',
  'cookie', 'telegram', 'yandex', 'captcha', '1x1', 'pixel',
]

const TITLE_MIN_LEN = 4
const TITLE_MAX_LEN = 90

const JUNK_INDICATORS = [
  /\bкод\b/i, /\bскрипт/i, /\bдолжен\b/i, /загрузк/i, /\bметрик/i,
  /\bпользователь\b/i, /\bфоллбэк\b/i, /\s--\s/, /\|\s*[а-яё]/i,
  /для\s+юридических\s+лиц/i, /с\s+пробегом\s+в\s+лизинг\s+для/i, /лизинг\s+для\s+юр/i,
  /с\s+экономией\s+средств/i, /оформить\s+заявку/i, /оставить\s+заявку/i,
  /купить\s+на\s+выгодных/i, /ежемесячным\s+платежом/i, /при\s+полной\s+загрузке/i,
  /подключаем\s+метрику/i, /яндекс[.\s]*метрика/i, /google\s+analytics/i,
]

const TITLE_BLOCKLIST = new Set([
  'каталог', 'газпромбанк', 'автолизинг', 'лизинг', 'с пробегом',
  'автомобили с пробегом', 'автомобили и техника с пробегом',
])

const CITY_BLOCKLIST = new Set([
  'оборудование', 'недвижимость', 'подвижной состав', 'объем',
])

function normalizeNumber(input: string | null | undefined): number | null {
  if (!input) return null
  const digits = String(input).replace(/[\s\u00A0]/g, '').replace(/[^\d]/g, '')
  if (!digits) return null
  const parsed = Number(digits)
  return Number.isFinite(parsed) ? parsed : null
}

function parseYear(input: string | null | undefined): number | null {
  if (!input) return null
  const yearMatch = String(input).match(/\b(19\d{2}|20\d{2})\b/)
  if (!yearMatch) return null
  const year = Number(yearMatch[1])
  if (!Number.isFinite(year) || year < 1990 || year > 2030) return null
  return year
}

function isBadImageCandidate(value: string | null | undefined): boolean {
  if (!value) return true
  const lowered = String(value).trim().toLowerCase()
  if (!lowered || lowered.startsWith('data:') || lowered.endsWith('.svg')) return true
  if (BAD_IMAGE_SUBSTRINGS.some((part) => lowered.includes(part))) return true
  return false
}

function pickBestImageCandidate(candidates: Array<string | null | undefined>): string | null {
  const urls = candidates
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0 && !isBadImageCandidate(v))
  if (urls.length === 0) return null
  const score = (url: string): number => {
    const lowered = url.toLowerCase()
    let points = 0
    if (/\.(jpe?g|png|webp)(\?|#|$)/i.test(lowered)) points += 5
    if (lowered.includes('/upload/') || lowered.includes('/images/') || lowered.includes('/media/')) points += 3
    if (lowered.includes('/img/')) points -= 1
    return points
  }
  urls.sort((a, b) => score(b) - score(a))
  return urls[0]
}

function looksLikeVehicleTitle(value: string | null | undefined, brandFromUrl?: string | null): boolean {
  if (!value) return false
  const n = value.replace(/\s+/g, ' ').trim()
  if (n.length < TITLE_MIN_LEN || n.length > TITLE_MAX_LEN) return false
  if (TITLE_BLOCKLIST.has(n.toLowerCase())) return false
  if (JUNK_INDICATORS.some((re) => re.test(n))) return false
  if (!/[A-Za-z0-9]/.test(n)) return false
  if (brandFromUrl && !new RegExp(brandFromUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(n)) return false
  return true
}

function isPlausibleCity(value: string | null | undefined): boolean {
  if (!value) return false
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2 || cleaned.length > 50) return false
  if (/\d{5,}/.test(cleaned)) return false
  if (CITY_BLOCKLIST.has(cleaned.toLowerCase())) return false
  return true
}

function getBrandModelFromDetailUrl(detailUrl: string): { brand: string; model: string } | null {
  try {
    const path = new URL(detailUrl, GAZPROM_BASE_URL).pathname
    const parts = path.split('/').filter(Boolean)
    if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1] ?? '')) {
      const model = parts[parts.length - 2] ?? ''
      const brand = parts[parts.length - 3] ?? ''
      if (brand && model) return { brand, model }
    }
  } catch { /* ignore */ }
  return null
}

function extractTitle(html: string, detailUrl: string): string | null {
  const brandModel = getBrandModelFromDetailUrl(detailUrl)
  const urlFallback = brandModel
    ? `${brandModel.brand.charAt(0).toUpperCase() + brandModel.brand.slice(1).toLowerCase()} ${brandModel.model.charAt(0).toUpperCase() + brandModel.model.slice(1).toUpperCase()}`
    : null
  const brandCap = brandModel ? brandModel.brand.charAt(0).toUpperCase() + brandModel.brand.slice(1).toLowerCase() : null
  const modelCap = brandModel ? brandModel.model.charAt(0).toUpperCase() + brandModel.model.slice(1).toUpperCase() : null

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const h1Raw = h1Match?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? null
  const fromH1 = h1Raw?.replace(/\s*с пробегом в лизинг[\s\S]*$/i, '').replace(/\s*в лизинг[\s\S]*$/i, '').trim() ?? null
  if (fromH1 && brandCap && looksLikeVehicleTitle(fromH1, brandCap)) return fromH1

  if (brandCap && modelCap) {
    const re = new RegExp(`(${brandCap.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+[A-Za-zА-Яа-я0-9\\s\\-\\.]{2,90})`, 'i')
    const bodySnippet = html.slice(0, 80000)
    let best: string | null = null
    let match: RegExpExecArray | null
    while ((match = re.exec(bodySnippet)) !== null) {
      const candidate = match[1].replace(/\s+/g, ' ').trim()
      if (looksLikeVehicleTitle(candidate, brandCap) && (!best || candidate.length > (best?.length ?? 0))) best = candidate
    }
    if (best) return best
    const ogTitle =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)[^>]+property=["']og:title["'][^>]*>/i)?.[1]
    if (ogTitle) {
      const cleaned = ogTitle
        .replace(/\s*[|\|]\s*.*$/i, '')
        .replace(/\s*с пробегом в лизинг.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (looksLikeVehicleTitle(cleaned, brandCap)) return cleaned
    }
    return `${brandCap} ${modelCap}`
  }
  return urlFallback
}

export type ExtractedDetail = {
  title: string | null
  price: number | null
  originalPrice: number | null
  mileage: number | null
  year: number | null
  imageUrl: string | null
  city: string | null
  bodyColor: string | null
  bodyType: string | null
  engine: string | null
  drivetrain: string | null
  transmission: string | null
}

export function extractDetailFromHtml(html: string, pageUrl: string): ExtractedDetail {
  const plainText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const title = extractTitle(html, pageUrl)

  const EXCLUDE_SNIPPET =
    /мес|месяц|аванс|платеж\s+от|ежемесячный\s+платеж|экономия\s+до|налоговая\s+экономия|экономия\s+по\s+налогу|ндс|на\s+прибыль|сумма\s+договора|полная\s+стоимость\s*—|общая\s+экономия/
  const priceRegex = /(\d[\d\s\u00A0.]{2,})\s*(?:<\/[^>]+>[\s\S]{0,30})?(?:₽|&#8381;|руб\.?)/gi
  const MIN_PRICE = 500_000
  const MAX_PRICE = 100_000_000
  const MAX_ORIGINAL_TO_PRICE_RATIO = 1.5

  function collectPricesFromSegment(segment: string, skipExclude = false): number[] {
    const out: number[] = []
    let m: RegExpExecArray | null
    priceRegex.lastIndex = 0
    while ((m = priceRegex.exec(segment)) !== null) {
      const num = normalizeNumber(m[1])
      if (num == null || num < MIN_PRICE || num > MAX_PRICE) continue
      if (!skipExclude) {
        const snippet = segment.slice(Math.max(0, m.index - 120), m.index + (m[0].length + 80)).toLowerCase()
        if (EXCLUDE_SNIPPET.test(snippet)) continue
      }
      out.push(num)
    }
    return out
  }

  function collectPricesWithPosition(segment: string, skipExclude = false): { num: number; pos: number }[] {
    const out: { num: number; pos: number }[] = []
    let m: RegExpExecArray | null
    priceRegex.lastIndex = 0
    while ((m = priceRegex.exec(segment)) !== null) {
      const num = normalizeNumber(m[1])
      if (num == null || num < MIN_PRICE || num > MAX_PRICE) continue
      if (!skipExclude) {
        const snippet = segment.slice(Math.max(0, m.index - 120), m.index + (m[0].length + 80)).toLowerCase()
        if (EXCLUDE_SNIPPET.test(snippet)) continue
      }
      out.push({ num, pos: m.index })
    }
    return out
  }

  let price: number | null = null
  let originalPrice: number | null = null
  const h1Close = html.search(/<\/h1>/i)
  const MAIN_BLOCK_MIN_LEN = 2500

  if (h1Close !== -1) {
    const candidates = [
      h1Close + 3500,
      html.length,
      html.indexOf('Выберите условия', h1Close),
      html.indexOf('технические характеристики', h1Close),
      html.indexOf('Похожие предложения', h1Close),
    ].filter((p) => p >= 0)
    let mainBlockEnd = Math.min(...candidates)
    if (mainBlockEnd - h1Close < MAIN_BLOCK_MIN_LEN) mainBlockEnd = h1Close + MAIN_BLOCK_MIN_LEN
    const mainBlock = html.slice(h1Close, Math.min(mainBlockEnd, html.length))
    const costLabel = mainBlock.search(/Стоимость|стоимость/i)
    if (costLabel !== -1) {
      const afterCost = mainBlock.slice(costLabel, costLabel + 450)
      let byPos = collectPricesWithPosition(afterCost)
      if (byPos.length === 0) byPos = collectPricesWithPosition(afterCost, true)
      byPos.sort((a, b) => a.pos - b.pos)
      if (byPos.length > 0) {
        const first = byPos[0].num
        const second = byPos[1]?.num
        price = first
        if (second != null && second > first && second <= first * MAX_ORIGINAL_TO_PRICE_RATIO) originalPrice = second
        else if (second != null && second < first && first <= second * MAX_ORIGINAL_TO_PRICE_RATIO) {
          price = second
          originalPrice = first
        }
      }
    }
    if (price == null) {
      const headOfBlock = mainBlock.slice(0, 900)
      let withPos = collectPricesWithPosition(headOfBlock)
      if (withPos.length === 0) withPos = collectPricesWithPosition(headOfBlock, true)
      if (withPos.length > 0) {
        withPos.sort((a, b) => a.pos - b.pos)
        price = withPos[0].num
        if (withPos.length >= 2) {
          const second = withPos[1].num
          if (second > price && second <= price * MAX_ORIGINAL_TO_PRICE_RATIO) originalPrice = second
          else if (second < price && price <= second * MAX_ORIGINAL_TO_PRICE_RATIO) {
            originalPrice = price
            price = second
          }
        }
      }
    }
    if (price == null) {
      let withPos = collectPricesWithPosition(mainBlock)
      if (withPos.length === 0) withPos = collectPricesWithPosition(mainBlock, true)
      if (withPos.length > 0) {
        withPos.sort((a, b) => a.pos - b.pos)
        price = withPos[0].num
        if (withPos.length >= 2) {
          const second = withPos[1].num
          if (second > price && second <= price * MAX_ORIGINAL_TO_PRICE_RATIO) originalPrice = second
        }
      }
    }
  }

  if (price == null) {
    let plausiblePrices = collectPricesFromSegment(html.slice(0, 30000))
    if (plausiblePrices.length === 0) plausiblePrices = collectPricesFromSegment(html.slice(0, 30000), true)
    if (plausiblePrices.length > 0) {
      price = Math.min(...plausiblePrices)
      if (plausiblePrices.length >= 2) {
        const max = Math.max(...plausiblePrices)
        const min = Math.min(...plausiblePrices)
        if (max > min && max <= min * MAX_ORIGINAL_TO_PRICE_RATIO) originalPrice = max
      }
    }
  }
  if (price == null) {
    const withPos = collectPricesWithPosition(html)
    if (withPos.length > 0) {
      withPos.sort((a, b) => a.pos - b.pos)
      price = withPos[0].num
      if (withPos.length >= 2) {
        const second = withPos[1].num
        if (second > price && second <= price * MAX_ORIGINAL_TO_PRICE_RATIO) originalPrice = second
      }
    }
  }

  const h1CloseForSpecs = html.search(/<\/h1>/i)
  const mainBlockEndForSpecs =
    h1CloseForSpecs !== -1
      ? Math.min(
          html.length,
          ...[
            h1CloseForSpecs + 8000,
            html.indexOf('Выберите условия', h1CloseForSpecs),
            html.indexOf('Похожие предложения', h1CloseForSpecs),
          ]
            .filter((p) => p >= 0)
            .concat(html.length)
        )
      : 0
  const specsBlock =
    h1CloseForSpecs !== -1 && mainBlockEndForSpecs > h1CloseForSpecs
      ? html
          .slice(h1CloseForSpecs, mainBlockEndForSpecs)
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : ''
  const specsText = specsBlock.length > 500 ? specsBlock : plainText

  const mileageNotSpecified = /пробег\s+не\s+указан/i.test(plainText)
  const mileageText = mileageNotSpecified
    ? null
    : plainText.match(/(\d[\d\s\u00A0]{2,})\s*(?:км|km)/i)?.[1] ??
      html.match(/Пробег\s*<\/[^>]+>[\s\S]{0,80}?(\d[\d\s\u00A0]+)/i)?.[1] ??
      plainText.match(/(\d[\d\s\u00A0]+)\s*(?:м\.?\s*ч\.?|моточасов?)/i)?.[1] ??
      html.match(/Наработка\s*<\/[^>]+>[\s\S]{0,80}?(\d[\d\s\u00A0]+)/i)?.[1] ??
      null

  const yearText =
    plainText.match(/\b(20\d{2}|19\d{2})\s*г\.?/i)?.[1] ??
    html.match(/Год выпуска\s*<\/[^>]+>[\s\S]{0,40}?(\d{4})/i)?.[1] ??
    null

  const cityMatch =
    specsText.match(/Город\s*[:\-]?\s*([А-Яа-яЁёA-Za-z\-\s]{2,60})/i)?.[1] ??
    html.match(/Город\s*<\/[^>]+>[\s\S]{0,80}?([А-Яа-яЁёA-Za-z\-\s]{2,60})/i)?.[1] ??
    null
  let city = cityMatch ? cityMatch.replace(/\s+/g, ' ').trim() : null
  if (city) city = city.replace(/\s+Тип\s+ПТС(?:\/\s*ПСМ)?\s*$/i, '').trim() || null
  if (!city) {
    const cityFromPlain =
      plainText.match(/г\.\s*([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2})/)?.[1]?.replace(/\s+/g, ' ').trim() ?? null
    if (cityFromPlain) city = cityFromPlain
  }
  if (city && /ключ|комплект|обременен|птс|псм|объем\s*двигателя/i.test(city)) city = null
  if (city && !isPlausibleCity(city)) city = null

  const colorMatch =
    specsText.match(/Цвет\s*[\s:]*([А-Яа-яЁёA-Za-z\s\-]{2,30}?)(?:\s|$|\d|Кузов|Коробка|Объем)/i)?.[1]?.trim() ??
    html.match(/Цвет\s*<\/[^>]+>[\s\S]{0,60}?([А-Яа-яЁёA-Za-z\s\-]{2,30})/i)?.[1]?.trim() ??
    null
  let bodyColor = colorMatch || null
  if (bodyColor && /ключ|комплект|количество/i.test(bodyColor)) bodyColor = null
  if (bodyColor && /^(мусоровоз|седан|внедорожник|грузовой|бортовой|фургон|пикап|универсал|хэтчбек|автобус|автокран|бульдозер|экскаватор)/i.test(bodyColor)) bodyColor = null

  const bodyTypeMatch =
    specsText.match(/Кузов\s*[\s:]*([А-Яа-яЁёA-Za-z0-9\s\-\(\)\/]{2,50}?)(?:\s|$|\d|Количество|Цвет|Объем)/i)?.[1]?.trim() ??
    html.match(/Кузов\s*<\/[^>]+>[\s\S]{0,80}?([А-Яа-яЁёA-Za-z0-9\s\-\(\)\/]{2,50})/i)?.[1]?.trim() ??
    null
  let bodyType = bodyTypeMatch || null
  if (bodyType && /ключ|комплект|количество/i.test(bodyType)) bodyType = null

  const engineMatch = specsText.match(/Объем\s+двигателя\s*[\s:]*([\d.,]+\s*(?:л\.?)?)/i)?.[1]?.trim()
  const engineVolNum = engineMatch ? parseFloat(engineMatch.replace(/[^\d.,]/g, '').replace(',', '.')) : NaN
  const engineVolume =
    engineMatch && Number.isFinite(engineVolNum) && engineVolNum >= 0.5 && engineVolNum <= 12
      ? (engineMatch.includes('л') ? engineMatch : `${engineMatch} л`).trim()
      : null

  const fuelMatch =
    specsText.match(/Тип\s+топлива\s*[\s:]*([А-Яа-яЁёA-Za-z\s\-]{3,30}?)(?:\s|$|\d|Кузов|Объем)/i)?.[1]?.trim() ??
    specsText.match(/Топливо\s*[\s:]*([А-Яа-яЁёA-Za-z\s\-]{3,30}?)(?:\s|$|\d|Кузов|Объем)/i)?.[1]?.trim() ??
    specsText.match(/Двигатель\s*[\s:]*([А-Яа-яЁёA-Za-z0-9\s\-,.]{3,50}?)(?:\s|$|Кузов|Объем)/i)?.[1]?.trim() ??
    null
  const fuelNormalized = fuelMatch
    ? (() => {
        const f = fuelMatch.toLowerCase()
        if (/бензин|tsi|tfsi|fsi|mpi/i.test(f)) return 'Бензин'
        if (/дизел|tdi|cdi|dci|tdci|d4d|multijet/i.test(f)) return 'Дизель'
        if (/электро|электромобил|ev|phev|recharge/i.test(f)) return 'Электро'
        if (/гибрид|hybrid|plug.in|phev/i.test(f)) return 'Гибрид'
        if (/газ|метан|пропан|lpg|cng/i.test(f)) return 'Газ'
        return fuelMatch.replace(/\s+/g, ' ').trim()
      })()
    : null

  const engine =
    [engineVolume, fuelNormalized].filter(Boolean).length > 0
      ? [engineVolume, fuelNormalized].filter(Boolean).join(', ')
      : null

  const wheelFormulaMatch = plainText.match(/Кол[её]сная\s+формула\s*[\s:]*(\d+[xхX]\d+)/i)?.[1]?.trim()
  const driveMatch =
    !wheelFormulaMatch &&
    (specsText.match(/Привод\s*[\s:]*([А-Яа-яЁёA-Za-z0-9\s\-]{2,30}?)(?:\s|$|Кузов|Коробка|Объем)/i)?.[1]?.trim() ?? null)
  const drivetrain = (wheelFormulaMatch || driveMatch)?.replace(/\s+/g, ' ').trim() || null

  const transmissionMatch =
    specsText.match(/Коробка\s+передач\s*[\s:]*([А-Яа-яЁёA-Za-z0-9\s\-]{2,40}?)(?:\s|$|\d|Кузов|Привод|Объем)/i)?.[1]?.trim() ??
    specsText.match(/КПП\s*[\s:]*([А-Яа-яЁёA-Za-z0-9\s\-]{2,40}?)(?:\s|$|\d|Кузов|Привод|Объем)/i)?.[1]?.trim() ??
    null
  const transmission = transmissionMatch?.replace(/\s+/g, ' ').trim() || null

  const ogImage =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i)?.[1] ??
    null
  const imgSrc =
    html.match(/<img[^>]+data-src=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1] ??
    null
  const imageUrl = pickBestImageCandidate([ogImage, imgSrc].map((v) => v?.replace(/&amp;/g, '&')))

  return {
    title,
    price,
    originalPrice: originalPrice ?? null,
    mileage: normalizeNumber(mileageText),
    year: parseYear(yearText ?? undefined),
    imageUrl,
    city: city ?? null,
    bodyColor: bodyColor || null,
    bodyType: bodyType || null,
    engine: engine || null,
    drivetrain: drivetrain || null,
    transmission: transmission || null,
  }
}
