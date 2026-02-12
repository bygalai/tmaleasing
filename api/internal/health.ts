import { getDatabaseHealth } from '../_lib/storage.js'

type ReqLike = {
  url?: string
  headers?: Record<string, string | string[] | undefined>
}

type ResLike = {
  status: (code: number) => { json: (body: unknown) => void }
}

function extractKey(req: ReqLike): string | undefined {
  const url = new URL(req.url ?? '', 'http://localhost')
  const queryKey = url.searchParams.get('key')
  if (queryKey) return queryKey
  const headerValue = req.headers?.['x-admin-key']
  if (typeof headerValue === 'string') return headerValue
  if (Array.isArray(headerValue)) return headerValue[0]
  return undefined
}

export default async function handler(req: ReqLike, res: ResLike) {
  const requiredKey = process.env.ADMIN_DEBUG_KEY
  const providedKey = extractKey(req)

  if (!requiredKey || providedKey !== requiredKey) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const database = await getDatabaseHealth()
  res.status(200).json({
    ok: true,
    now: new Date().toISOString(),
    database,
  })
}
