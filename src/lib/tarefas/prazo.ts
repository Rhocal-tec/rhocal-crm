// Classificação do kanban de Tarefas por PRAZO (fase 33) — diferente do Omie,
// que agrupa tarefas por situação. As 4 colunas aqui são calculadas a partir
// de data_prevista/situacao, nunca movidas manualmente (sem drag-and-drop).
import { situacaoTerminal } from './situacao'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']

export type PrazoBucket = 'ATRASADAS' | 'HOJE' | 'FUTURAS' | 'CONCLUIDAS'

export const PRAZO_COLUNAS: PrazoBucket[] = ['ATRASADAS', 'HOJE', 'FUTURAS', 'CONCLUIDAS']

export const PRAZO_LABELS: Record<PrazoBucket, string> = {
  ATRASADAS: 'Atrasadas',
  HOJE: 'Hoje',
  FUTURAS: 'Futuras',
  CONCLUIDAS: 'Concluídas',
}

export const PRAZO_STRIPE_VAR: Record<PrazoBucket, string> = {
  ATRASADAS: '--accent-danger',
  HOJE: '--accent-alert',
  FUTURAS: '--accent-compras',
  CONCLUIDAS: '--accent-success',
}

function hojeISO(): string {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

// Tarefa Realizada ou Cancelada (situações terminais, fase 40) sempre cai em
// Concluídas, independente da data — o badge distingue as duas. Tarefa sem
// data_prevista (campo opcional) entra em Futuras — não é uma pendência com
// prazo vencido. Comparação por string 'YYYY-MM-DD' (sem passar por Date)
// evita o off-by-one de fuso horário já documentado em formatarDataSomente
// (lib/kanban/formatacao.ts).
export function classificarPrazo(
  tarefa: Pick<Tarefa, 'situacao' | 'data_prevista'>,
): PrazoBucket {
  if (situacaoTerminal(tarefa.situacao)) return 'CONCLUIDAS'

  const data = tarefa.data_prevista?.slice(0, 10)
  if (!data) return 'FUTURAS'

  const hoje = hojeISO()
  if (data < hoje) return 'ATRASADAS'
  if (data === hoje) return 'HOJE'
  return 'FUTURAS'
}
