// Regras de acesso ao kanban de Tarefas (fase 33). Compras não participa da
// pré-venda — mesma regra de oportunidades/permissions.ts.
import type { SetorTipo } from '@/types/database'

export function podeAcessarTarefas(setor: SetorTipo): boolean {
  return setor === 'comercial' || setor === 'gestor'
}
