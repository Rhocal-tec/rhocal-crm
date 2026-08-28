// Formata campos de data pura (Postgres `date`, sem hora/timezone) sem passar
// por `Date`, evitando o off-by-one causado por interpretar 'YYYY-MM-DD' como
// meia-noite UTC e depois converter para o fuso local (Brasil fica um dia atrás).
export function formatarDataSomente(valor: string | null): string {
  if (!valor) return '—'
  const [ano, mes, dia] = valor.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return '—'
  return `${dia}/${mes}/${ano}`
}

// Combina uma data pura (Postgres `date`) com um horário 'HH:MM' opcional
// (tarefas.hora_prevista, fase 39). Com hora preenchida: "15/09 às 10:31"
// (sem o ano — leitura rápida no card/lista de tarefas). Sem hora: cai no
// formato de data completo (DD/MM/AAAA).
export function formatarDataHoraPrevista(
  data: string | null,
  hora: string | null,
): string {
  if (!data) return '—'
  const [ano, mes, dia] = data.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return '—'
  const horaLimpa = typeof hora === 'string' ? hora.trim() : ''
  if (/^\d{1,2}:\d{2}/.test(horaLimpa)) {
    return `${dia}/${mes} às ${horaLimpa.slice(0, 5)}`
  }
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

// Máscara progressiva de CNPJ, aplicada a cada tecla digitada: XX.XXX.XXX/XXXX-XX.
// Só formata dígitos — texto colado com pontuação é limpo antes.
export function formatarCnpjInput(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 14)
  if (digitos.length === 0) return ''
  if (digitos.length <= 2) return digitos
  if (digitos.length <= 5) return `${digitos.slice(0, 2)}.${digitos.slice(2)}`
  if (digitos.length <= 8) return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5)}`
  if (digitos.length <= 12) {
    return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8)}`
  }
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`
}
