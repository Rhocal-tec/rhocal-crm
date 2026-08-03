// Regras de acesso ao módulo de Oportunidades/Prospecção (fase 31).
// Compras não participa dessa etapa pré-venda — só comercial e gestor.
import type { SetorTipo } from '@/types/database'

export function podeAcessarOportunidades(setor: SetorTipo): boolean {
  return setor === 'comercial' || setor === 'gestor'
}

// Diferente do kanban de pedidos, aqui não há divisão comercial/compras por
// coluna — qualquer perfil com acesso ao módulo pode mover livremente entre
// as etapas ativas do funil. GANHO/PERDIDO são alcançados só por ação
// explícita (converter/marcar perdida), nunca por drag-and-drop.
export function podeMoverOportunidade(setor: SetorTipo): boolean {
  return podeAcessarOportunidades(setor)
}
