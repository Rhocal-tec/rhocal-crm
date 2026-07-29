import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'
import { chamarOmie, resolverCredenciaisOmie } from '@/lib/omie/chamar-omie'

// Nunca expor OMIE_APP_KEY_*/OMIE_APP_SECRET_* no client — só lidas aqui, server-side.
const OMIE_PRODUTOS_URL = 'https://app.omie.com.br/api/v1/geral/produtos/'

interface ProdutoOmie {
  codigoProduto: number
  codigo: string
  descricao: string
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
    const credenciais = await resolverCredenciaisOmie(supabase, body)

    let resultado: Record<string, unknown>
    try {
      // ConsultarProduto busca um único produto pelo identificador exato —
      // aceita codigo_produto (id interno do Omie) OU codigo (SKU cadastrado).
      // Diferente de ListarProdutos, não existe filtro de "código exato" lá
      // (a API rejeita filtrar_codigo com fault SOAP-ENV:Client-5001).
      resultado = await chamarOmie(
        OMIE_PRODUTOS_URL,
        'ConsultarProduto',
        {
          codigo_produto: 0,
          codigo,
        },
        credenciais,
      )
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
    await registrarErro(supabase, {
      rota: '/api/omie/buscar-produto-codigo',
      mensagem,
      colaboradorId: user.id,
    })
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
