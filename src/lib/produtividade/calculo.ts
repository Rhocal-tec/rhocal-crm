// Agregação da aba Produtividade (mês a mês, por vendedora e da equipe).
// Tudo automático a partir de `pedidos` + marcos do funil reconstruídos do
// audit_log (fn_pedidos_marcos) + tarefas/oportunidades — nada é digitado,
// exceto as metas.
//
// Critérios (validados com o usuário antes de implementar):
// - Faturado: pedido que PASSOU por PEDIDO_EFETUADO (ou ENTREGUE), com a
//   data da PRIMEIRA passagem dentro do mês — independe do status atual,
//   porque o job de 7 dias arquiva pedidos já efetuados. Um orçamento criado
//   em agosto e efetuado em setembro é faturamento de setembro.
// - Propostas montadas: pedidos criados no mês (orç. diretos + normais).
// - Não faturados / pendentes / cancelados: status atual dos pedidos CRIADOS
//   no mês —
//     não faturado = APROVADO_CLIENTE (cliente aprovou, compra ainda não feita)
//     pendente     = PEDIDO, EM_COTACAO, PEDIDO_COTADO
//     cancelado    = PERDIDO + ARQUIVADO que nunca foi efetuado
// - Conversão (coorte): das propostas criadas no mês, quantas já chegaram a
//   efetuado (em qualquer data) ÷ total de propostas do mês. Nunca passa de
//   100% e sobe à medida que os pedidos do mês fecham.
// - Grupo "Orçamentos e Pedidos": Orçamentos = propostas; Cotados /
//   Aprovados / Efetuados / Entregues = pedidos que CHEGARAM a essa etapa (ou
//   a uma posterior) com a data da primeira chegada no mês — nunca o status
//   atual, pro funil não encolher. Efetuados = mesma conta do Faturado.
// - Atribuição por criado_por (quem vendeu — diferente do "Entregues" do
//   Analítico, que é de quem operacionalizou). Valor = Σ preco_venda ×
//   quantidade dos itens não excluídos, sem frete.
import { atribuirOportunidade } from '@/lib/oportunidades/atribuicao'
import { classificarPrazo } from '@/lib/tarefas/prazo'
import type { PedidoStatus } from '@/types/database'

export interface PedidoProdutividade {
  id: string
  criado_por: string
  criado_em: string
  status: PedidoStatus
}

// Primeira chegada do pedido a cada etapa (ou posterior) — fn_pedidos_marcos.
export interface MarcosPedido {
  cotado_em: string | null
  aprovado_em: string | null
  efetuado_em: string | null
  entregue_em: string | null
}

export interface MetricasProdutividade {
  propostas: number
  propostasValor: number
  faturados: number
  faturadoValor: number
  naoFaturados: number
  naoFaturadoValor: number
  pendentes: number
  pendentesValor: number
  perdidos: number
  arquivadosSemEfetuar: number
  // Propostas do mês que já chegaram a efetuado (numerador da conversão).
  propostasConvertidas: number
  // Chegaram à etapa (ou posterior) no mês. Efetuados = `faturados`.
  cotados: number
  aprovados: number
  entregues: number
}

export function novasMetricas(): MetricasProdutividade {
  return {
    propostas: 0,
    propostasValor: 0,
    faturados: 0,
    faturadoValor: 0,
    naoFaturados: 0,
    naoFaturadoValor: 0,
    pendentes: 0,
    pendentesValor: 0,
    perdidos: 0,
    arquivadosSemEfetuar: 0,
    propostasConvertidas: 0,
    cotados: 0,
    aprovados: 0,
    entregues: 0,
  }
}

export function cancelados(m: MetricasProdutividade): number {
  return m.perdidos + m.arquivadosSemEfetuar
}

// Conversão da coorte em % (inteiro); null quando não há propostas.
export function taxaConversao(m: MetricasProdutividade): number | null {
  if (m.propostas === 0) return null
  return Math.round((m.propostasConvertidas / m.propostas) * 100)
}

const STATUS_PENDENTE: PedidoStatus[] = ['PEDIDO', 'EM_COTACAO', 'PEDIDO_COTADO']

// Limites do mês no fuso local (Brasil), como instantes — comparados com os
// timestamptz vindos do banco via Date.parse, sem depender do fuso da sessão
// do Postgres.
export function limitesDoMes(ano: number, mes: number): { inicio: Date; fim: Date } {
  return { inicio: new Date(ano, mes - 1, 1), fim: new Date(ano, mes, 1) }
}

function dentro(iso: string | null, inicio: Date, fim: Date): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  return t >= inicio.getTime() && t < fim.getTime()
}

