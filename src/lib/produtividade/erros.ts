// Mensagens de erro da aba Produtividade — específicas em vez de "tente
// novamente", pra causa aparecer na tela sem precisar abrir o console.

function codigo(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code
}

// Tabela/função da migração 0032 ainda não criada no Supabase (PostgREST
// responde "not found in the schema cache"; Postgres, "does not exist").
export function faltaMigracao(err: unknown): boolean {
  const c = codigo(err)
  return c === 'PGRST202' || c === 'PGRST205' || c === '42P01' || c === '42883'
}

export const MENSAGEM_FALTA_MIGRACAO =
  'A aba Produtividade ainda não foi ativada no banco: rode a migração supabase/migrations/0032_produtividade_metas.sql no SQL Editor do Supabase e recarregue a página.'

export function mensagemErroSalvarMetas(err: unknown): string {
  if (faltaMigracao(err)) return MENSAGEM_FALTA_MIGRACAO
  // RLS de metas_comerciais: insert/update só com meu_setor() = 'gestor'.
  if (codigo(err) === '42501') return 'Sem permissão para salvar metas — só o perfil gestor pode editar.'
  const detalhe = (err as { message?: string } | null)?.message
  return detalhe ? `Não foi possível salvar as metas: ${detalhe}` : 'Não foi possível salvar as metas. Tente novamente.'
}
