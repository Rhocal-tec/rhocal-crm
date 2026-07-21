import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'

// Nunca expor OMIE_APP_KEY/OMIE_APP_SECRET no client — só lidas aqui, server-side.
const OMIE_CLIENTES_URL = 'https://app.omie.com.br/api/v1/geral/clientes/'

// Chama a API do Omie e normaliza os dois jeitos que ela sinaliza erro:
// HTTP não-2xx, ou HTTP 200 com um corpo { faultstring, faultcode }.
async function chamarOmie(url: string, call: string, param: Record<string, unknown>) {
  const appKey = process.env.OMIE_APP_KEY
  const appSecret = process.env.OMIE_APP_SECRET
  if (!appKey || !appSecret) {
    throw new Error('Credenciais do Omie não configuradas no servidor.')
  }

  let resposta: Response
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call, app_key: appKey, app_secret: appSecret, param: [param] }),
    })
  } catch {
    throw new Error('Não foi possível conectar à API do Omie. Verifique sua conexão e tente novamente.')
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

function campoTexto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

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
      { erro: 'Seu perfil não pode cadastrar clientes no Omie.' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)

  const razaoSocial = campoTexto(body?.razaoSocial)
  const cnpj = campoTexto(body?.cnpj).replace(/\D/g, '')

  if (!razaoSocial) {
    return NextResponse.json({ erro: 'Informe a razão social.' }, { status: 400 })
  }
  if (cnpj.length !== 14) {
    return NextResponse.json({ erro: 'CNPJ inválido.' }, { status: 400 })
  }

  const nomeFantasia = campoTexto(body?.nomeFantasia) || razaoSocial
  const telefoneDdd = campoTexto(body?.telefoneDdd)
  const telefoneNumero = campoTexto(body?.telefoneNumero)
  const endereco = campoTexto(body?.endereco)
  const enderecoNumero = campoTexto(body?.enderecoNumero)
  const bairro = campoTexto(body?.bairro)
  const cidade = campoTexto(body?.cidade)
  const estado = campoTexto(body?.estado)
  const email = campoTexto(body?.email)

  // codigo_cliente_integracao com base no CNPJ (em vez de timestamp): torna a
  // chamada idempotente — se o comercial tentar cadastrar de novo o mesmo
  // CNPJ (ex: depois de uma falha de rede), o Omie atualiza o mesmo registro
  // em vez de arriscar duplicar o cadastro.
  const payload = {
    codigo_cliente_integracao: `RHOCAL-CRM-CLI-${cnpj}`,
    razao_social: razaoSocial,
    nome_fantasia: nomeFantasia,
    cnpj_cpf: cnpj,
    telefone1_ddd: telefoneDdd,
    telefone1_numero: telefoneNumero,
    endereco,
    endereco_numero: enderecoNumero,
    bairro,
    cidade,
    estado,
    email,
  }

  try {
    const resultado = await chamarOmie(OMIE_CLIENTES_URL, 'IncluirCliente', payload)

    const codigoClienteOmie = resultado.codigo_cliente_omie as number | undefined
    if (typeof codigoClienteOmie !== 'number') {
      throw new Error('O Omie não retornou o código do cliente cadastrado.')
    }

    return NextResponse.json({ codigoClienteOmie })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    await registrarErro(supabase, {
      rota: '/api/omie/cadastrar-cliente',
      mensagem,
      colaboradorId: user.id,
    })
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
