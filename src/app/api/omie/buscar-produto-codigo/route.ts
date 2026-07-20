import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const codigo = typeof body?.codigo === 'string' ? body.codigo.trim() : ''
  if (!codigo) {
    return NextResponse.json({ erro: 'Código do produto não informado.' }, { status: 400 })
  }

  try {
    let resultado: Record<string, unknown>
    try {
      // ConsultarProduto busca um único produto pelo identificador exato —
      // aceita codigo_produto (id interno do Omie) OU codigo (SKU cadastrado).
      // Diferente de ListarProdutos, não existe filtro de "código exato" lá
      // (a API rejeita filtrar_codigo com fault SOAP-ENV:Client-5001).
      resultado = await chamarOmie(OMIE_PRODUTOS_URL, 'ConsultarProduto', {
        codigo_produto: 0,
        codigo,
      })
    } catch (err) {
      // "Código do Produto não cadastrado para o Código [...]" é a forma como
      // o Omie sinaliza "não encontrado" para esta chamada — trata como tal.
      const mensagem = err instanceof Error ? err.message : ''
      if (mensagem.toLowerCase().includes('não cadastrado')) {
        return NextResponse.json({ encontrado: false })
      }
      throw err
    }

    const produto: ProdutoOmie = {
      codigoProduto: resultado.codigo_produto as number,
      codigo: resultado.codigo as string,
      descricao: resultado.descricao as string,
    }

    return NextResponse.json({ encontrado: true, produto })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
