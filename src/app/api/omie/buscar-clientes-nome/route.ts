import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'

// Nunca expor OMIE_APP_KEY/OMIE_APP_SECRET no client — só lidas aqui, server-side.
const OMIE_CLIENTES_URL = 'https://app.omie.com.br/api/v1/geral/clientes/'

// O Omie trata fornecedores dentro do mesmo cadastro de clientes — a
// distinção é feita por uma tag no registro (ex: { tag: "Fornecedor" }),
// não por um campo/endpoint separado.
const TAG_FORNECEDOR = 'fornecedor'

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

  if (!profile) {
    return NextResponse.json({ erro: 'Seu perfil não pode buscar clientes no Omie.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const nome = typeof body?.nome === 'string' ? body.nome.trim() : ''
  const apenasFornecedor = body?.apenasFornecedor === true

  // O próprio Omie exige mínimo de 3 caracteres em razao_social (fault
  // SOAP-ENV:Client-1010 abaixo desse tamanho) — valida antes de chamar.
  if (nome.length < 3) {
    return NextResponse.json({ clientes: [] })
  }

  try {
    let resultado: Record<string, unknown>
    try {
      // clientesFiltro.razao_social faz correspondência parcial (contém),
      // sem distinção de maiúsculas/minúsculas — confirmado empiricamente,
      // não documentado explicitamente no portal do desenvolvedor Omie.
      resultado = await chamarOmie(OMIE_CLIENTES_URL, 'ListarClientes', {
        pagina: 1,
        registros_por_pagina: 20,
        apenas_importado_api: 'N',
        clientesFiltro: { razao_social: nome },
      })
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : ''
      if (mensagem.toLowerCase().includes('não existem registros')) {
        return NextResponse.json({ clientes: [] })
      }
      throw err
    }

    const bruto = Array.isArray(resultado.clientes_cadastro) ? resultado.clientes_cadastro : []

    const filtrado = apenasFornecedor
      ? bruto.filter((c: Record<string, unknown>) => {
          const tags = Array.isArray(c.tags) ? c.tags : []
          return tags.some(
            (t: Record<string, unknown>) =>
              typeof t.tag === 'string' && t.tag.toLowerCase() === TAG_FORNECEDOR,
          )
        })
      : bruto

    const clientes: ClienteOmie[] = filtrado.map((c: Record<string, unknown>) => ({
      codigoClienteOmie: c.codigo_cliente_omie as number,
      razaoSocial: c.razao_social as string,
      nomeFantasia: (c.nome_fantasia as string) ?? null,
      cnpjCpf: (c.cnpj_cpf as string) ?? null,
    }))

    return NextResponse.json({ clientes })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    await registrarErro(supabase, {
      rota: '/api/omie/buscar-clientes-nome',
      mensagem,
      colaboradorId: user.id,
    })
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
