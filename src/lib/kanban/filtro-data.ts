export type ModoFiltroData = 'nenhum' | 'especifica' | 'intervalo'

// Soma 1 dia a uma data 'YYYY-MM-DD' sem passar pelo fuso local (usa UTC como
// eixo neutro só para a aritmética de calendário).
export function proximoDia(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
