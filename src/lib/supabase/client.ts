'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// Cliente Supabase para uso em Client Components (browser).
// Usa a chave anon pública; o RLS no Postgres controla o acesso real.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
