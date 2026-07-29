import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = ReturnType<typeof createClient>

export interface CredenciaisOmie {
  appKey: string
  appSecret: string
}

// Cada empresa (RHOCAL, MATSEG, ...) é um "aplicativo" Omie distinto, com
// App Key/App Secret próprios — nunca existe um par global. O nome da env var
// é derivado do slug da empresa (tabela `empresas`), então uma empresa nova
// só precisa de duas env vars novas (OMIE_APP_KEY_<SLUG>/OMIE_APP_SECRET_<SLUG>),
// sem alterar código.
export function obterCredenciaisOmiePorSlug(slug: string): CredenciaisOmie {
  const prefixo = slug.trim().toUpperCase()
  const appKey = process.env[`OMIE_APP_KEY_${prefixo}`]
  const appSecret = process.env[`OMIE_APP_SECRET_${prefixo}`]
  if (!appKey || !appSecret) {
    throw new Error(`Credenciais do Omie não configuradas no servidor para a empresa "${slug}".`)
  }
  return { appKey, appSecret }
}

// Resolve as credenciais a partir de um empresa_id já em mãos (ex: rota que
// já carregou o pedido inteiro do banco por outro motivo — evita uma segunda
// consulta a `pedidos` só para achar de novo o empresa_id que já se tinha).
export async function obterCredenciaisOmiePorEmpresaId(
  supabase: SupabaseServerClient,
  empresaId: string | null,
): Promise<CredenciaisOmie> {
  if (!empresaId) {
    throw new Error('Não foi possível identificar a empresa do pedido.')
  }

  const { data: empresa, error: erroEmpresa } = await supabase
    .from('empresas')
    .select('slug')
    .eq('id', empresaId)
    .single()

  if (erroEmpresa || !empresa) {
    throw new Error('Não foi possível identificar a empresa do pedido.')
  }

  return obterCredenciaisOmiePorSlug(empresa.slug)
}

// Resolve as credenciais a partir da empresa DONA de um pedido já existente —
// nunca da empresa ativa no seletor do header no momento da chamada, pra
// evitar inconsistência caso o usuário troque de empresa no meio de uma
// operação (fase 30 do CLAUDE.md).
export async function obterCredenciaisOmiePorPedido(
  supabase: SupabaseServerClient,
  pedidoId: string,
): Promise<CredenciaisOmie> {
  const { data: pedido, error: erroPedido } = await supabase
    .from('pedidos')
    .select('empresa_id')
    .eq('id', pedidoId)
    .single()

  if (erroPedido || !pedido) {
    throw new Error('Não foi possível identificar a empresa do pedido.')
  }

  return obterCredenciaisOmiePorEmpresaId(supabase, pedido.empresa_id)
}

// Resolve as credenciais a partir de um pedidoId (pedido já existente, tem
// prioridade) ou de um empresaSlug (fallback usado só antes do pedido
// existir — ex: busca de cliente/produto na criação do orçamento, quando
// ainda não há pedidoId; nesse caso usa a empresa ativa no seletor).
export async function resolverCredenciaisOmie(
  supabase: SupabaseServerClient,
  body: { pedidoId?: unknown; empresaSlug?: unknown },
): Promise<CredenciaisOmie> {
  const pedidoId = typeof body?.pedidoId === 'string' ? body.pedidoId : null
  if (pedidoId) return obterCredenciaisOmiePorPedido(supabase, pedidoId)

  const empresaSlug = typeof body?.empresaSlug === 'string' ? body.empresaSlug : null
  if (!empresaSlug) {
    throw new Error('Empresa não informada.')
  }
  return obterCredenciaisOmiePorSlug(empresaSlug)
}

// Chama a API do Omie e normaliza os dois jeitos que ela sinaliza erro:
// HTTP não-2xx, ou HTTP 200 com um corpo { faultstring, faultcode }.
export async function chamarOmie(
  url: string,
  call: string,
  param: Record<string, unknown>,
  credenciais: CredenciaisOmie,
): Promise<Record<string, unknown>> {
  let resposta: Response
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call,
        app_key: credenciais.appKey,
        app_secret: credenciais.appSecret,
        param: [param],
      }),
    })
  } catch {
    throw new Error(
      'Não foi possível conectar à API do Omie. Verifique sua conexão e tente novamente.',
    )
  }

  const dados = await resposta.json().catch(() => null)

  if (!dados) {
    throw new Error('A API do Omie retornou uma resposta inválida.')
  }
  if (typeof dados.faultstring === 'string') {
    throw new Error(dados.faultstring)
  }
  if (!resposta.ok) {
    throw new Error(`A API do Omie retornou um erro inesperado (HTTP ${resposta.status}).`)
  }

  return dados as Record<string, unknown>
}
