import { NextResponse } from 'next/server'
import { clienteAdmin, respostaNaoAutorizada, segredoValido, soDigitos } from '@/lib/bridge/servidor'

// Busca de clientes para o CRM WhatsApp vincular um número. SOMENTE LEITURA.
export const dynamic = 'force-dynamic'
export const maxDuration = 15

type Linha = {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  cidade: string | null
}

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

// Cache curto em memória: a busca sem acento exige comparar em JS, então a
// lista enxuta (5 colunas) é carregada uma vez por instância a cada 60 s.
let cache: { em: number; linhas: Linha[] } | null = null

async function carregar(): Promise<Linha[]> {
  if (cache && Date.now() - cache.em < 60_000) return cache.linhas
  const supabase = clienteAdmin()
  const linhas: Linha[] = []
  for (let de = 0; de < 30000; de += 1000) {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, razao_social, nome_fantasia, cnpj, cidade')
      .order('id')
      .range(de, de + 999)
    if (error) throw new Error(error.message)
    linhas.push(...(data as Linha[]))
    if ((data?.length ?? 0) < 1000) break
  }
  cache = { em: Date.now(), linhas }
  return linhas
}

export async function GET(request: Request) {
  if (!segredoValido(request.headers.get('x-bridge-secret'))) return respostaNaoAutorizada()

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (q.length < 3) return NextResponse.json({ clientes: [] })

  try {
    const linhas = await carregar()
    const termo = norm(q)
    const digitos = soDigitos(q)
    // CNPJ só é critério quando a busca é majoritariamente numérica.
    const porCnpj = digitos.length >= 3 && digitos.length >= q.replace(/[.\-/\s]/g, '').length

    const achados = linhas.filter((c) =>
      porCnpj
        ? soDigitos(c.cnpj).includes(digitos)
        : norm(c.razao_social).includes(termo) || norm(c.nome_fantasia).includes(termo),
    )
    // Começa-com primeiro, depois ordem alfabética.
    const nome = (c: Linha) => norm(c.nome_fantasia || c.razao_social)
    achados.sort(
      (a, b) =>
        Number(nome(b).startsWith(termo)) - Number(nome(a).startsWith(termo)) || nome(a).localeCompare(nome(b)),
    )

    return NextResponse.json({
      clientes: achados.slice(0, 10).map((c) => ({
        id: c.id,
        nome: c.nome_fantasia || c.razao_social,
        cnpj: c.cnpj,
        cidade: c.cidade,
      })),
    })
  } catch (err) {
    console.error('[bridge/clientes/busca]', err instanceof Error ? err.message : err)
    return NextResponse.json({ erro: 'Falha ao consultar.' }, { status: 500 })
  }
}
