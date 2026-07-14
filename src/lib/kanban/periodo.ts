// Cálculo de intervalos de data para o filtro de período do painel executivo.
// Datas em 'YYYY-MM-DD', tratadas em UTC como eixo neutro (mesma convenção de
// filtro-data.ts) para não sofrer off-by-one por causa do fuso local.
export type PeriodoPreset = 'mes_atual' | '30d' | '90d' | 'personalizado'

export interface RangePeriodo {
  inicio: string | null
  fim: string | null
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function deslocarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function calcularRangePeriodo(
  preset: PeriodoPreset,
  personalizado: RangePeriodo,
): RangePeriodo {
  const hoje = hojeISO()

  if (preset === 'mes_atual') {
    const [ano, mes] = hoje.split('-')
    return { inicio: `${ano}-${mes}-01`, fim: hoje }
  }
  if (preset === '30d') {
    return { inicio: deslocarDias(hoje, -29), fim: hoje }
  }
  if (preset === '90d') {
    return { inicio: deslocarDias(hoje, -89), fim: hoje }
  }
  return personalizado
}
