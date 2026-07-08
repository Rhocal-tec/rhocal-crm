import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Nunca expor OMIE_APP_KEY/OMIE_APP_SECRET no client — só lidas aqui, server-side.
const OMIE_CLIENTES_URL = 'https://app.omie.com.br/api/v1/geral/clientes/'
const OMIE_PEDIDO_URL = 'https://app.omie.com.br/api/v1/produtos/pedido/'

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

function formatarDataOmie(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getFullYear()}`
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
      { erro: 'Seu perfil não pode gerar orçamentos no Omie.' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.acao !== 'string') {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 })
  }

  try {
    if (body.acao === 'buscar_cliente') {
      const clienteNome = typeof body.clienteNome === 'string' ? body.clienteNome.trim() : ''
      if (!clienteNome) {
        return NextResponse.json({ erro: 'Nome do cliente não informado.' }, { status: 400 })
      }

      const resultado = await chamarOmie(OMIE_CLIENTES_URL, 'ListarClientes', {
        pagina: 1,
        registros_por_pagina: 10,
        apenas_importado_api: 'N',
        clientesFiltro: { razao_social: clienteNome },
      })

      const bruto = Array.isArray(resultado.clientes_cadastro) ? resultado.clientes_cadastro : []
      const clientes: ClienteOmie[] = bruto.map((c: Record<string, unknown>) => ({
        codigoClienteOmie: c.codigo_cliente_omie as number,
        razaoSocial: c.razao_social as string,
        nomeFantasia: (c.nome_fantasia as string) ?? null,
        cnpjCpf: (c.cnpj_cpf as string) ?? null,
      }))

      return NextResponse.json({ clientes })
    }

    if (body.acao === 'criar_orcamento') {
      const pedidoId = typeof body.pedidoId === 'string' ? body.pedidoId : null
      if (!pedidoId) {
        return NextResponse.json({ erro: 'Pedido não informado.' }, { status: 400 })
      }
      const codigoClienteOmie: number | null =
        typeof body.codigoClienteOmie === 'number' ? body.codigoClienteOmie : null

      // Recarrega pedido + itens direto do banco — nunca confia em valores
      // vindos do client para montar o payload enviado ao Omie.
      const { data: pedido, error: erroPedido } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id', pedidoId)
        .single()

      if (erroPedido || !pedido) {
        return NextResponse.json({ erro: 'Pedido não encontrado.' }, { status: 404 })
      }
      // Qualquer etapa a partir da cotação — não precisa mais ser exatamente
      // PEDIDO_COTADO, já que o pedido pode ter avançado no fluxo.
      const statusPermitidos: (typeof pedido.status)[] = [
        'PEDIDO_COTADO',
        'APROVADO_CLIENTE',
        'PEDIDO_EFETUADO',
      ]
      if (!statusPermitidos.includes(pedido.status)) {
        return NextResponse.json(
          {
            erro: 'O pedido precisa ter passado pela cotação antes de gerar o orçamento no Omie.',
          },
          { status: 409 },
        )
      }

      const { data: itens, error: erroItens } = await supabase
        .from('pedido_itens')
        .select('*')
        .eq('pedido_id', pedidoId)

      if (erroItens || !itens || itens.length === 0) {
        return NextResponse.json({ erro: 'O pedido não tem itens.' }, { status: 400 })
      }
      // Number(...) normaliza o caso do Postgres devolver `numeric` como
      // string (ex: "150.00"), e trata preco_venda === 0 como não preenchido.
      const itemSemPreco = itens.find(
        (item) => item.preco_venda === null || !(Number(item.preco_venda) > 0),
      )
      if (itemSemPreco) {
        return NextResponse.json(
          { erro: `Falta preço de venda no item "${itemSemPreco.descricao}".` },
          { status: 400 },
        )
      }

      const resultado = await chamarOmie(OMIE_PEDIDO_URL, 'IncluirPedido', {
        cabecalho: {
          codigo_cliente: codigoClienteOmie ?? 0,
          data_previsao: formatarDataOmie(new Date()),
          etapa: '10',
          codigo_parcela: '999',
          quantidade_parcelas: 1,
          origem_pedido: 'API',
        },
        det: itens.map((item) => ({
          produto: {
            descricao: item.descricao,
            quantidade: Number(item.quantidade),
            valor_unitario: Number(item.preco_venda),
          },
        })),
        informacoes_adicionais: {
          consumidor_final: 'S',
        },
      })

      const codigoPedido = resultado.codigo_pedido as number | undefined
      if (!codigoPedido) {
        return NextResponse.json(
          { erro: 'O Omie não retornou um número de pedido válido.' },
          { status: 502 },
        )
      }

      return NextResponse.json({ codigoPedido })
    }

    return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
