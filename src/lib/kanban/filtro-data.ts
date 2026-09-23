export type ModoFiltroData = 'nenhum' | 'mes_atual' | 'especifica' | 'intervalo'

// Soma 1 dia a uma data 'YYYY-MM-DD' sem passar pelo fuso local (usa UTC como
// eixo neutro só para a aritmética de calendário).
export function proximoDia(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// Hoje no fuso local do navegador ('YYYY-MM-DD') — mesmo cuidado de
// classificarPrazo (lib/tarefas/prazo.ts): à noite no Brasil o UTC já virou o
// dia seguinte, então toISOString() daria a data errada.
function hojeLocalISO(): string {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

// Traduz o estado do FiltroData num intervalo de datas 'YYYY-MM-DD'
// (inclusivo nas duas pontas; qualquer ponta pode ser null = sem limite).
// Retorna null quando não há filtro a aplicar — "Sem filtro", ou data
// específica/intervalo ainda sem nenhuma data preenchida. Único lugar que
// conhece os modos: todo consumidor do FiltroData aplica o resultado daqui,
// pra um modo novo não ser ignorado em silêncio em alguma tela.
export function resolverFiltroData(
  modo: ModoFiltroData,
  dataEspecifica: string,
  dataDe: string,
  dataAte: string,
): { inicio: string | null; fim: string | null } | null {
  if (modo === 'mes_atual') {
    const hoje = hojeLocalISO()
    return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje }
  }
  if (modo === 'especifica') {
    return dataEspecifica ? { inicio: dataEspecifica, fim: dataEspecifica } : null
  }
  if (modo === 'intervalo') {
    return dataDe || dataAte ? { inicio: dataDe || null, fim: dataAte || null } : null
  }
  return null
}
