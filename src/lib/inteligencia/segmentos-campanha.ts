import type { ClienteInteligencia } from './agregar'

// Segmentos automáticos de campanha (fase 36 + disparo assistido de
// WhatsApp) — extraído de SegmentacaoCampanhas.tsx pra ser reaproveitado
// também na lista de disparo de uma campanha já salva (CampanhasTab.tsx):
// os dois precisam do mesmo texto sugerido por segmento, sem duplicar.

export type SegmentoId = 'churn' | 'esfriando' | 'inativos' | 'upsell'

export interface Segmento {
  id: SegmentoId
  titulo: string
  corCard: string
  corTitulo: string
  descricao: string
  filtro: (c: ClienteInteligencia) => boolean
  textoSugerido: (c: ClienteInteligencia) => string
}

export const SEGMENTOS: Segmento[] = [
  {
    id: 'churn',
    titulo: '🔴 Risco de Churn',
    corCard: 'border-accent-danger/30 bg-accent-danger/10',
    corTitulo: 'text-accent-danger',
    descricao: 'Clientes com alerta de churn ativo — pararam de comprar no ritmo normal.',
    filtro: (c) => c.emRiscoChurn,
    textoSugerido: (c) =>
      `Olá${c.contato ? ' ' + c.contato : ''}! Notamos que faz um tempo desde sua última compra com a gente${
        c.diasDesdeUltimaCompra ? ` (${c.diasDesdeUltimaCompra} dias)` : ''
      }. Está tudo bem? Temos novidades que podem te interessar — vamos conversar?`,
  },
  {
    id: 'esfriando',
    titulo: '🟡 Esfriando',
    corCard: 'border-accent-alert/30 bg-accent-alert/10',
    corTitulo: 'text-accent-alert',
    descricao: 'Temperatura amarela — relacionamento esfriando, ainda dá tempo de reaquecer.',
    filtro: (c) => c.temperaturaAutomatica === 'amarelo',
    textoSugerido: (c) =>
      `Oi${c.contato ? ' ' + c.contato : ''}, tudo bem? Faz um tempinho que não conversamos — separei algumas novidades da RHOCAL que fazem sentido pro seu negócio. Posso te mandar?`,
  },
  {
    id: 'inativos',
    titulo: '⚪ Inativos',
    corCard: 'border-white/15 bg-white/5',
    corTitulo: 'text-muted',
    descricao: 'Sem dado recente de interação — candidatos a reengajamento.',
    filtro: (c) => c.temperaturaAutomatica === 'cinza',
    textoSugerido: (c) =>
      `Olá${c.contato ? ' ' + c.contato : ''}! Já faz um tempo que não temos contato. Gostaríamos de retomar — temos condições especiais pra clientes como você. Podemos agendar uma conversa rápida?`,
  },
  {
    id: 'upsell',
    titulo: '🟢 Oportunidade de Upsell',
    corCard: 'border-accent-success/30 bg-accent-success/10',
    corTitulo: 'text-accent-success',
    descricao: 'Temperatura verde + score de propensão alto — momento bom pra oferecer mais.',
    filtro: (c) => c.temperaturaAutomatica === 'verde' && c.scorePropensao >= 70,
    textoSugerido: (c) =>
      `Oi${c.contato ? ' ' + c.contato : ''}! Vi que você é cliente frequente da RHOCAL${
        c.itensMaisComprados?.[0] ? ` (principalmente ${c.itensMaisComprados[0].descricao})` : ''
      }. Temos itens complementares que combinam com o que você já compra — posso te apresentar?`,
  },
]

export function segmentoPorId(id: string | null | undefined): Segmento | null {
  return SEGMENTOS.find((s) => s.id === id) ?? null
}

// Mensagem padrão pra campanhas salvas fora de um segmento automático (ex:
// "Salvar como campanha" a partir de filtros manuais em vez de um dos 4
// cartões de SegmentacaoCampanhas) — mesmo tom, sem depender de um `filtro`
// específico já que aqui o critério de inclusão foi livre.
export function mensagemPadraoCampanha(cliente: ClienteInteligencia): string {
  return `Olá${cliente.contato ? ' ' + cliente.contato : ''}! Aqui é da RHOCAL. Temos novidades que podem te interessar — posso te contar mais?`
}

// Resolve o texto sugerido pra um cliente dentro de uma campanha já salva:
// usa o texto do segmento automático quando a campanha nasceu de um (fase
// 36.3 grava `filtros_aplicados: { segmento: seg.id }`), senão cai na
// mensagem padrão — cobre também campanhas salvas via filtros manuais.
export function obterMensagemCampanha(
  filtrosAplicados: Record<string, unknown> | null,
  cliente: ClienteInteligencia,
): string {
  const segmento = segmentoPorId(filtrosAplicados?.segmento as string | undefined)
  return segmento ? segmento.textoSugerido(cliente) : mensagemPadraoCampanha(cliente)
}
