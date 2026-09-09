// Regras de quem pode mover pedidos para qual coluna (valores internos do enum).
// GESTOR pode mover qualquer card para qualquer coluna, em qualquer direção.
import type { PedidoStatus, SetorTipo } from '@/types/database'

const DESTINOS_PERMITIDOS: Record<SetorTipo, PedidoStatus[] | 'TODAS'> = {
  // Comercial move livremente entre as colunas "dele", exceto EM_COTACAO
  // (território ativo do Compras + trava somente-leitura da fase 29 tranca o
  // comercial fora do próprio card) e PEDIDO_EFETUADO (afirmação factual que
  // só o Compras faz; alimenta conversão/recompra; quase-terminal).
  comercial: ['PEDIDO', 'PEDIDO_COTADO', 'APROVADO_CLIENTE', 'ARQUIVADO'],
  compras: ['EM_COTACAO', 'PEDIDO_COTADO', 'PEDIDO_EFETUADO'],
  gestor: 'TODAS',
}

export function podeMoverPara(setor: SetorTipo, destino: PedidoStatus): boolean {
  const permitidos = DESTINOS_PERMITIDOS[setor]
  if (permitidos === 'TODAS') return true
  return permitidos.includes(destino)
}
