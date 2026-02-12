type ReqLike = {
  query?: { src?: string }
  url?: string
}

type ResLike = {
  setHeader: (name: string, value: string) => void
  status: (code: number) => {
    send: (body: string | Buffer) => void
    json: (body: unknown) => void
  }
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36'

function getSrc(req: ReqLike): string | undefined {
  if (req.query?.src) return req.query.src
  if (!req.url) return undefined
  const url = new URL(req.url, 'http://localhost')
  return url.searchParams.get('src') ?? undefined
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

function isAllowedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (!normalized) return false
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return false
  if (normalized === '::1' || normalized === '[::1]') return false
  if (normalized.endsWith('.local')) return false
  if (isPrivateIpv4(normalized)) return false
  return true
}

function sendPlaceholder(res: ResLike) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#e5e7eb" font-size="42" font-family="Arial, sans-serif">Photo unavailable</text></svg>`
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
  res.status(200).send(svg)
}

async function convertWebpToJpeg(body: Uint8Array): Promise<Uint8Array | undefined> {
  try {
    const sharp = (await import('sharp')).default
    const converted = await sharp(body).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    return new Uint8Array(converted)
  } catch {
    return undefined
  }
}

export default async function handler(req: ReqLike, res: ResLike) {
  const src = getSrc(req)
  if (!src) {
    sendPlaceholder(res)
    return
  }

  let parsed: URL
  try {
    parsed = new URL(src)
  } catch {
    sendPlaceholder(res)
    return
  }

  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !isAllowedHost(parsed.hostname)) {
    sendPlaceholder(res)
    return
  }

  try {
    const imageUrl =
      parsed.protocol === 'http:'
        ? new URL(`${parsed.pathname}${parsed.search}`, `https://${parsed.host}`).toString()
        : parsed.toString()

    const response = await fetch(imageUrl, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        referer: `https://${parsed.hostname}/`,
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      sendPlaceholder(res)
      return
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      sendPlaceholder(res)
      return
    }

    const arrayBuffer = await response.arrayBuffer()
    const originalBody = new Uint8Array(arrayBuffer)
    const shouldConvertFromWebp = contentType.toLowerCase().startsWith('image/webp')
    const convertedBody = shouldConvertFromWebp
      ? await convertWebpToJpeg(originalBody)
      : undefined
    const body = Buffer.from(convertedBody ?? originalBody)

    res.setHeader('Content-Type', convertedBody ? 'image/jpeg' : contentType)
    res.setHeader('Content-Length', String(body.byteLength))
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400')
    res.status(200).send(body)
  } catch {
    sendPlaceholder(res)
  }
}
