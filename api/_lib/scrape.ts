import { load } from 'cheerio'
import type { InternalListing, ProviderId } from './models.js'
import { PROVIDERS, type ProviderConfig } from './providers.js'
import {
  estimateMarket,
  FALLBACK_IMAGE,
  makeId,
  normalizeOptionalUrl,
  normalizeUrl,
  parseMileage,
  parsePrice,
  parseYear,
  pickText,
} from './parsing.js'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36'

export type ProviderSyncReport = {
  providerId: ProviderId
  providerName: string
  parserHint: string
  total: number
  fallbackCount: number
  status: 'ok' | 'fallback' | 'error'
  error?: string
}

export type CollectListingsOptions = {
  providers?: ProviderId[]
}

export type CollectListingsResult = {
  items: InternalListing[]
  report: ProviderSyncReport[]
}

function providerSubtitle(providerId: ProviderId): string {
  if (providerId === 'vtb') return 'Техника из портфеля лизинговой компании'
  if (providerId === 'europlan') return 'Техника и автомобили с прозрачной историей'
  if (providerId === 'ileasing') return 'Коммерческая техника с экспертной проверкой'
  if (providerId === 'alfaleasing') return 'Авто с пробегом и понятной стоимостью'
  return 'Техника с возможностью быстрого оформления'
}

function parseDiscount(text: string): number | undefined {
  const match = text.match(/скидк[а-я]*\s*(до)?\s*(\d{1,2})\s*%/i)
  if (!match) return undefined
  const value = Number(match[2])
  return Number.isFinite(value) ? value : undefined
}

const IMAGE_ATTRS = [
  'src',
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-preview',
  'data-img',
  'data-image',
  'data-url',
]

function firstSrcsetUrl(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined
  const urls = srcset
    .split(',')
    .map((part) => part.trim().split(' ')[0])
    .filter(Boolean)
  return urls.length > 0 ? urls[urls.length - 1] : undefined
}

function isRealImage(url: string | undefined): boolean {
  if (!url) return false
  if (url.includes('dummyimage.com')) return false
  if (/placeholder|no[-_ ]?photo|stub/i.test(url)) return false
  return true
}

function hasImageExtension(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|avif)(\?|#|$)/i.test(url)
}

function isProviderListingImage(provider: ProviderConfig, url: string): boolean {
  if (provider.id !== 'vtb') return true
  const normalized = url.toLowerCase()
  if (!normalized.includes('vtb-leasing.ru')) return false
  if (normalized.includes('/sprint.editor/')) return false
  if (normalized.includes('/local/templates/')) return false
  const allowedPath =
    normalized.includes('/upload/iblock/') || normalized.includes('/upload/resize_cache/iblock/')
  if (!allowedPath) return false
  if (!hasImageExtension(normalized)) return false
  return true
}

