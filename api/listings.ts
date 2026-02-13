import { getListings } from './_lib/service.js'

type ReqLike = {
  query?: { refresh?: string; page?: string; limit?: string }
  url?: string
}

type ResLike = {
  status: (code: number) => { json: (body: unknown) => void }
}

function parseParams(req: ReqLike): { forceRefresh: boolean; page: number; limit: number } {
  const url = new URL(req.url ?? '', 'http://localhost')
  const queryRefresh = req.query?.refresh
  const queryPage = req.query?.page
  const queryLimit = req.query?.limit
  const refresh = queryRefresh ?? url.searchParams.get('refresh') ?? '0'
  const pageRaw = queryPage ?? url.searchParams.get('page') ?? '1'
  const limitRaw = queryLimit ?? url.searchParams.get('limit') ?? '20'

  const pageParsed = Number(pageRaw)
  const limitParsed = Number(limitRaw)
  const page = Number.isFinite(pageParsed) && pageParsed >= 1 ? Math.floor(pageParsed) : 1
  const clampedLimit =
    Number.isFinite(limitParsed) && limitParsed >= 10 && limitParsed <= 20
      ? Math.floor(limitParsed)
      : 20

  return {
    forceRefresh: refresh === '1',
    page,
    limit: clampedLimit,
  }
}

export default async function handler(req: ReqLike, res: ResLike) {
  const { forceRefresh, page, limit } = parseParams(req)
  const bundle = await getListings(forceRefresh)
  const total = bundle.publicItems.length
  const pages = Math.max(1, Math.ceil(total / limit))
  const currentPage = Math.min(page, pages)
  const start = (currentPage - 1) * limit
  const end = start + limit
  const items = bundle.publicItems.slice(start, end)

  res.status(200).json({
    items,
    updatedAt: bundle.updatedAt,
    pagination: {
      total,
      page: currentPage,
      limit,
      pages,
    },
  })
}
