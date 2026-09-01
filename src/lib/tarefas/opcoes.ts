// Opções fixas do kanban de Tarefas (fase 33) — colunas `tipo`/`situacao` são
// text livre no banco, listas aqui são só de conveniência na UI (mesmo padrão
// de interacoes/opcoes.ts e oportunidades/status.ts).
export const TAREFA_TIPO_OPCOES = ['Ligação', 'WhatsApp', 'E-mail', 'Reunião', 'Outro'] as const

// Subconjunto de TAREFA_TIPO_OPCOES considerado "tentativa de contato" para o
// contador da fase 33 — mesma lista de TIPO_INTERACAO_OPCOES, mas mantida
// separada porque tarefas também tem tipos que não são contato (ex: "Outro").
export const TAREFA_TIPOS_CONTATO: string[] = ['Ligação', 'WhatsApp', 'E-mail', 'Reunião']

export const TAREFA_SITUACAO_OPCOES = ['Pendente', 'Em Execução', 'Realizada', 'Cancelada'] as const

// Fase 40.3 — lembrete configurável por tarefa (tarefas.notificar_em). A
// entrega da notificação (Telegram/WhatsApp — backlog V2) ainda não existe;
// por ora a coluna só guarda a preferência.
export const NOTIFICAR_EM_OPCOES: { valor: string; label: string }[] = [
  { valor: 'nao_notificar', label: 'Não notificar' },
  { valor: 'no_horario', label: 'No horário' },
  { valor: '15_min_antes', label: '15 min antes' },
  { valor: '30_min_antes', label: '30 min antes' },
  { valor: '1_hora_antes', label: '1 hora antes' },
  { valor: '1_dia_antes', label: '1 dia antes' },
]

export function rotuloNotificarEm(valor: string | null): string {
  return NOTIFICAR_EM_OPCOES.find((o) => o.valor === valor)?.label ?? 'Não notificar'
}
