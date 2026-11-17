import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const SITE = 'https://www.rhocal.com.br/colaborador'
const COOKIE = 'rhocal_via_site'

export async function middleware(request: NextRequest) {
  // ---- ACESSO VIA SITE ----
  // /api fica fora do bloqueio (cron-job.org, Mobcall, webhooks). Continua
  // passando pelo updateSession abaixo para renovar a sessão do Supabase.
  const url = request.nextUrl
  if (!url.pathname.startsWith('/api/')) {
    const veioDoSite = url.searchParams.get('from') === 'site'
    const jaPassou = request.cookies.get(COOKIE)?.value === '1'

    if (!veioDoSite && !jaPassou) {
      return NextResponse.redirect(SITE)
    }
    if (veioDoSite) {
      const destino = url.clone()
      destino.searchParams.delete('from')
      const res = NextResponse.redirect(destino)
      res.cookies.set(COOKIE, '1', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 12,
        path: '/',
      })
      return res
    }
  }
  // ---- fim ----

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Aplica em todas as rotas, exceto:
     * - _next/static, _next/image (assets internos do Next)
     * - favicon.ico e arquivos de imagem
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)',
  ],
}
