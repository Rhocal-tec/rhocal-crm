// Opções fixas do log de tentativas de contato (fase 32.1) — colunas `tipo`/
// `resultado` são text livre no banco, listas aqui são só de conveniência na UI.
export const TIPO_INTERACAO_OPCOES = ['Ligação', 'WhatsApp', 'E-mail', 'Reunião'] as const

export const RESULTADO_INTERACAO_OPCOES = [
  'Atendeu',
  'Não atendeu',
  'Agendou retorno',
  'Recusou',
  'Outro',
] as const
