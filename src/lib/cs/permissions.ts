// Módulo CS (pós-venda). Visível a todos os perfis, mas cada um vê só o que
// lhe cabe: CS e gestor operam tudo; comercial e compras só recebem repasses e
// reclamações destinados à sua área.
import type { SetorTipo } from '@/types/database'

export function podeAcessarCS(setor: SetorTipo): boolean {
  return setor === 'cs' || setor === 'gestor' || setor === 'comercial' || setor === 'compras'
}

// Fila do dia, atendimento e pesquisa: só a CS e a diretoria.
export function podeAtenderCS(setor: SetorTipo): boolean {
  return setor === 'cs' || setor === 'gestor'
}

// Regras de prazo (cs_config): só a diretoria edita.
export function podeEditarRegrasCS(setor: SetorTipo): boolean {
  return setor === 'gestor'
}

// Kanban de pedidos, Busca e Arquivados: o perfil CS não usa.
export function podeUsarKanban(setor: SetorTipo): boolean {
  return setor !== 'cs'
}

// Aba Inteligência, Recompra, Tarefas etc. seguem suas próprias regras (cs fica de fora).
