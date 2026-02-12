import { syncListings } from '../_lib/service.js'
import type { ProviderId } from '../_lib/models.js'

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

function isVercelCron(req: ReqLike): boolean {
  const cronHeader = req.headers?.['x-vercel-cron']
  return typeof cronHeader === 'string' && cronHeader.length > 0
}

function extractProviders(req: ReqLike): ProviderId[] {
  const url = new URL(req.url ?? '', 'http://localhost')
  const raw = url.searchParams.get('providers')
  if (!raw) return []

  const allowed: ProviderId[] = ['vtb', 'europlan', 'ileasing', 'alfaleasing', 'autogpbl']
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is ProviderId => allowed.includes(item as ProviderId))
}

export default async function handler(req: ReqLike, res: ResLike) {
  const requiredKey = process.env.ADMIN_DEBUG_KEY
  const providedKey = extractKey(req)
  const trustedCronCall = isVercelCron(req)

  if (!trustedCronCall && (!requiredKey || providedKey !== requiredKey)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const providers = extractProviders(req)
  const result = await syncListings({
    providers: providers.length > 0 ? providers : undefined,
  })

  const reportSummary = result.report.map((item) => ({
    providerId: item.providerId,
    total: item.total,
    fallbackCount: item.fallbackCount,
    status: item.status,
    error: item.error,
  }))

  res.status(200).json({
    ok: true,
    updatedAt: result.bundle.updatedAt,
    total: result.bundle.publicItems.length,
    providers: providers.length > 0 ? providers : 'all',
    report: reportSummary,
  })
}
