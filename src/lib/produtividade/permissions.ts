// Aba Produtividade: gestor (equipe inteira + edição de metas) e comercial
// (só o próprio resultado). Compras não participa — mesma regra de
// Tarefas/Oportunidades.
import type { SetorTipo } from '@/types/database'

export function podeAcessarProdutividade(setor: SetorTipo): boolean {
  return setor === 'comercial' || setor === 'gestor'
}
