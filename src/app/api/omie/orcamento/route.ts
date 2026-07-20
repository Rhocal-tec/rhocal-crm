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

// A resposta de ConsultarPedido devolve, dentro de cabecalho e de cada
// det.ide, campos calculados/de auditoria (numero_pedido, sequencial,
// codigo_item, etc.) que a própria documentação do Omie marca como
// "preenchimento automático - não informar" — só que, diferente de
// total_pedido/infoCadastro/exportacao (que ficam fora desses blocos e por
// isso é fácil não reenviar), esses ficam misturados com campos válidos
// dentro de cabecalho/ide. Reenviá-los faz o AlterarPedidoVenda rejeitar a
// chamada inteira (ex: "A tag [numero_pedido] não deve ser enviada na
// alteração!"). Allowlist explícita em vez de excluir campo por campo — mais
// seguro contra campos novos que a Omie venha a adicionar no futuro.
const CABECALHO_CAMPOS_ENTRADA = [
  'codigo_pedido',
  'codigo_pedido_integracao',
  'codigo_cliente',
  'codigo_cliente_integracao',
  'data_previsao',
  'etapa',
  'codigo_parcela',
  'qtde_parcelas',
  'codigo_cenario_impostos',
  'tipo_desconto_pedido',
  'perc_desconto_pedido',
  'valor_desconto_pedido',
  'nao_gerar_boleto',
] as const

const IDE_CAMPOS_ENTRADA = ['codigo_item_integracao', 'simples_nacional', 'acao_item'] as const

function filtrarCamposEntrada(
  origem: Record<string, unknown>,
  campos: readonly string[],
): Record<string, unknown> {
  const filtrado: Record<string, unknown> = {}
  for (const campo of campos) {
    if (origem[campo] !== undefined) filtrado[campo] = origem[campo]
  }
  return filtrado
}

