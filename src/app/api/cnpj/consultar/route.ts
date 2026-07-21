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

// A BrasilAPI é externa e pode ficar lenta/fora do ar — nunca deixa a
// requisição pendurada esperando indefinidamente.
const TIMEOUT_MS = 8000

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

  if (!profile || (profile.setor !== 'comercial' && profile.setor !== 'gestor')) {
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

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let resposta: Response
  try {
    // O `fetch` nativo do Node (usado pelas Route Handlers) não envia um
    // header User-Agent por padrão. A CDN da BrasilAPI (Fastly) trata isso
    // como sinal de bot e bloqueia/limita a requisição com 403 ou 429 antes
    // mesmo de chegar na aplicação — confirmado ao vivo (mesma URL/CNPJ
    // funciona com curl comum, que sempre manda um User-Agent, e falha sem
    // ele). Um User-Agent explícito evita esse bloqueio.
    resposta = await fetch(`${BRASILAPI_CNPJ_URL}/${cnpj}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'RhocalCRM/1.0 (+https://rhocal.com.br)',
        Accept: 'application/json',
      },
    })
  } catch {
    // Cobre tanto falha de rede quanto o abort por timeout — ambos sinalizam
    // "não deu para consultar agora", tratados da mesma forma pelo client.
    const mensagem = 'Não foi possível conectar à Receita Federal. Verifique sua conexão e tente novamente.'
    await registrarErro(supabase, { rota: '/api/cnpj/consultar', mensagem, colaboradorId: user.id })
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }

  // A BrasilAPI responde 404 quando o CNPJ não existe na base da Receita.
  if (resposta.status === 404) {
    return NextResponse.json({ encontrado: false })
  }

  const dados = await resposta.json().catch(() => null)

  if (!resposta.ok || !dados) {
    const mensagem = `A Receita Federal retornou um erro inesperado ao consultar este CNPJ (HTTP ${resposta.status}).`
    await registrarErro(supabase, { rota: '/api/cnpj/consultar', mensagem, colaboradorId: user.id })
    return NextResponse.json(
      { erro: 'A Receita Federal retornou um erro inesperado ao consultar este CNPJ.' },
      { status: 502 },
    )
  }

  const razaoSocial = textoOuNulo(dados.razao_social)
  const nomeFantasia = textoOuNulo(dados.nome_fantasia)

  if (!razaoSocial && !nomeFantasia) {
    return NextResponse.json({ encontrado: false })
  }

  // ddd_telefone_1 vem como DDD + número concatenados, sem separador (ex:
  // "1123847676") — a formatação combinada é usada para preencher o campo de
  // telefone do pedido; DDD/número separados (fase 24) alimentam o formulário
  // de cadastro de cliente no Omie, que exige os dois campos à parte.
  const telefoneDigitos =
    typeof dados.ddd_telefone_1 === 'string' ? dados.ddd_telefone_1.replace(/\D/g, '') : ''
  const telefoneDdd = telefoneDigitos.length >= 10 ? telefoneDigitos.slice(0, 2) : null
  const telefoneNumero = telefoneDigitos.length >= 10 ? telefoneDigitos.slice(2) : null

  const cliente: ClienteReceita = {
    razaoSocial,
    nomeFantasia,
    telefone: telefoneDigitos || null,
    telefoneDdd,
    telefoneNumero,
    logradouro: textoOuNulo(dados.logradouro),
    numero: textoOuNulo(dados.numero),
    bairro: textoOuNulo(dados.bairro),
    municipio: textoOuNulo(dados.municipio),
    uf: textoOuNulo(dados.uf),
    cep: textoOuNulo(dados.cep),
  }

  return NextResponse.json({ encontrado: true, cliente })
}
