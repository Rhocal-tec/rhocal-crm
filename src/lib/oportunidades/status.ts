// Mapeamento entre o status do funil de Oportunidades (banco, text livre — não
// enum, ver tipos) e os nomes exibidos na UI. Etapas provisórias (fase 31);
// podem precisar de ajuste após investigar as Fases do Processo do Omie.
import type { OportunidadeStatus } from '@/types/database'

export const OPORTUNIDADE_STATUS_LABELS: Record<OportunidadeStatus, string> = {
  NOVO_LEAD: 'Novo Lead',
  EM_CONTATO: 'Em Contato',
  QUALIFICADO: 'Qualificado',
  PROPOSTA: 'Proposta Enviada',
  GANHO: 'Convertida em Orçamento',
  PERDIDO: 'Perdida',
}

// Colunas visíveis no kanban de Oportunidades, nesta ordem. GANHO e PERDIDO
// são terminais e não aparecem como coluna arrastável — GANHO só é alcançado
// via "Converter em Orçamento" e PERDIDO via "Marcar como perdida" (motivo
// obrigatório), nunca por drag-and-drop manual.
export const OPORTUNIDADE_KANBAN_COLUMNS: OportunidadeStatus[] = [
  'NOVO_LEAD',
  'EM_CONTATO',
  'QUALIFICADO',
  'PROPOSTA',
]

export const OPORTUNIDADE_STATUS_STRIPE_VAR: Record<OportunidadeStatus, string> = {
  NOVO_LEAD: '--accent-compras',
  EM_CONTATO: '--accent-compras',
  QUALIFICADO: '--accent-alert',
  PROPOSTA: '--accent-primary',
  GANHO: '--accent-success',
  PERDIDO: '--accent-danger',
}