// Mesma lógica para cada item de "det": mantém ide/produto/observacao/inf_adic
// (campos de entrada válidos), descarta os campos calculados de "ide", e
// nunca reenvia o bloco "imposto" — a própria documentação recomenda omiti-lo
// para o Omie recalcular os impostos, em vez de travar valores computados
// numa consulta anterior (que aqui vieram todos zerados, por ser um orçamento
// simples sem cenário fiscal definido).
function filtrarItemEntrada(item: Record<string, unknown>): Record<string, unknown> {
  const filtrado: Record<string, unknown> = {}
  const ide = item.ide as Record<string, unknown> | undefined
  if (ide) filtrado.ide = filtrarCamposEntrada(ide, IDE_CAMPOS_ENTRADA)
  if (item.produto) filtrado.produto = item.produto
  if (item.observacao) filtrado.observacao = item.observacao
  if (item.inf_adic) filtrado.inf_adic = item.inf_adic
  return filtrado
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

    if (body.acao === 'converter_pedido_venda') {
      const pedidoId = typeof body.pedidoId === 'string' ? body.pedidoId : null
      if (!pedidoId) {
        return NextResponse.json({ erro: 'Pedido não informado.' }, { status: 400 })
      }

      const condicao = body.condicaoPagamento as
        | { tipo: 'a_vista'; dataVencimento?: unknown }
        | { tipo: 'parcelado'; numeroParcelas?: unknown; intervaloDias?: unknown }
        | undefined
      if (!condicao || (condicao.tipo !== 'a_vista' && condicao.tipo !== 'parcelado')) {
        return NextResponse.json({ erro: 'Condição de pagamento inválida.' }, { status: 400 })
      }

      const { data: pedido, error: erroPedido } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id', pedidoId)
        .single()

      if (erroPedido || !pedido) {
        return NextResponse.json({ erro: 'Pedido não encontrado.' }, { status: 404 })
      }
      if (pedido.status !== 'APROVADO_CLIENTE') {
        return NextResponse.json(
          { erro: 'O pedido precisa estar em PEDIDO APROVADO para ser convertido em Pedido de Venda.' },
          { status: 409 },
        )
      }
      if (pedido.omie_orcamento_id === null) {
        return NextResponse.json(
          { erro: 'Este pedido ainda não tem um orçamento gerado no Omie.' },
          { status: 409 },
        )
      }
      if (pedido.omie_convertido_pedido) {
        return NextResponse.json(
          { erro: 'Este pedido já foi convertido em Pedido de Venda.' },
          { status: 409 },
        )
      }
      // O Omie aceita codigo_cliente = 0 ("sem vincular cliente") ao criar um
      // orçamento, mas exige um cliente real ao converter em Pedido de Venda
      // (fault "O preenchimento das tags [codigo_cliente] ou
      // [codigo_cliente_integracao] é obrigatório!"). O client já deve
      // vincular um cliente antes de chegar aqui — checagem de defesa.
      if (pedido.cliente_omie_id === null) {
        return NextResponse.json(
          {
            erro:
              'Este pedido precisa estar vinculado a um cliente cadastrado no Omie antes de virar Pedido de Venda.',
          },
          { status: 409 },
        )
      }

      // Monta o esqueleto das parcelas (percentual + prazo) a partir da
      // condição de pagamento escolhida manualmente pelo comercial nesta
      // conversão — nunca um padrão fixo. O valor em R$ de cada parcela só dá
      // pra calcular depois de saber o total do pedido (mais abaixo).
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)

      let parcelasBase: { numero_parcela: number; percentual: number; quantidade_dias: number }[]
      if (condicao.tipo === 'a_vista') {
        const dataVencimento =
          typeof condicao.dataVencimento === 'string' ? condicao.dataVencimento : ''
        if (!dataVencimento) {
          return NextResponse.json({ erro: 'Informe a data de vencimento.' }, { status: 400 })
        }
        const vencimento = new Date(`${dataVencimento}T00:00:00`)
        if (Number.isNaN(vencimento.getTime())) {
          return NextResponse.json({ erro: 'Data de vencimento inválida.' }, { status: 400 })
        }
        const dias = Math.max(0, Math.round((vencimento.getTime() - hoje.getTime()) / 86400000))
        parcelasBase = [{ numero_parcela: 1, percentual: 100, quantidade_dias: dias }]
      } else {
        const numeroParcelas = Number(condicao.numeroParcelas)
        const intervaloDias = Number(condicao.intervaloDias)
        if (!Number.isFinite(numeroParcelas) || numeroParcelas < 2 || numeroParcelas > 999) {
          return NextResponse.json({ erro: 'Número de parcelas inválido.' }, { status: 400 })
        }
        if (!Number.isFinite(intervaloDias) || intervaloDias <= 0) {
          return NextResponse.json(
            { erro: 'Informe um intervalo em dias maior que zero entre as parcelas.' },
            { status: 400 },
          )
        }
        // Divide o percentual igualmente entre as parcelas, jogando o
        // arredondamento (centavos) inteiro pra última — garante que a soma
        // bate exatamente 100%, como o Omie exige.
        const percentualBase = Math.floor((100 / numeroParcelas) * 100) / 100
        parcelasBase = Array.from({ length: numeroParcelas }, (_, i) => ({
          numero_parcela: i + 1,
          percentual:
            i === numeroParcelas - 1
              ? Math.round((100 - percentualBase * (numeroParcelas - 1)) * 100) / 100
              : percentualBase,
          quantidade_dias: intervaloDias * (i + 1),
        }))
      }

      // Busca o pedido como está hoje no Omie — preserva qualquer edição feita
      // manualmente lá (endereço, frete, itens) em vez de reconstruir tudo do
      // zero a partir do nosso banco, que poderia estar desatualizado.
      const atual = await chamarOmie(OMIE_PEDIDO_URL, 'ConsultarPedido', {
        codigo_pedido: pedido.omie_orcamento_id,
      })
      const pedidoOmie = atual.pedido_venda_produto as Record<string, unknown> | undefined
      if (!pedidoOmie || !pedidoOmie.cabecalho || !pedidoOmie.det) {
        return NextResponse.json(
          { erro: 'Não foi possível consultar o pedido no Omie antes de convertê-lo.' },
          { status: 502 },
        )
      }

      // total_pedido é "preenchimento automático - não informar" (não
      // reenviamos), mas soma quantidade × valor_unitário de cada item dá o
      // mesmo valor e serve pra calcular o "valor" (R$) de cada parcela —
      // campo obrigatório em "parcela", separado do "percentual".
      const totalPedido = (pedidoOmie.det as Record<string, unknown>[]).reduce((soma, item) => {
        const produto = item.produto as Record<string, unknown> | undefined
        const quantidade = Number(produto?.quantidade ?? 0)
        const valorUnitario = Number(produto?.valor_unitario ?? 0)
        return soma + quantidade * valorUnitario
      }, 0)
      if (!(totalPedido > 0)) {
        return NextResponse.json(
          { erro: 'Não foi possível calcular o valor total do pedido para montar as parcelas.' },
          { status: 502 },
        )
      }

      // Completa cada parcela com "valor" (R$) e "data_vencimento" — os dois
      // também obrigatórios e ausentes até aqui. O valor é derivado do
      // percentual, com o arredondamento (centavos) jogado pra última parcela
      // pra bater exatamente o total, em vez de acumular diferença de centavos.
      let valorAcumulado = 0
      const parcelas = parcelasBase.map((p, i) => {
        const vencimento = new Date(hoje)
        vencimento.setDate(vencimento.getDate() + p.quantidade_dias)
        const ehUltima = i === parcelasBase.length - 1
        const valor = ehUltima
          ? Math.round((totalPedido - valorAcumulado) * 100) / 100
          : Math.round(((totalPedido * p.percentual) / 100) * 100) / 100
        valorAcumulado += valor
        return { ...p, valor, data_vencimento: formatarDataOmie(vencimento) }
      })

      const codigoCategoria = await obterCategoriaReceitaPadrao()
      const contaCorrente = await obterContaCorrentePadrao()

      // Só os campos de ENTRADA aceitos por AlterarPedidoVenda — nunca reenviar
      // os blocos que o próprio Omie devolve como calculados/de auditoria na
      // consulta (total_pedido, infoCadastro, exportacao): a documentação do
      // Omie marca esses como "preenchimento automático - não informar", e
      // reenviá-los arriscaria corromper o pedido.
      const detEntrada = Array.isArray(pedidoOmie.det)
        ? pedidoOmie.det.map((item) => filtrarItemEntrada(item as Record<string, unknown>))
        : pedidoOmie.det

      const payload: Record<string, unknown> = {
        cabecalho: {
          ...filtrarCamposEntrada(
            pedidoOmie.cabecalho as Record<string, unknown>,
            CABECALHO_CAMPOS_ENTRADA,
          ),
          // "10" = "Pedido de Venda" nesta conta — confirmado via
          // ListarEtapasFaturamento (operação "Venda de Produto"), não assumido.
          etapa: '10',
          codigo_parcela: '999',
          qtde_parcelas: parcelas.length,
          // Sempre a partir do nosso banco, nunca do que o Omie devolveu na
          // consulta: se o orçamento foi gerado sem vincular cliente,
          // codigo_cliente volta como 0 e a conversão falha (ver checagem
          // acima). Como cliente_omie_id já foi validado como não-nulo, este
          // é sempre um código de cliente real.
          codigo_cliente: pedido.cliente_omie_id,
        },
        det: detEntrada,
        informacoes_adicionais: {
          ...(pedidoOmie.informacoes_adicionais as Record<string, unknown>),
          codigo_categoria: codigoCategoria,
          codigo_conta_corrente: contaCorrente.codigo,
          // codVend (vendedor) e codProj (projeto) são referências opcionais
          // a cadastros que podem ter sido desativados desde que o orçamento
          // foi criado — confirmado ao vivo com "O vendedor está inativo!
          // - tag: [codVend]" ao reenviar o codVend antigo do pedido. Omitir
          // (undefined some do JSON.stringify) em vez de arriscar reenviar
          // uma referência que virou inválida.
          codVend: undefined,
          codProj: undefined,
        },
        lista_parcelas: { parcela: parcelas },
      }
      if (pedidoOmie.frete) payload.frete = pedidoOmie.frete
      if (Array.isArray(pedidoOmie.departamentos) && pedidoOmie.departamentos.length > 0) {
        payload.departamentos = pedidoOmie.departamentos
      }
      if (pedidoOmie.observacoes) payload.observacoes = pedidoOmie.observacoes

      await chamarOmie(OMIE_PEDIDO_URL, 'AlterarPedidoVenda', payload)

      const { error: erroUpdate } = await supabase
        .from('pedidos')
        .update({ omie_convertido_pedido: true })
        .eq('id', pedidoId)

      if (erroUpdate) {
        return NextResponse.json(
          {
            erro:
              'O pedido foi convertido no Omie, mas houve um erro ao atualizar o status no CRM. Recarregue a página para conferir.',
          },
          { status: 500 },
        )
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
