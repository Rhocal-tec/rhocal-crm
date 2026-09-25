// Agregação da aba Produtividade (mês a mês, por vendedora e da equipe).
// Tudo automático a partir de `pedidos` + data de efetuação reconstruída do
// audit_log (fn_pedidos_efetuados) — nada é digitado, exceto as metas.
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
// - Atribuição por criado_por. Valor = Σ preco_venda × quantidade dos itens
//   não excluídos, sem frete (mesmo critério do Analítico por funcionário).
import type { PedidoStatus } from '@/types/database'

export interface PedidoProdutividade {
  id: string
  criado_por: string
  criado_em: string
  status: PedidoStatus
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

function dentro(iso: string, inicio: Date, fim: Date): boolean {
  const t = Date.parse(iso)
  return t >= inicio.getTime() && t < fim.getTime()
}

export function agregarProdutividade(params: {
  pedidos: PedidoProdutividade[]
  efetuadoEm: Map<string, string>
  valorPorPedido: Map<string, number>
  inicio: Date
  fim: Date
}): { porFuncionario: Map<string, MetricasProdutividade>; equipe: MetricasProdutividade } {
  const { pedidos, efetuadoEm, valorPorPedido, inicio, fim } = params
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
    const efetuado = efetuadoEm.get(p.id) ?? null

    if (efetuado && dentro(efetuado, inicio, fim)) {
      somar(p.criado_por, (m) => {
        m.faturados += 1
        m.faturadoValor += valor
      })
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
