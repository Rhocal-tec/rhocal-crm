// Formata campos de data pura (Postgres `date`, sem hora/timezone) sem passar
// por `Date`, evitando o off-by-one causado por interpretar 'YYYY-MM-DD' como
// meia-noite UTC e depois converter para o fuso local (Brasil fica um dia atrás).
export function formatarDataSomente(valor: string | null): string {
  if (!valor) return '—'
  const [ano, mes, dia] = valor.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return '—'
  return `${dia}/${mes}/${ano}`
}

export function formatarMoeda(valor: number | null): string {
  if (valor === null || valor === undefined) return '—'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
