import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

// Rotas acessíveis sem autenticação.
const ROTAS_PUBLICAS = ['/login']

// Atualiza a sessão do usuário a cada requisição e protege as rotas:
// sem usuário logado -> redireciona para /login.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANTE: não rode código entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isRotaPublica = ROTAS_PUBLICAS.some((rota) => pathname.startsWith(rota))

  // Rotas de API tratam a própria autenticação e devem responder com JSON,
  // nunca com um redirect HTML — cada handler já verifica o usuário.
  if (pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  // Não logado tentando acessar rota protegida -> manda para /login.
  if (!user && !isRotaPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Já logado tentando acessar /login -> manda para /dashboard.
  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
