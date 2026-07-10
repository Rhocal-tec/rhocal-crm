// Formata campos de data pura (Postgres `date`, sem hora/timezone) sem passar
// por `Date`, evitando o off-by-one causado por interpretar 'YYYY-MM-DD' como
// meia-noite UTC e depois converter para o fuso local (Brasil fica um dia atrás).
export function formatarDataSomente(valor: string | null): string {
  if (!valor) return '—'
  const [ano, mes, dia] = valor.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return '—'
  return `${dia}/${mes}/${ano}`
}

// Aceita string além de number porque o Postgres/PostgREST devolve colunas
// `numeric` como string (ex: "150.00") para não perder precisão — sem essa
// coerção, valor.toLocaleString(...) em uma string ignora as opções de
// currency/locale (String.prototype.toLocaleString não formata) e o valor sai
// cru na tela.
export function formatarMoeda(valor: number | string | null): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  const numero = typeof valor === 'number' ? valor : Number(valor)
  if (!Number.isFinite(numero)) return '—'
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
