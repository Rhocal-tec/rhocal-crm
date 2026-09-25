// Dias úteis do mês pra aba Produtividade: segunda a sexta, menos feriados
// NACIONAIS (fixos + Sexta-feira Santa e Corpus Christi, calculados a partir
// da Páscoa). Feriado municipal (Barueri) e emendas NÃO entram aqui de
// propósito — o gestor ajusta o número do mês na tela de metas
// (metas_comerciais.dias_uteis_ajuste), em vez de cravarmos um calendário
// municipal no código.
//
// Datas tratadas em UTC como eixo neutro (mesma convenção de periodo.ts),
// só pra saber o dia da semana — nenhum horário envolvido.

// Feriados nacionais de data fixa (MM-DD). 20/11 (Consciência Negra) é
// nacional desde 2024.
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
function pascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(ano, mes - 1, dia))
}

function chaveMesDia(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function deslocar(d: Date, dias: number): Date {
  const copia = new Date(d)
  copia.setUTCDate(copia.getUTCDate() + dias)
  return copia
}

function feriadosNacionais(ano: number): Set<string> {
  const p = pascoa(ano)
  return new Set([
    ...FERIADOS_FIXOS,
    chaveMesDia(deslocar(p, -2)), // Sexta-feira Santa
    chaveMesDia(deslocar(p, 60)), // Corpus Christi
  ])
}

// Dias úteis do mês (1 a `ateDia`, inclusive; sem `ateDia` = mês inteiro).
// `mes` é 1-12.
export function contarDiasUteis(ano: number, mes: number, ateDia?: number): number {
  const feriados = feriadosNacionais(ano)
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const limite = Math.min(ateDia ?? ultimoDia, ultimoDia)
  let total = 0
  for (let dia = 1; dia <= limite; dia++) {
    const d = new Date(Date.UTC(ano, mes - 1, dia))
    const semana = d.getUTCDay()
    if (semana === 0 || semana === 6) continue
    if (feriados.has(chaveMesDia(d))) continue
    total++
  }
  return total
}

export interface DiasUteisMes {
  total: number
  decorridos: number
  restantes: number
  // true quando o total veio do ajuste manual do gestor.
  ajustado: boolean
}

// Total do mês (ajuste manual do gestor tem prioridade) + quantos já
// passaram até hoje. Mês passado: decorridos = total; mês futuro: 0.
// Com ajuste manual, os decorridos são limitados ao total ajustado (o ajuste
// não diz QUAIS dias saíram, então a proporção até hoje é aproximada).
export function calcularDiasUteisMes(
  ano: number,
  mes: number,
  ajuste: number | null,
  hoje: Date = new Date(),
): DiasUteisMes {
  const totalCalendario = contarDiasUteis(ano, mes)
  const total = ajuste ?? totalCalendario

  const anoHoje = hoje.getFullYear()
  const mesHoje = hoje.getMonth() + 1
  if (ano < anoHoje || (ano === anoHoje && mes < mesHoje)) {
    return { total, decorridos: total, restantes: 0, ajustado: ajuste !== null }
  }
  if (ano > anoHoje || (ano === anoHoje && mes > mesHoje)) {
    return { total, decorridos: 0, restantes: total, ajustado: ajuste !== null }
  }
  // Mês corrente: "decorridos" conta hoje (a média diária já considera o dia
  // em andamento); "restantes" também conta hoje (ainda dá pra faturar hoje).
  const decorridos = Math.min(contarDiasUteis(ano, mes, hoje.getDate()), total)
  const ateOntem = Math.min(contarDiasUteis(ano, mes, hoje.getDate() - 1), total)
  return { total, decorridos, restantes: total - ateOntem, ajustado: ajuste !== null }
}
