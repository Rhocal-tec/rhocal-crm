// Regras de acesso à aba "Hora de Recomprar" (/recompra). Compras não
// participa da pré-venda — mesma regra de oportunidades/tarefas.
import type { SetorTipo } from '@/types/database'

export function podeAcessarRecompra(setor: SetorTipo): boolean {
  return setor === 'comercial' || setor === 'gestor'
}
