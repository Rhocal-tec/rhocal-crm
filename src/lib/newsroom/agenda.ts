import type { DataEquipe } from './tipos'

export const TIPOS_DATA: Record<string, { rotulo: string; icone: string }> = {
  aniversario: { rotulo: 'Aniversário', icone: '🎂' },
  reuniao: { rotulo: 'Reunião', icone: '👥' },
  feriado: { rotulo: 'Feriado', icone: '🏖️' },
  ferias: { rotulo: 'Férias', icone: '🌴' },
  evento: { rotulo: 'Evento', icone: '📌' },
}

function chave(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// O evento acontece neste dia? Considera anual (mesmo dia/mês) e intervalo (férias).
export function ocorreEm(e: DataEquipe, dia: Date): boolean {
  const k = chave(dia)
  if (e.anual) return e.data.slice(5, 10) === k.slice(5, 10)
  if (e.data_fim) return e.data <= k && k <= e.data_fim
  return e.data === k
}

export function eventosDoDia(datas: DataEquipe[], dia: Date): DataEquipe[] {
  return datas.filter((e) => ocorreEm(e, dia))
}

// Próximos N dias (incluindo hoje): [{dia, eventos}] só com dias que têm eventos.
export function proximosDias(datas: DataEquipe[], n: number, base: Date = new Date()) {
  const lista: { dia: Date; eventos: DataEquipe[] }[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
    const ev = eventosDoDia(datas, d)
    if (ev.length) lista.push({ dia: d, eventos: ev })
  }
  return lista
}
