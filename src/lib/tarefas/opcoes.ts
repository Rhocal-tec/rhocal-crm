// Opções fixas do kanban de Tarefas (fase 33) — colunas `tipo`/`situacao` são
// text livre no banco, listas aqui são só de conveniência na UI (mesmo padrão
// de interacoes/opcoes.ts e oportunidades/status.ts).
export const TAREFA_TIPO_OPCOES = ['Ligação', 'WhatsApp', 'E-mail', 'Reunião', 'Outro'] as const

// Subconjunto de TAREFA_TIPO_OPCOES considerado "tentativa de contato" para o
// contador da fase 33 — mesma lista de TIPO_INTERACAO_OPCOES, mas mantida
// separada porque tarefas também tem tipos que não são contato (ex: "Outro").
export const TAREFA_TIPOS_CONTATO: string[] = ['Ligação', 'WhatsApp', 'E-mail', 'Reunião']

export const TAREFA_SITUACAO_OPCOES = ['Pendente', 'Realizada'] as const
