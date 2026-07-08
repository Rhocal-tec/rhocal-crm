// Regras de quem pode mover pedidos para qual coluna (valores internos do enum).
// GESTOR pode mover qualquer card para qualquer coluna, em qualquer direção.
import type { PedidoStatus, SetorTipo } from '@/types/database'

const DESTINOS_PERMITIDOS: Record<SetorTipo, PedidoStatus[] | 'TODAS'> = {
  comercial: ['APROVADO_CLIENTE', 'ARQUIVADO'],
  compras: ['EM_COTACAO', 'PEDIDO_COTADO', 'PEDIDO_EFETUADO'],
  gestor: 'TODAS',
}

export function podeMoverPara(setor: SetorTipo, destino: PedidoStatus): boolean {
  const permitidos = DESTINOS_PERMITIDOS[setor]
  if (permitidos === 'TODAS') return true
  return permitidos.includes(destino)
}
