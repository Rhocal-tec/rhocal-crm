// Status que tiram o pedido do kanban ativo (não aparecem em nenhuma das
// KANBAN_COLUMNS) — ARQUIVADO/PERDIDO já eram assim, ENTREGUE entra no mesmo
// grupo. Centraliza a lista pra não repetir a comparação em cada query/
// handler Realtime que precisa excluir esses três.
import type { PedidoStatus } from '@/types/database'

export const STATUS_TERMINAIS: PedidoStatus[] = ['ARQUIVADO', 'PERDIDO', 'ENTREGUE']

export function ehStatusTerminal(status: PedidoStatus): boolean {
  return (STATUS_TERMINAIS as PedidoStatus[]).includes(status)
}