function normalizeImageList(
  provider: ProviderConfig,
  candidates: Array<string | undefined>,
  baseUrl: string,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const candidate of candidates) {
    const normalized = normalizeOptionalUrl(candidate, baseUrl)
    if (!isRealImage(normalized)) continue
    if (!normalized) continue
    if (!isProviderListingImage(provider, normalized)) continue
    const key = normalized.replace(/[?#].*$/, '').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

function extractImageCandidate(el: any, baseUrl: string): string | undefined {
  const primary = el.find('img, source').first()
  const directCandidate = IMAGE_ATTRS.map((attr) => primary.attr(attr)).find(Boolean)
  const directSrcset = firstSrcsetUrl(primary.attr('srcset') ?? primary.attr('data-srcset'))
  const styleMatch = (el.attr('style') ?? '').match(/url\((['"]?)(.+?)\1\)/i)
  const styleCandidate = styleMatch?.[2]
  const nestedBackgroundStyle = el.find('[style*="background"]').first().attr('style')
  const nestedStyleMatch = nestedBackgroundStyle?.match(/url\((['"]?)(.+?)\1\)/i)
  const nestedStyleCandidate = nestedStyleMatch?.[2]

  const candidate =
    directCandidate ??
    directSrcset ??
    styleCandidate ??
    nestedStyleCandidate ??
    firstSrcsetUrl(el.find('source[srcset]').first().attr('srcset')) ??
    IMAGE_ATTRS.map((attr) => el.find(`[${attr}]`).first().attr(attr)).find(Boolean)

  const normalized = normalizeOptionalUrl(candidate, baseUrl)
  return isRealImage(normalized) ? normalized : undefined
}

type JsonLdOffer = {
  price?: string | number
}

type JsonLdEntry = {
  name?: string
  model?: string
  offers?: JsonLdOffer
  price?: string | number
  url?: string
  image?: string | string[]
  description?: string
}

function parseFromJsonLd(provider: ProviderConfig, html: string): InternalListing[] {
  const $ = load(html)
  const output: InternalListing[] = []

  $('script[type="application/ld+json"]').each((_, node) => {
    const raw = $(node).html()
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      const items = (Array.isArray(parsed) ? parsed : [parsed]) as JsonLdEntry[]
      items.forEach((entry) => {
        const name = entry?.name ?? entry?.model
        const priceString = String(entry?.offers?.price ?? entry?.price ?? '')
        const priceRub = parsePrice(`${priceString} руб`) ?? parsePrice(priceString)
        if (!name || !priceRub) return

        const url = normalizeUrl(entry?.url ?? provider.url, provider.url)
        const image = normalizeOptionalUrl(
          Array.isArray(entry?.image) ? entry.image[0] : entry?.image,
          provider.url,
        )
        const description =
          typeof entry?.description === 'string' && entry.description.trim().length > 10
            ? entry.description.trim()
            : 'Позиция доступна для оперативной заявки и проверки документов.'

        output.push({
          id: makeId(provider.id, name, priceRub),
          title: name,
          subtitle: providerSubtitle(provider.id),
          priceRub,
          ...estimateMarket(priceRub),
          imageUrl: image || FALLBACK_IMAGE,
          imageUrls: image ? [image] : [],
          detailUrl: url,
          description,
          badges: ['in_stock', 'leasing'],
          source: {
            providerId: provider.id,
            providerName: provider.name,
            providerUrl: provider.url,
            listingUrl: url,
            parserHint: `${provider.parserHint}-jsonld`,
            fallback: false,
          },
        })
      })
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  })

  return output
}

function parseFromCards(provider: ProviderConfig, html: string): InternalListing[] {
  const $ = load(html)
  const output: InternalListing[] = []
  const seen = new Set<string>()
  const selectors = [...provider.selectors, '.card', '.item', '.catalog-item', 'li', 'article']

  for (const selector of selectors) {
    $(selector).each((_, node) => {
      const el = $(node)
      const text = el.text().replace(/\s+/g, ' ').trim()
      if (text.length < 20) return

      const title =
        pickText(
          el.find('h1,h2,h3,.title,.name,.car-title,[data-title]').first().text(),
          el.find('a').first().attr('title'),
        ) || undefined
      if (!title || title.length < 4) return

      const priceRub =
        parsePrice(
          pickText(
            el.find('.price,.cost,[class*="price"],[class*="cost"]').first().text(),
            text,
          ),
        ) ?? undefined
      if (!priceRub) return

      const link = normalizeUrl(el.find('a[href]').first().attr('href'), provider.url)
      const image = extractImageCandidate(el, provider.url)
      const year = parseYear(text)
      const mileageKm = parseMileage(text)
      const location = el
        .find('.city,.location,[class*="city"],[class*="location"]')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim()
      const discountPercent = parseDiscount(text)

      const uniqueKey = `${provider.id}:${title}:${priceRub}`
      if (seen.has(uniqueKey)) return
      seen.add(uniqueKey)

      output.push({
        id: makeId(provider.id, title, priceRub),
        title,
        subtitle:
          pickText(
            year ? `${year} г.` : undefined,
            mileageKm ? `${new Intl.NumberFormat('ru-RU').format(mileageKm)} км` : undefined,
            location || providerSubtitle(provider.id),
          ) || providerSubtitle(provider.id),
        priceRub,
        ...estimateMarket(priceRub),
        year,
        mileageKm,
        location: location || undefined,
        imageUrl: image ?? FALLBACK_IMAGE,
        imageUrls: image ? [image] : [],
        detailUrl: link,
        description:
          'Позиция автоматически собрана и доступна для заявки. Технические детали подтверждаются менеджером перед сделкой.',
        badges: discountPercent
          ? ['in_stock', 'leasing', 'discount']
          : ['in_stock', 'leasing'],
        discountPercent,
        source: {
          providerId: provider.id,
          providerName: provider.name,
          providerUrl: provider.url,
          listingUrl: link,
          parserHint: `${provider.parserHint}-cards`,
          fallback: false,
        },
      })
    })

    if (output.length >= 12) break
  }

  return output
}

function parseVtbMarketItems(provider: ProviderConfig, html: string): InternalListing[] {
  if (provider.id !== 'vtb') return []

  const $ = load(html)
  const output: InternalListing[] = []
  const seen = new Set<string>()

  $('.t-market-item').each((_, node) => {
    const el = $(node)
    const title = el.find('.t-market-auto-title a').first().text().replace(/\s+/g, ' ').trim()
    if (!title || title.length < 2) return

    const priceText = el.find('.t-market-auto-month-price').first().text().replace(/\s+/g, ' ').trim()
    const propsText = el.find('.t-market-auto-props').first().text().replace(/\s+/g, ' ').trim()
    const priceRub = parsePrice(priceText)
    if (!priceRub) return

    const linkRaw =
      el.find('market-item-image').attr('url') ??
      el.find('.t-market-item-bottom-link').attr('href') ??
      el.find('.t-market-auto-title a').attr('href')
    const link = normalizeUrl(linkRaw, provider.url)

    const previewRaw =
      el.find('market-item-image').attr('preview') ??
      el.find('market-item-image').attr('data-preview') ??
      el.find('market-item-image').attr('src') ??
      el.find('market-item-image img').attr('src') ??
      el.find('img').first().attr('src')
    const preview = normalizeOptionalUrl(previewRaw, provider.url) ?? extractImageCandidate(el, provider.url)

    const year = parseYear(propsText)
    const mileageKm = parseMileage(propsText)
    const location = propsText
      .split('/')
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .find((part) => /[А-Яа-яA-Za-z]{2,}/.test(part) && !/км|г\./i.test(part))

    const uniqueKey = `${provider.id}:${title}:${priceRub}`
    if (seen.has(uniqueKey)) return
    seen.add(uniqueKey)

    output.push({
      id: makeId(provider.id, title, priceRub),
      title,
      subtitle:
        pickText(
          year ? `${year} г.` : undefined,
          mileageKm ? `${new Intl.NumberFormat('ru-RU').format(mileageKm)} км` : undefined,
          location || providerSubtitle(provider.id),
        ) || providerSubtitle(provider.id),
      priceRub,
      ...estimateMarket(priceRub),
      year,
      mileageKm,
      location: location || undefined,
      imageUrl: preview ?? FALLBACK_IMAGE,
      imageUrls: preview ? [preview] : [],
      detailUrl: link,
      description:
        'Позиция автоматически собрана и доступна для заявки. Подробные характеристики подтверждаются менеджером.',
      badges: ['in_stock', 'leasing'],
      source: {
        providerId: provider.id,
        providerName: provider.name,
        providerUrl: provider.url,
        listingUrl: link,
        parserHint: `${provider.parserHint}-market-item`,
        fallback: false,
      },
    })
  })

  return output.slice(0, 80)
}

function parseVtbFromAnchors(provider: ProviderConfig, html: string): InternalListing[] {
  if (provider.id !== 'vtb') return []

  const $ = load(html)
  const output: InternalListing[] = []
  const seen = new Set<string>()

  $('a[href*="/market/"], a[href*="/auto/probeg/"]').each((_, node) => {
    const anchor = $(node)
    const href = anchor.attr('href')
    if (!href) return

    let title = anchor.text().replace(/\s+/g, ' ').trim()
    if (!title || title.length < 3) {
      title = anchor.attr('title')?.trim() ?? ''
    }
    if (!title || title.length < 3) return
    if (!/[A-Za-zА-Яа-я]/.test(title)) return

    let blockText = ''
    let priceRub: number | undefined
    let container = anchor.parent()
    for (let level = 0; level < 7; level += 1) {
      const candidateText = container.text().replace(/\s+/g, ' ').trim()
      const candidatePrice = parsePrice(candidateText)
      if (candidatePrice) {
        blockText = candidateText
        priceRub = candidatePrice
        break
      }
      const parent = container.parent()
      if (!parent || parent.length === 0) break
      container = parent
    }

    if (!priceRub) return

    const link = normalizeUrl(href, provider.url)
    const image = extractImageCandidate(container, provider.url)
    const year = parseYear(blockText)
    const mileageKm = parseMileage(blockText)
    const locationMatch = blockText.match(/([А-Яа-яA-Za-z\- ]{3,30})\s*\/\s*\d[\d\s]{1,}\s*(км|km)/i)
    const location = locationMatch?.[1]?.trim()
    const discountPercent = parseDiscount(blockText)

    const uniqueKey = `${provider.id}:${title}:${priceRub}`
    if (seen.has(uniqueKey)) return
    seen.add(uniqueKey)

    output.push({
      id: makeId(provider.id, title, priceRub),
      title,
      subtitle:
        pickText(
          year ? `${year} г.` : undefined,
          mileageKm ? `${new Intl.NumberFormat('ru-RU').format(mileageKm)} км` : undefined,
          location || providerSubtitle(provider.id),
        ) || providerSubtitle(provider.id),
      priceRub,
      ...estimateMarket(priceRub),
      year,
      mileageKm,
      location: location || undefined,
      imageUrl: image ?? FALLBACK_IMAGE,
      imageUrls: image ? [image] : [],
      detailUrl: link,
      description:
        'Позиция автоматически собрана и доступна для заявки. Подробные характеристики подтверждаются менеджером.',
      badges: discountPercent ? ['in_stock', 'leasing', 'discount'] : ['in_stock', 'leasing'],
      discountPercent,
      source: {
        providerId: provider.id,
        providerName: provider.name,
        providerUrl: provider.url,
        listingUrl: link,
        parserHint: `${provider.parserHint}-anchor`,
        fallback: false,
      },
    })
  })

  return output.slice(0, 30)
}

function dedupe(items: InternalListing[]): InternalListing[] {
  const seen = new Set<string>()
  const out: InternalListing[] = []
  items.forEach((item) => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    out.push(item)
  })
  return out
}

function hasUsableImage(item: InternalListing): boolean {
  if (!isRealImage(item.imageUrl)) return false
  if (item.imageUrls.length === 0) return false
  return item.imageUrls.some((url) => isRealImage(url))
}

function buildFallback(provider: ProviderConfig, index: number): InternalListing {
  const price = 3000000 + index * 420000
  const titleByIndex = ['Грузовой тягач', 'Самосвал', 'Экскаватор', 'Автокран', 'Погрузчик']
  return {
    id: makeId(provider.id, `${provider.name}:${index}`, price),
    title: titleByIndex[index % titleByIndex.length],
    subtitle: providerSubtitle(provider.id),
    priceRub: price,
    ...estimateMarket(price),
    year: 2020 + (index % 4),
    mileageKm: 110000 + index * 13000,
    location: ['Москва', 'Санкт-Петербург', 'Казань', 'Екатеринбург', 'Новосибирск'][index % 5],
    imageUrl: FALLBACK_IMAGE,
    imageUrls: [],
    detailUrl: 'https://t.me/GONKACONFBOT',
    description:
      'Позиция доступна для заявки. Актуальность наличия и комплектация уточняются у менеджера.',
    badges: ['in_stock', 'leasing'],
    source: {
      providerId: provider.id,
      providerName: provider.name,
      providerUrl: provider.url,
      listingUrl: provider.url,
      parserHint: `${provider.parserHint}-fallback`,
      fallback: true,
    },
  }
}

async function fetchHtml(url: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8',
        },
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}, status ${response.status}`)
      }
      return response.text()
    } catch (error) {
      lastError = error
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500))
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`)
}

async function fetchDetailImages(
  provider: ProviderConfig,
  detailUrl: string,
  baseUrl: string,
): Promise<string[]> {
  try {
    const response = await fetch(detailUrl, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8',
        referer: baseUrl,
      },
      redirect: 'follow',
    })
    if (!response.ok) return []

    const html = await response.text()
    const $ = load(html)
    const fromJsonLd: string[] = []
    $('script[type="application/ld+json"]').each((_, node) => {
      const raw = $(node).html()
      if (!raw) return
      try {
        const parsed = JSON.parse(raw)
        const blocks = Array.isArray(parsed) ? parsed : [parsed]
        for (const block of blocks) {
          const imageValue = Array.isArray(block?.image) ? block.image : [block?.image]
          for (const image of imageValue) {
            if (typeof image === 'string') fromJsonLd.push(image)
          }
        }
      } catch {
        // Ignore malformed JSON-LD blocks.
      }
    })

    const directCandidates: Array<string | undefined> = [
      $('meta[property="og:image"]').attr('content'),
      $('meta[name="twitter:image"]').attr('content'),
      $('meta[property="twitter:image"]').attr('content'),
      $('meta[property="og:image:url"]').attr('content'),
      ...fromJsonLd,
      extractImageCandidate($('main').first(), detailUrl),
      extractImageCandidate($('article').first(), detailUrl),
      $('img[itemprop="image"]').first().attr('src'),
      $('img[itemprop="image"]').first().attr('data-src'),
      firstSrcsetUrl($('img[itemprop="image"]').first().attr('srcset')),
      $('picture source').first().attr('srcset'),
      $('img').first().attr('src'),
    ]

    const galleryCandidates: string[] = []
    $('img, source, a[href], market-item-image').each((_, node) => {
      const el = $(node)
      const nodeName = String((node as { tagName?: string }).tagName ?? '').toLowerCase()
      if (nodeName === 'a') {
        const href = el.attr('href')
        if (href && hasImageExtension(href)) galleryCandidates.push(href)
      }

      IMAGE_ATTRS.forEach((attr) => {
        const value = el.attr(attr)
        if (value) galleryCandidates.push(value)
      })

      const srcset =
        el.attr('srcset') ??
        el.attr('data-srcset') ??
        el.attr('data-large-image') ??
        el.attr('data-full')
      if (srcset) {
        srcset
          .split(',')
          .map((part) => part.trim().split(' ')[0])
          .filter(Boolean)
          .forEach((value) => galleryCandidates.push(value))
      }

      const styleMatch = (el.attr('style') ?? '').match(/url\((['"]?)(.+?)\1\)/i)
      if (styleMatch?.[2]) galleryCandidates.push(styleMatch[2])
    })

    const normalized = normalizeImageList(provider, [...directCandidates, ...galleryCandidates], detailUrl)
    if (normalized.length > 0) return normalized.slice(0, 1)

    const fallback = extractImageCandidate($('body').first(), baseUrl)
    return fallback ? [fallback] : []
  } catch {
    return []
  }
}

async function enrichImagesFromDetail(items: InternalListing[], provider: ProviderConfig): Promise<void> {
  const target =
    provider.id === 'vtb'
      ? items.slice(0, 50)
      : items.filter((item) => item.imageUrl === FALLBACK_IMAGE).slice(0, 16)

  if (target.length === 0) return

  const chunks: InternalListing[][] = []
  for (let i = 0; i < target.length; i += 3) {
    chunks.push(target.slice(i, i + 3))
  }

  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async (item) => ({
        item,
        images: await fetchDetailImages(provider, item.detailUrl, provider.url),
      })),
    )
    results.forEach(({ item, images }) => {
      if (images.length > 0) {
        item.imageUrls = [images[0]]
        item.imageUrl = images[0]
        return
      }

      if (isRealImage(item.imageUrl)) {
        item.imageUrls = [item.imageUrl]
      } else {
        item.imageUrls = []
      }
    })
  }
}

export async function scrapeProvider(provider: ProviderConfig): Promise<InternalListing[]> {
  const html = await fetchHtml(provider.url)
  const vtbMarketItems = parseVtbMarketItems(provider, html)
  const cards = parseFromCards(provider, html)
  const jsonLd = parseFromJsonLd(provider, html)
  const vtbAnchors = parseVtbFromAnchors(provider, html)
  const merged = dedupe([...vtbMarketItems, ...vtbAnchors, ...cards, ...jsonLd]).slice(0, 40)
  if (merged.length === 0) {
    throw new Error(`No listings parsed for provider ${provider.id}`)
  }
  await enrichImagesFromDetail(merged, provider)
  return merged
}

async function scrapeProviderDetailed(
  provider: ProviderConfig,
  fallbackSeed: number,
): Promise<{ items: InternalListing[]; report: ProviderSyncReport }> {
  try {
    const items = await scrapeProvider(provider)
    const fallbackCount = items.filter((item) => item.source.fallback).length
    return {
      items,
      report: {
        providerId: provider.id,
        providerName: provider.name,
        parserHint: provider.parserHint,
        total: items.length,
        fallbackCount,
        status: fallbackCount === items.length ? 'fallback' : 'ok',
      },
    }
  } catch (error) {
    const fallbackItems = [buildFallback(provider, fallbackSeed)]
    return {
      items: fallbackItems,
      report: {
        providerId: provider.id,
        providerName: provider.name,
        parserHint: provider.parserHint,
        total: fallbackItems.length,
        fallbackCount: fallbackItems.length,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown parser error',
      },
    }
  }
}

export async function collectListings(
  options: CollectListingsOptions = {},
): Promise<CollectListingsResult> {
  const selectedProviders =
    options.providers && options.providers.length > 0
      ? PROVIDERS.filter((provider) => options.providers?.includes(provider.id))
      : PROVIDERS

  const settled = await Promise.all(
    selectedProviders.map((provider, index) => scrapeProviderDetailed(provider, index)),
  )

  const collected = settled
    .flatMap((entry) => entry.items)
    .filter((item) => hasUsableImage(item))
    .sort((a, b) => b.priceRub - a.priceRub)
    .slice(0, 100)

  return {
    items: collected,
    report: settled.map((entry) => entry.report),
  }
}
