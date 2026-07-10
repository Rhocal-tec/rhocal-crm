import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Nunca expor OMIE_APP_KEY/OMIE_APP_SECRET no client — só lidas aqui, server-side.
const OMIE_CLIENTES_URL = 'https://app.omie.com.br/api/v1/geral/clientes/'
const OMIE_PEDIDO_URL = 'https://app.omie.com.br/api/v1/produtos/pedido/'
const OMIE_CATEGORIAS_URL = 'https://app.omie.com.br/api/v1/geral/categorias/'
const OMIE_CONTA_CORRENTE_URL = 'https://app.omie.com.br/api/v1/geral/contacorrente/'

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

// Cache simples em memória do processo — evita chamar ListarCategorias a cada
// orçamento gerado. Sem TTL: a categoria financeira padrão da conta Omie não
// muda com frequência: reiniciar o servidor já é o suficiente para renovar.
let categoriaReceitaCache: string | null = null

// Busca a primeira categoria financeira do tipo RECEITA cadastrada na conta
// Omie, para usar como codigo_categoria padrão dos orçamentos gerados pelo CRM.
async function obterCategoriaReceitaPadrao(): Promise<string> {
  if (categoriaReceitaCache) return categoriaReceitaCache

  const resultado = await chamarOmie(OMIE_CATEGORIAS_URL, 'ListarCategorias', {
    pagina: 1,
    registros_por_pagina: 50,
    filtrar_apenas_ativo: 'S',
    filtrar_por_tipo: 'R',
  })

  const bruto = Array.isArray(resultado.categoria_cadastro) ? resultado.categoria_cadastro : []
  const receita = bruto.find((cat: Record<string, unknown>) => {
    if (cat.totalizadora === 'S') return false // categoria de agrupamento, não usável diretamente
    if (cat.nao_exibir === 'S') return false
    if (cat.conta_inativa === 'S') return false
    if (cat.conta_receita !== undefined && cat.conta_receita !== 'S') return false
    return true
  })

  const codigo = receita?.codigo
  if (typeof codigo !== 'string' || !codigo) {
    throw new Error(
      'Não foi possível determinar a categoria financeira no Omie. Contate o administrador da conta Omie para verificar o cadastro de categorias.',
    )
  }

  categoriaReceitaCache = codigo
  return codigo
}

// Mesmo cache simples em memória do processo, para a conta corrente padrão.
let contaCorrentePadraoCache: { codigo: number; descricao: string } | null = null

// Busca a primeira conta corrente ATIVA cadastrada na conta Omie, para usar
// como codigo_conta_corrente padrão dos orçamentos gerados pelo CRM.
async function obterContaCorrentePadrao(): Promise<{ codigo: number; descricao: string }> {
  if (contaCorrentePadraoCache) return contaCorrentePadraoCache

  const resultado = await chamarOmie(OMIE_CONTA_CORRENTE_URL, 'ListarContasCorrentes', {
    pagina: 1,
    registros_por_pagina: 50,
    apenas_importado_api: 'N',
  })

  const bruto = Array.isArray(resultado.ListarContasCorrentes)
    ? resultado.ListarContasCorrentes
    : []
  const ativa = bruto.find((c: Record<string, unknown>) => c.inativo !== 'S')

  const codigo = ativa?.nCodCC
  if (typeof codigo !== 'number') {
    throw new Error(
      'Não foi possível determinar a conta corrente no Omie. Contate o administrador da conta Omie para verificar o cadastro de contas correntes.',
    )
  }

  contaCorrentePadraoCache = { codigo, descricao: (ativa.descricao as string) ?? '' }
  return contaCorrentePadraoCache
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

      let resultado: Record<string, unknown>
      try {
        resultado = await chamarOmie(OMIE_CLIENTES_URL, 'ListarClientes', {
          pagina: 1,
          registros_por_pagina: 10,
          apenas_importado_api: 'N',
          clientesFiltro: { razao_social: clienteNome },
        })
      } catch (err) {
        // O Omie sinaliza "nenhum cliente bate com o filtro" como uma falha
        // (faultstring "Não existem registros para a página...") em vez de uma
        // lista vazia. Trata como resultado vazio — outros erros (credenciais,
        // rede, etc.) continuam propagando normalmente.
        const mensagem = err instanceof Error ? err.message : ''
        if (mensagem.toLowerCase().includes('não existem registros')) {
          return NextResponse.json({ clientes: [] })
        }
        throw err
      }

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
      // Defesa extra além da trava no client: nenhum item pode ir pro Omie
      // sem estar vinculado a um produto cadastrado lá.
      const itemSemProduto = itens.find((item) => item.codigo_produto_omie === null)
      if (itemSemProduto) {
        return NextResponse.json(
          {
            erro: `Todos os itens precisam estar vinculados a um produto do Omie antes de gerar o orçamento. Falta vincular: "${itemSemProduto.descricao}".`,
          },
          { status: 400 },
        )
      }

      const codigoCategoria = await obterCategoriaReceitaPadrao()
      const contaCorrente = await obterContaCorrentePadrao()

      const resultado = await chamarOmie(OMIE_PEDIDO_URL, 'IncluirPedido', {
        // codigo_parcela/quantidade_parcelas não pertencem a "cabecalho" — são
        // campos de condição de pagamento (bloco "condicao_pagamento") e não
        // são necessários para um orçamento simples.
        cabecalho: {
          codigo_cliente: codigoClienteOmie ?? 0,
          data_previsao: formatarDataOmie(new Date()),
          // "00" = Orçamento (não Pedido de Venda completo).
          etapa: '00',
          origem_pedido: 'API',
          // Identificador único nosso, exigido pelo Omie para rastrear/evitar
          // duplicidade — não é o codigo_pedido (esse é gerado pelo Omie na resposta).
          codigo_pedido_integracao: `RHOCAL-CRM-${pedido.numero}`,
        },
        det: itens.map((item, index) => ({
          // Identificador único do item na nossa integração, exigido pelo
          // Omie — mesmo papel do codigo_pedido_integracao, mas por item.
          ide: {
            codigo_item_integracao: `RHOCAL-CRM-${pedido.numero}-${index + 1}`,
          },
          produto: {
            codigo_produto: item.codigo_produto_omie,
            descricao: item.descricao,
            quantidade: Number(item.quantidade),
            valor_unitario: Number(item.preco_venda),
          },
        })),
        informacoes_adicionais: {
          consumidor_final: 'S',
          codigo_categoria: codigoCategoria,
          codigo_conta_corrente: contaCorrente.codigo,
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
