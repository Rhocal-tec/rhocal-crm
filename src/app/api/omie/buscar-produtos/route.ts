import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'

// Nunca expor OMIE_APP_KEY/OMIE_APP_SECRET no client — só lidas aqui, server-side.
const OMIE_PRODUTOS_URL = 'https://app.omie.com.br/api/v1/geral/produtos/'

interface ProdutoOmie {
  codigoProduto: number
  codigo: string
  descricao: string
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
      { erro: 'Seu perfil não pode buscar produtos no Omie.' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const descricao = typeof body?.descricao === 'string' ? body.descricao.trim() : ''
  if (!descricao) {
    return NextResponse.json({ erro: 'Descrição do produto não informada.' }, { status: 400 })
  }

  try {
    let resultado: Record<string, unknown>
    try {
      resultado = await chamarOmie(OMIE_PRODUTOS_URL, 'ListarProdutos', {
        pagina: 1,
        registros_por_pagina: 10,
        apenas_importado_api: 'N',
        filtrar_apenas_omiepdv: 'N',
        // Wildcard de "contém" suportado pela API do Omie para este campo.
        filtrar_apenas_descricao: `%${descricao}%`,
      })
    } catch (err) {
      // Mesmo padrão dos outros endpoints de busca: "nenhum registro" vem como
      // falha (faultstring), não como lista vazia — trata como resultado vazio.
      const mensagem = err instanceof Error ? err.message : ''
      if (mensagem.toLowerCase().includes('não existem registros')) {
        return NextResponse.json({ produtos: [] })
      }
      throw err
    }

    const bruto = Array.isArray(resultado.produto_servico_cadastro)
      ? resultado.produto_servico_cadastro
      : []
    const produtos: ProdutoOmie[] = bruto.map((p: Record<string, unknown>) => ({
      codigoProduto: p.codigo_produto as number,
      codigo: p.codigo as string,
      descricao: p.descricao as string,
    }))

    return NextResponse.json({ produtos })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    await registrarErro(supabase, {
      rota: '/api/omie/buscar-produtos',
      mensagem,
      colaboradorId: user.id,
    })
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
