import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  // Best-effort decode to prevent leaking secret service keys into browser builds.
  // No signature verification needed for this guard.
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json = atob(padded)
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export function getSupabaseClient(): SupabaseClient {
  if (client) return client

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

  if (!url || !anonKey) {
    throw new Error('Не настроены VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY в .env')
  }

  const payload = decodeJwtPayload(anonKey)
  const role = typeof payload?.role === 'string' ? payload.role : null
  if (role === 'service_role' || role === 'supabase_admin') {
    throw new Error(
      'В браузере нельзя использовать secret/service_role key. Замените VITE_SUPABASE_ANON_KEY на anon public key из Supabase Dashboard.',
    )
  }

  client = createClient(url, anonKey)
  return client
}

