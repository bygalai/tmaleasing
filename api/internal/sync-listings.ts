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
  const startedAt = Date.now()

  try {
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

    const hasDatabaseUrl = Boolean(process.env.DATABASE_URL)
    if (!hasDatabaseUrl) {
      console.warn('[sync-route] DATABASE_URL is not configured, using memory cache only')
    }

    const requestedProviders = extractProviders(req)
    const forceFullSync = shouldForceFullSync(req)
    const providers =
      requestedProviders.length > 0
        ? requestedProviders
        : forceFullSync
          ? ALLOWED_PROVIDERS
          : [getCurrentSlotProvider()]

    console.info(
      `[sync-route] start mode=${forceFullSync ? 'full' : 'incremental'} providers=${providers.join(',')}`,
    )

    const result = await syncListings({
      providers,
      lightweight: true,
    })

    const elapsedMs = Date.now() - startedAt
    if (elapsedMs > 9000) {
      console.warn(`[sync-route] near-timeout elapsed_ms=${elapsedMs}`)
    }

    const reportSummary = result.report.map((item) => ({
      providerId: item.providerId,
      total: item.total,
      fallbackCount: item.fallbackCount,
      status: item.status,
      error: item.error,
    }))

    console.info(`[sync-route] done elapsed_ms=${elapsedMs} total=${result.bundle.publicItems.length}`)

    res.status(200).json({
      ok: true,
      updatedAt: result.bundle.updatedAt,
      total: result.bundle.publicItems.length,
      mode: forceFullSync ? 'full' : 'incremental',
      providers,
      elapsedMs,
      hasDatabaseUrl,
      report: reportSummary,
    })
  } catch (error) {
    const elapsedMs = Date.now() - startedAt
    const message = error instanceof Error ? error.message : 'Unknown sync error'
    const stack = error instanceof Error ? error.stack : undefined
    console.error('[sync-route] failed', { elapsedMs, message, stack })
    res.status(500).json({
      ok: false,
      error: message,
      stack,
      elapsedMs,
    })
  }
}
