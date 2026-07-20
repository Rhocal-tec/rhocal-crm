// Alerta de cotação atrasada: card em EM_COTACAO (ORÇAMENTO EM COTAÇÃO) sem
// movimentação há 2h+ vira vermelho, com prioridade sobre o alerta âmbar
// padrão de 3 dias — só se aplica enquanto o pedido está nessa coluna.
import type { PedidoStatus } from '@/types/database'

const LIMITE_HORAS_COTACAO_ATRASADA = 2

export function horasSemMovimentacao(ultimaMovimentacao: string): number {
  const inicio = new Date(ultimaMovimentacao).getTime()
  const agora = Date.now()
  return Math.max(0, (agora - inicio) / (1000 * 60 * 60))
}

export function cotacaoAtrasada(status: PedidoStatus, ultimaMovimentacao: string): boolean {
  return (
    status === 'EM_COTACAO' &&
    horasSemMovimentacao(ultimaMovimentacao) >= LIMITE_HORAS_COTACAO_ATRASADA
  )
}
