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

// Máscara progressiva de telefone brasileiro, aplicada a cada tecla digitada:
// (XX) XXXX-XXXX (fixo, 10 dígitos) ou (XX) XXXXX-XXXX (celular, 11 dígitos).
// Só formata dígitos — texto colado com letras/símbolos é limpo antes.
export function formatarTelefoneInput(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 11)
  if (digitos.length === 0) return ''
  if (digitos.length <= 2) return `(${digitos}`
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`
  if (digitos.length <= 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
}
