import type { InternalListing, PublicListing } from './models.js'
import { collectListings, type ProviderSyncReport } from './scrape.js'
import { readListings, type CacheBundle, writeListings } from './storage.js'

export type ListingsBundle = {
  updatedAt: string
  publicItems: PublicListing[]
  internalItems: InternalListing[]
}

export type SyncResult = {
  bundle: ListingsBundle
  report: ProviderSyncReport[]
}

export type SyncOptions = {
  providers?: InternalListing['source']['providerId'][]
}

function toListingsBundle(bundle: CacheBundle): ListingsBundle {
  return {
    updatedAt: bundle.updatedAt,
    publicItems: bundle.publicItems,
    internalItems: bundle.internalItems,
  }
}

export async function syncListings(options: SyncOptions = {}): Promise<SyncResult> {
  const collected = await collectListings({ providers: options.providers })
  let itemsToPersist = collected.items

  // Partial sync updates only selected providers, preserving the rest.
  if (options.providers && options.providers.length > 0) {
    const existing = await readListings()
    if (existing) {
      const keep = existing.internalItems.filter(
        (item) => !options.providers?.includes(item.source.providerId),
      )
      itemsToPersist = [...keep, ...collected.items]
    }
  }

  const bundle = await writeListings(itemsToPersist)
  return {
    bundle: toListingsBundle(bundle),
    report: collected.report,
  }
}

export async function getListings(forceRefresh = false): Promise<ListingsBundle> {
  if (forceRefresh) {
    const refreshed = await syncListings()
    return refreshed.bundle
  }

  const stored = await readListings()
  if (stored && stored.publicItems.length > 0) {
    return toListingsBundle(stored)
  }

  const synced = await syncListings()
  return synced.bundle
}
