// Badge visual dos três estados da tarefa (fase 39). `situacao` é text livre
// no banco — 'Em Execução' entrou junto do cEmExecucao do ListarTarefas, e
// qualquer outro valor cai no visual de 'Pendente'. Cores literais (não os
// tokens --accent-*) conforme especificado na fase 39: Pendente cinza,
// Em Execução azul (#3B7DD8, mesmo tom do accent-compras), Realizada verde.
export type SituacaoBadge = { label: string; cor: string; bg: string }

export function badgeSituacao(situacao: string | null): SituacaoBadge {
  switch (situacao) {
    case 'Em Execução':
      return { label: 'Em Execução', cor: '#3B7DD8', bg: 'rgba(59, 125, 216, 0.15)' }
    case 'Realizada':
      return { label: 'Realizada', cor: '#2FAE66', bg: 'rgba(47, 174, 102, 0.15)' }
    default:
      return { label: 'Pendente', cor: '#8A939B', bg: 'rgba(138, 147, 155, 0.15)' }
  }
}
