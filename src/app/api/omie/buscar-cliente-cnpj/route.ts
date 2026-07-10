import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Nunca expor OMIE_APP_KEY/OMIE_APP_SECRET no client — só lidas aqui, server-side.
const OMIE_CLIENTES_URL = 'https://app.omie.com.br/api/v1/geral/clientes/'

interface ClienteOmie {
  codigoClienteOmie: number
  razaoSocial: string
  nomeFantasia: string | null
  cnpjCpf: string | null
}

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
      { erro: 'Seu perfil não pode buscar clientes no Omie.' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const cnpj = typeof body?.cnpj === 'string' ? body.cnpj.replace(/\D/g, '') : ''
  if (cnpj.length !== 14) {
    return NextResponse.json({ erro: 'CNPJ inválido.' }, { status: 400 })
  }

  try {
    let resultado: Record<string, unknown>
    try {
      resultado = await chamarOmie(OMIE_CLIENTES_URL, 'ListarClientes', {
        pagina: 1,
        registros_por_pagina: 1,
        apenas_importado_api: 'N',
        clientesFiltro: { cnpj_cpf: cnpj },
      })
    } catch (err) {
      // O Omie sinaliza "nenhum cliente bate com o filtro" como uma falha
      // (faultstring "Não existem registros para a página...") em vez de uma
      // lista vazia. Trata como "não encontrado" — outros erros (credenciais,
      // rede, etc.) continuam propagando normalmente.
      const mensagem = err instanceof Error ? err.message : ''
      if (mensagem.toLowerCase().includes('não existem registros')) {
        return NextResponse.json({ encontrado: false })
      }
      throw err
    }

    const bruto = Array.isArray(resultado.clientes_cadastro) ? resultado.clientes_cadastro : []
    if (bruto.length === 0) {
      return NextResponse.json({ encontrado: false })
    }

    const c = bruto[0] as Record<string, unknown>
    const cliente: ClienteOmie = {
      codigoClienteOmie: c.codigo_cliente_omie as number,
      razaoSocial: c.razao_social as string,
      nomeFantasia: (c.nome_fantasia as string) ?? null,
      cnpjCpf: (c.cnpj_cpf as string) ?? null,
    }

    return NextResponse.json({ encontrado: true, cliente })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
