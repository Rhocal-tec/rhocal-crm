// Quem está tocando uma oportunidade — `oportunidades` não tem coluna de
// responsável, então a atribuição vem das tarefas vinculadas. Regra única,
// compartilhada pelo "Oport. em Andamento" do Analítico por funcionário e
// pelos contadores de oportunidades da aba Produtividade:
//   1. responsável da tarefa ABERTA (Pendente/Em Execução) mais recente —
//      quem deve agir em seguida;
//   2. sem tarefa aberta: responsável da última tarefa Realizada
//      (Canceladas não contam);
//   3. tarefa escolhida sem responsável (comum nas importadas do Omie):
//      null = "não atribuído" — não volta pra uma tarefa mais antiga, que
//      poderia apontar alguém que já saiu do caso;
//   4. nenhuma tarefa: criado_por (Novo Lead/Cadastro rápido não criam
//      tarefa).
// "Mais recente" = maior criado_em.
import { situacaoTerminal } from '@/lib/tarefas/situacao'

export type OrigemAtribuicao = 'tarefa_aberta' | 'tarefa_concluida' | 'criador'

export interface TarefaParaAtribuicao {
  responsavel: string | null
  situacao: string
  criado_em: string
}

export function atribuirOportunidade<T extends TarefaParaAtribuicao>(
  tarefas: T[],
  criadoPor: string,
): { responsavel: string | null; origem: OrigemAtribuicao; tarefaAberta: T | null } {
  const validas = tarefas.filter((t) => t.situacao !== 'Cancelada')
  const maisRecente = (lista: T[]) =>
    lista.reduce<T | null>((atual, t) => (!atual || t.criado_em > atual.criado_em ? t : atual), null)

  const tarefaAberta = maisRecente(validas.filter((t) => !situacaoTerminal(t.situacao)))
  if (tarefaAberta) return { responsavel: tarefaAberta.responsavel, origem: 'tarefa_aberta', tarefaAberta }

  const concluida = maisRecente(validas.filter((t) => t.situacao === 'Realizada'))
  if (concluida) return { responsavel: concluida.responsavel, origem: 'tarefa_concluida', tarefaAberta: null }

  return { responsavel: criadoPor, origem: 'criador', tarefaAberta: null }
}
