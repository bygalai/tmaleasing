import { syncListings } from '../_lib/service.js'
import type { ProviderId } from '../_lib/models.js'

type ReqLike = {
  url?: string
  headers?: Record<string, string | string[] | undefined>
}

type ResLike = {
  status: (code: number) => { json: (body: unknown) => void }
}

const ALLOWED_PROVIDERS: ProviderId[] = ['vtb', 'europlan', 'ileasing', 'alfaleasing', 'autogpbl']
const SLOT_MS = 15 * 60 * 1000

function extractCronSecret(req: ReqLike): string | undefined {
  const url = new URL(req.url ?? '', 'http://localhost')
  const queryKey = url.searchParams.get('secret')
  if (queryKey) return queryKey
  const headerValue = req.headers?.['x-cron-secret']
  if (typeof headerValue === 'string') return headerValue
  if (Array.isArray(headerValue)) return headerValue[0]
  return undefined
}

function getCurrentSlotProvider(now = Date.now()): ProviderId {
  const slot = Math.floor(now / SLOT_MS)
  const index = slot % ALLOWED_PROVIDERS.length
  return ALLOWED_PROVIDERS[index]
}

function extractProviders(req: ReqLike): ProviderId[] {
  const url = new URL(req.url ?? '', 'http://localhost')
  const raw = url.searchParams.get('providers')
  if (!raw) return []

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is ProviderId => ALLOWED_PROVIDERS.includes(item as ProviderId))
}

function shouldForceFullSync(req: ReqLike): boolean {
  const url = new URL(req.url ?? '', 'http://localhost')
  return url.searchParams.get('full') === '1'
}

export default async function handler(req: ReqLike, res: ResLike) {
  const requiredSecret = process.env.CRON_SECRET
  const providedSecret = extractCronSecret(req)
  if (!requiredSecret) {
    res.status(500).json({ error: 'CRON_SECRET is not configured' })
    return
  }
  if (providedSecret !== requiredSecret) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const requestedProviders = extractProviders(req)
  const forceFullSync = shouldForceFullSync(req)
  const providers =
    requestedProviders.length > 0
      ? requestedProviders
      : forceFullSync
        ? ALLOWED_PROVIDERS
        : [getCurrentSlotProvider()]

  const result = await syncListings({
    providers,
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
    mode: forceFullSync ? 'full' : 'incremental',
    providers,
    report: reportSummary,
  })
}
