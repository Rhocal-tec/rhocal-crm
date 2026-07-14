// Compara `validade_cotacao` (date pura, YYYY-MM-DD) com a data de hoje via
// comparação de string, pelo mesmo motivo de formatarDataSomente: evita o
// off-by-one de interpretar a string como UTC meia-noite ao passar por `Date`.
// Datas em formato ISO 'YYYY-MM-DD' ordenam lexicograficamente igual à ordem
// cronológica, então a comparação de string é segura aqui.
export function cotacaoVencida(validade: string | null): boolean {
  if (!validade) return false
  const hoje = new Date().toISOString().slice(0, 10)
  return validade.slice(0, 10) < hoje
}
