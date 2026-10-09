import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'

// Fallback usado quando um CNPJ digitado na criação do pedido não é
// encontrado no Omie (fase 23) — API pública e gratuita da Receita Federal,
// sem necessidade de chave.
const BRASILAPI_CNPJ_URL = 'https://brasilapi.com.br/api/cnpj/v1'

interface ClienteReceita {
  razaoSocial: string | null
  nomeFantasia: string | null
  telefone: string | null
  telefoneDdd: string | null
  telefoneNumero: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  municipio: string | null
  uf: string | null
  cep: string | null
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

// As APIs são externas e podem ficar lentas/fora do ar/bloqueadas — nunca
// deixa a requisição pendurada esperando indefinidamente.
const TIMEOUT_MS = 6000

export async function POST(request: Request) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('setor')
    .eq('id', user.id)
    .single()

  // Antes exclusivo de comercial/gestor (a única chamada era da criação de
  // pedido). A partir da fase 34, o módulo de Clientes também usa esta rota
  // e é visível a todos os perfis — liberada pra qualquer autenticado.
  if (!profile) {
    return NextResponse.json(
      { erro: 'Seu perfil não pode consultar CNPJ na Receita Federal.' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const cnpj = typeof body?.cnpj === 'string' ? body.cnpj.replace(/\D/g, '') : ''
  if (cnpj.length !== 14) {
    return NextResponse.json({ erro: 'CNPJ inválido.' }, { status: 400 })
  }

  const headers = {
    // Sem User-Agent, algumas CDNs (ex: BrasilAPI/Fastly) bloqueiam o fetch do Node.
    'User-Agent': 'Mozilla/5.0 (compatible; RhocalCRM/1.0)',
    Accept: 'application/json',
  }

  type Resultado = 'nao_encontrado' | 'falhou' | ClienteReceita

  async function buscarJson(url: string): Promise<{ status: number; dados: Record<string, unknown> | null } | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const r = await fetch(url, { signal: controller.signal, headers })
      const dados = await r.json().catch(() => null)
      return { status: r.status, dados }
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }
  }

  function montar(
    razao: unknown,
    fantasia: unknown,
    telefoneDigitos: string,
    logradouro: unknown,
    numero: unknown,
    bairro: unknown,
    municipio: unknown,
    uf: unknown,
    cep: unknown,
  ): Resultado {
    const razaoSocial = textoOuNulo(razao)
    const nomeFantasia = textoOuNulo(fantasia)
    if (!razaoSocial && !nomeFantasia) return 'nao_encontrado'
    const ok = telefoneDigitos.length >= 10
    return {
      razaoSocial,
      nomeFantasia,
      telefone: telefoneDigitos || null,
      telefoneDdd: ok ? telefoneDigitos.slice(0, 2) : null,
      telefoneNumero: ok ? telefoneDigitos.slice(2) : null,
      logradouro: textoOuNulo(logradouro),
      numero: textoOuNulo(numero),
      bairro: textoOuNulo(bairro),
      municipio: textoOuNulo(municipio),
      uf: textoOuNulo(uf),
      cep: textoOuNulo(cep),
    }
  }

  const soDigitos = (v: unknown) => (typeof v === 'string' ? v.replace(/\D/g, '') : '')

  // Formato BrasilAPI / minhareceita.org (mesmo schema).
  async function viaBrasilApi(url: string): Promise<Resultado> {
    const r = await buscarJson(url)
    if (!r) return 'falhou'
    if (r.status === 404) return 'nao_encontrado'
    const d = r.dados
    if (r.status < 200 || r.status >= 300 || !d) return 'falhou'
    return montar(d.razao_social, d.nome_fantasia, soDigitos(d.ddd_telefone_1), d.logradouro, d.numero, d.bairro, d.municipio, d.uf, d.cep)
  }

  async function viaReceitaWs(): Promise<Resultado> {
    const r = await buscarJson(`https://receitaws.com.br/v1/cnpj/${cnpj}`)
    const d = r?.dados
    if (!r || !d || r.status !== 200) return 'falhou'
    if (d.status === 'ERROR') {
      return typeof d.message === 'string' && d.message.toLowerCase().includes('inválido') ? 'nao_encontrado' : 'falhou'
    }
    return montar(d.nome, d.fantasia, soDigitos(d.telefone).replace(/^(\d{10,11}).*/, '$1'), d.logradouro, d.numero, d.bairro, d.municipio, d.uf, d.cep)
  }

  async function viaCnpjWs(): Promise<Resultado> {
    const r = await buscarJson(`https://publica.cnpj.ws/cnpj/${cnpj}`)
    if (!r) return 'falhou'
    if (r.status === 404) return 'nao_encontrado'
    const d = r.dados
    if (r.status !== 200 || !d) return 'falhou'
    const e = (d.estabelecimento ?? {}) as Record<string, unknown>
    const cidade = (e.cidade ?? {}) as Record<string, unknown>
    const estado = (e.estado ?? {}) as Record<string, unknown>
    return montar(d.razao_social, e.nome_fantasia, soDigitos(e.ddd1) + soDigitos(e.telefone1), e.logradouro, e.numero, e.bairro, cidade.nome, estado.sigla, e.cep)
  }

  // Tenta uma API após a outra: se uma estiver fora do ar, lenta ou bloqueando
  // o servidor (comum em IPs de hospedagem), a próxima assume.
  const provedores: Array<() => Promise<Resultado>> = [
    () => viaBrasilApi(`${BRASILAPI_CNPJ_URL}/${cnpj}`),
    () => viaBrasilApi(`https://minhareceita.org/${cnpj}`),
    viaReceitaWs,
    viaCnpjWs,
  ]

  let algumNaoEncontrado = false
  for (const provedor of provedores) {
    const resultado = await provedor()
    if (resultado === 'falhou') continue
    if (resultado === 'nao_encontrado') {
      algumNaoEncontrado = true
      continue
    }
    return NextResponse.json({ encontrado: true, cliente: resultado })
  }

  if (algumNaoEncontrado) {
    return NextResponse.json({ encontrado: false })
  }

  const mensagem =
    'Não foi possível consultar a Receita Federal agora (todas as fontes falharam). Tente novamente em instantes.'
  await registrarErro(supabase, { rota: '/api/cnpj/consultar', mensagem, colaboradorId: user.id })
  return NextResponse.json({ erro: mensagem }, { status: 502 })
}
