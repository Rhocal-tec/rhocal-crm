// Dias entre hoje e uma data pura (Postgres `date`, YYYY-MM-DD), sempre em
// UTC explícito — mesma cautela de fuso já documentada em
// src/lib/kanban/cotacao-vencida.ts e usada em calcularDataLimiteISO
// (src/lib/recompra/sync-recompra-preditiva.ts). Nunca `new Date(dataISO)`
// direto: isso interpreta a string como meia-noite UTC e, ao formatar de
// volta pro fuso local (Brasil, UTC-3), pode voltar um dia.
export function diasAPartirDeHoje(dataISO: string): number {
  const hojeISO = new Date().toISOString().slice(0, 10)
  const hoje = new Date(`${hojeISO}T00:00:00Z`)
  const alvo = new Date(`${dataISO.slice(0, 10)}T00:00:00Z`)
  return Math.round((alvo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}
