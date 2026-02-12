import { getListings } from './_lib/service.js'

type ReqLike = {
  query?: { refresh?: string }
}

type ResLike = {
  status: (code: number) => { json: (body: unknown) => void }
}

export default async function handler(req: ReqLike, res: ResLike) {
  const forceRefresh = req.query?.refresh === '1'
  const bundle = await getListings(forceRefresh)
  res.status(200).json({
    items: bundle.publicItems,
    updatedAt: bundle.updatedAt,
  })
}