// Data local em 'YYYY-MM-DD' — mesmo formato das colunas `date` (data_prevista).
export function dataISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Algum marco do pedido cai no mês? (usado pra buscar pedidos criados em
// outro mês que avançaram de etapa neste.)
export function temMarcoNoMes(m: MarcosPedido, inicio: Date, fim: Date): boolean {
  return (
    dentro(m.cotado_em, inicio, fim) ||
    dentro(m.aprovado_em, inicio, fim) ||
    dentro(m.efetuado_em, inicio, fim) ||
    dentro(m.entregue_em, inicio, fim)
  )
}

export function agregarProdutividade(params: {
  pedidos: PedidoProdutividade[]
  marcos: Map<string, MarcosPedido>
  valorPorPedido: Map<string, number>
  inicio: Date
  fim: Date
}): { porFuncionario: Map<string, MetricasProdutividade>; equipe: MetricasProdutividade } {
  const { pedidos, marcos, valorPorPedido, inicio, fim } = params
  const porFuncionario = new Map<string, MetricasProdutividade>()
  const equipe = novasMetricas()

  const somar = (funcionarioId: string, aplicar: (m: MetricasProdutividade) => void) => {
    let m = porFuncionario.get(funcionarioId)
    if (!m) {
      m = novasMetricas()
      porFuncionario.set(funcionarioId, m)
    }
    aplicar(m)
    aplicar(equipe)
  }

  for (const p of pedidos) {
    const valor = valorPorPedido.get(p.id) ?? 0
    const marco = marcos.get(p.id)
    const efetuado = marco?.efetuado_em ?? null

    if (dentro(efetuado, inicio, fim)) {
      somar(p.criado_por, (m) => {
        m.faturados += 1
        m.faturadoValor += valor
      })
    }
    if (marco) {
      const cotado = dentro(marco.cotado_em, inicio, fim)
      const aprovado = dentro(marco.aprovado_em, inicio, fim)
      const entregue = dentro(marco.entregue_em, inicio, fim)
      if (cotado || aprovado || entregue) {
        somar(p.criado_por, (m) => {
          if (cotado) m.cotados += 1
          if (aprovado) m.aprovados += 1
          if (entregue) m.entregues += 1
        })
      }
    }

    if (!dentro(p.criado_em, inicio, fim)) continue

    somar(p.criado_por, (m) => {
      m.propostas += 1
      m.propostasValor += valor
      // Status atual também vale como prova de efetuação (salvaguarda pra
      // pedido sem rastro no audit_log).
      if (efetuado || p.status === 'PEDIDO_EFETUADO' || p.status === 'ENTREGUE') {
        m.propostasConvertidas += 1
      } else if (p.status === 'APROVADO_CLIENTE') {
        m.naoFaturados += 1
        m.naoFaturadoValor += valor
      } else if (STATUS_PENDENTE.includes(p.status)) {
        m.pendentes += 1
        m.pendentesValor += valor
      } else if (p.status === 'PERDIDO') {
        m.perdidos += 1
      } else if (p.status === 'ARQUIVADO') {
        m.arquivadosSemEfetuar += 1
      }
    })
  }

  return { porFuncionario, equipe }
}

// ===== Grupo "Tarefas e Oportunidades" =====
// Tarefas por responsável (mesmo critério do "Minha fila"), de qualquer
// vínculo. Mês de referência de uma tarefa = mês da data prevista; sem data
// prevista, mês de criação. Classificação por prazo = classificarPrazo, a
// mesma das pills do FunilBoard (Hoje/Futuras/Atrasadas são relativas a
// hoje — num mês passado, o que ficou pendente aparece como Atrasada).
// Concluídas = só Realizada (Cancelada não é produtividade e não entra em
// nenhum contador). Nova Tarefa = criadas no mês (criado_em), com qualquer
// data prevista.
//
// Oportunidades = registros de `oportunidades` (não tarefas), atribuídos
// pela regra compartilhada de lib/oportunidades/atribuicao.ts, com
// atividade no mês: criadas ou movimentadas no mês, ou com alguma tarefa
// (não cancelada) no mês. Concluídas = das atribuídas, as que viraram
// GANHO no mês (data = ultima_movimentacao — exata só depois da migração
// 0033; antes dela é aproximação).

export interface TarefaProdutividade {
  id: string
  oportunidade_id: string | null
  responsavel: string | null
  situacao: string
  data_prevista: string | null
  criado_em: string
  descricao: string
  cliente_nome: string | null
}

export interface OportunidadeProdutividade {
  id: string
  criado_por: string
  criado_em: string
  status: string
  ultima_movimentacao: string
  cliente_nome: string
}

export interface TarefaAtrasada {
  id: string
  descricao: string
  cliente: string | null
  dataPrevista: string
}

export interface MetricasTarefas {
  novaTarefa: number
  hoje: number
  futuras: number
  concluidas: number
  atrasadas: number
  oportunidades: number
  oportunidadesConcluidas: number
  atrasadasLista: TarefaAtrasada[]
}

export function novasMetricasTarefas(): MetricasTarefas {
  return {
    novaTarefa: 0,
    hoje: 0,
    futuras: 0,
    concluidas: 0,
    atrasadas: 0,
    oportunidades: 0,
    oportunidadesConcluidas: 0,
    atrasadasLista: [],
  }
}

export function agregarTarefasOportunidades(params: {
  // Tarefas com data prevista no mês OU criadas no mês (a query já recorta).
  tarefasPeriodo: TarefaProdutividade[]
  // Todas as tarefas vinculadas a oportunidade da empresa, sem recorte —
  // base da atribuição (foto de quem está tocando cada oportunidade).
  tarefasDeOportunidade: TarefaProdutividade[]
  oportunidades: OportunidadeProdutividade[]
  inicio: Date
  fim: Date
}): { porFuncionario: Map<string, MetricasTarefas>; equipe: MetricasTarefas } {
  const { tarefasPeriodo, tarefasDeOportunidade, oportunidades, inicio, fim } = params
  const inicioISO = dataISO(inicio)
  const fimISO = dataISO(fim)
  const porFuncionario = new Map<string, MetricasTarefas>()
  const equipe = novasMetricasTarefas()
  const nomeOportunidade = new Map(oportunidades.map((o) => [o.id, o.cliente_nome]))

  // Soma sempre na equipe; na pessoa só quando há responsável.
  const somar = (responsavel: string | null, aplicar: (m: MetricasTarefas) => void) => {
    aplicar(equipe)
    if (!responsavel) return
    let m = porFuncionario.get(responsavel)
    if (!m) {
      m = novasMetricasTarefas()
      porFuncionario.set(responsavel, m)
    }
    aplicar(m)
  }

  const noMes = (t: Pick<TarefaProdutividade, 'data_prevista' | 'criado_em'>) => {
    const data = t.data_prevista?.slice(0, 10)
    return data ? data >= inicioISO && data < fimISO : dentro(t.criado_em, inicio, fim)
  }

  for (const t of tarefasPeriodo) {
    if (dentro(t.criado_em, inicio, fim)) {
      somar(t.responsavel, (m) => {
        m.novaTarefa += 1
      })
    }
    if (t.situacao === 'Cancelada' || !noMes(t)) continue
    if (t.situacao === 'Realizada') {
      somar(t.responsavel, (m) => {
        m.concluidas += 1
      })
      continue
    }
    const prazo = classificarPrazo(t)
    if (prazo === 'HOJE') {
      somar(t.responsavel, (m) => {
        m.hoje += 1
      })
    } else if (prazo === 'FUTURAS') {
      somar(t.responsavel, (m) => {
        m.futuras += 1
      })
    } else if (prazo === 'ATRASADAS') {
      const item: TarefaAtrasada = {
        id: t.id,
        descricao: t.descricao,
        cliente: t.cliente_nome ?? (t.oportunidade_id ? nomeOportunidade.get(t.oportunidade_id) ?? null : null),
        dataPrevista: t.data_prevista?.slice(0, 10) ?? '',
      }
      somar(t.responsavel, (m) => {
        m.atrasadas += 1
        m.atrasadasLista.push(item)
      })
    }
  }

  const tarefasPorOportunidade = new Map<string, TarefaProdutividade[]>()
  for (const t of tarefasDeOportunidade) {
    if (!t.oportunidade_id) continue
    const lista = tarefasPorOportunidade.get(t.oportunidade_id) ?? []
    lista.push(t)
    tarefasPorOportunidade.set(t.oportunidade_id, lista)
  }

  for (const o of oportunidades) {
    const tarefas = tarefasPorOportunidade.get(o.id) ?? []
    const ativa =
      dentro(o.criado_em, inicio, fim) ||
      dentro(o.ultima_movimentacao, inicio, fim) ||
      tarefas.some((t) => t.situacao !== 'Cancelada' && noMes(t))
    if (!ativa) continue
    const { responsavel } = atribuirOportunidade(tarefas, o.criado_por)
    const ganhaNoMes = o.status === 'GANHO' && dentro(o.ultima_movimentacao, inicio, fim)
    somar(responsavel, (m) => {
      m.oportunidades += 1
      if (ganhaNoMes) m.oportunidadesConcluidas += 1
    })
  }

  for (const m of Array.from(porFuncionario.values()).concat(equipe)) {
    m.atrasadasLista.sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista))
  }
  return { porFuncionario, equipe }
}
