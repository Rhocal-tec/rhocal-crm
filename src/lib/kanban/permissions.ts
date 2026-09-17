// Regras de quem pode mover pedidos para qual coluna (valores internos do enum).
// GESTOR pode mover qualquer card para qualquer coluna, em qualquer direção.
import type { PedidoStatus, SetorTipo } from '@/types/database'

const DESTINOS_PERMITIDOS: Record<SetorTipo, PedidoStatus[] | 'TODAS'> = {
  // Comercial move livremente pra qualquer coluna, igual gestor — inclusive
  // EM_COTACAO e PEDIDO_EFETUADO (territórios antes exclusivos de Compras).
  // A trava somente-leitura da fase 29 continua entrando em ação assim que o
  // pedido ESTÁ em EM_COTACAO (olha só o status atual, não quem moveu pra
  // lá) — então um comercial que arrasta o próprio card pra EM_COTACAO fica
  // travado nele até Compras mover de novo, mesmo comportamento de sempre.
  comercial: 'TODAS',
  compras: ['EM_COTACAO', 'PEDIDO_COTADO', 'PEDIDO_EFETUADO', 'ARQUIVADO', 'ENTREGUE'],
  gestor: 'TODAS',
}

export function podeMoverPara(setor: SetorTipo, destino: PedidoStatus): boolean {
  const permitidos = DESTINOS_PERMITIDOS[setor]
  if (permitidos === 'TODAS') return true
  return permitidos.includes(destino)
}
