// Mapeamento entre o enum pedido_status (banco) e os nomes exibidos na UI.
// NUNCA renomear o enum no banco — só a exibição muda aqui.
import type { ArquivoMotivo, PedidoStatus } from '@/types/database'

export const STATUS_LABELS: Record<PedidoStatus, string> = {
  PEDIDO: 'ORÇAMENTO',
  EM_COTACAO: 'ORÇAMENTO EM COTAÇÃO',
  PEDIDO_COTADO: 'ORÇAMENTO COTADO',
  APROVADO_CLIENTE: 'PEDIDO APROVADO',
  PEDIDO_EFETUADO: 'PEDIDO EFETUADO',
  ARQUIVADO: 'ARQUIVADO',
}

// Colunas visíveis no kanban principal, nesta ordem. ARQUIVADO fica de fora
// (terá página própria com busca).
export const KANBAN_COLUMNS: PedidoStatus[] = [
  'PEDIDO',
  'EM_COTACAO',
  'PEDIDO_COTADO',
  'APROVADO_CLIENTE',
  'PEDIDO_EFETUADO',
]

export const MOTIVO_ARQUIVAMENTO_LABELS: Record<ArquivoMotivo, string> = {
  manual: 'Manual',
  inatividade: 'Inatividade (7 dias sem movimentação)',
}

// Cor da faixa diagonal no topo de cada coluna do kanban (nome da CSS variable
// de design system, ver globals.css). ARQUIVADO não aparece no kanban ativo.
export const STATUS_STRIPE_VAR: Partial<Record<PedidoStatus, string>> = {
  PEDIDO: '--accent-primary',
  EM_COTACAO: '--accent-compras',
  PEDIDO_COTADO: '--accent-compras',
  APROVADO_CLIENTE: '--accent-success',
  PEDIDO_EFETUADO: '--accent-success',
}
