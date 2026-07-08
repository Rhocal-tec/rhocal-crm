import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

// Cliente Supabase para uso em Server Components, Route Handlers e Server Actions.
// Lê/escreve a sessão nos cookies da requisição via @supabase/ssr.
export function createClient() {
  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // `setAll` foi chamado de um Server Component. Pode ser ignorado
            // quando há um middleware atualizando a sessão do usuário.
          }
        },
      },
    },
  )
}
