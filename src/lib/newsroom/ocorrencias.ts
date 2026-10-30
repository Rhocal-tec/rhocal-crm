import type { Comunicado, Leitura } from './tipos'

function p2(n: number): string {
  return String(n).padStart(2, '0')
}

function chaveData(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

function comHora(base: Date, hora: string | null): Date {
  const [h, m] = (hora ?? '08:00').split(':').map((x) => Number(x))
  const d = new Date(base)
  d.setHours(Number.isFinite(h) ? h : 8, Number.isFinite(m) ? m : 0, 0, 0)
  return d
}

// Chave da ocorrência atual de um aviso. '' = aviso comum (uma vez só).
// Recorrentes: chave = data da ocorrência mais recente já iniciada; null = ainda não chegou
// a primeira ocorrência (aviso não deve aparecer agora).
export function ocorrenciaAtual(c: Comunicado, agora: Date = new Date()): string | null {
  if (!c.recorrencia) return ''
  const inicio = new Date(c.inicio_em)
  let inicioOcorrencia: Date

  if (c.recorrencia === 'diaria') {
    inicioOcorrencia = comHora(agora, c.recorrencia_hora)
    if (agora < inicioOcorrencia) return null
  } else if (c.recorrencia === 'semanal') {
    const alvo = c.recorrencia_dia ?? 1
    const d = new Date(agora)
    d.setHours(0, 0, 0, 0)
    while (d.getDay() !== alvo) d.setDate(d.getDate() - 1)
    inicioOcorrencia = comHora(d, c.recorrencia_hora)
    if (inicioOcorrencia > agora) {
      d.setDate(d.getDate() - 7)
      inicioOcorrencia = comHora(d, c.recorrencia_hora)
    }
  } else {
    const dia = c.recorrencia_dia ?? 1
    const montar = (ano: number, mes: number) => {
      const ultimo = new Date(ano, mes + 1, 0).getDate()
      return comHora(new Date(ano, mes, Math.min(dia, ultimo)), c.recorrencia_hora)
    }
    inicioOcorrencia = montar(agora.getFullYear(), agora.getMonth())
    if (inicioOcorrencia > agora) inicioOcorrencia = montar(agora.getFullYear(), agora.getMonth() - 1)
  }

  if (inicioOcorrencia < inicio) return null
  return chaveData(inicioOcorrencia)
}

export function leituraDaOcorrencia(
  c: Comunicado,
  leituras: Leitura[],
  usuarioId: string,
  ocorrencia: string,
): Leitura | undefined {
  return leituras.find(
    (l) =>
      l.comunicado_id === c.id &&
      l.usuario_id === usuarioId &&
      l.versao === c.versao &&
      (l.ocorrencia ?? '') === ocorrencia,
  )
}

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
