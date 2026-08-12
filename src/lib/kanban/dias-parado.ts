// Cálculo do indicador visual de "card parado", com base em ultima_movimentacao.
const LIMITE_DIAS_ALERTA = 3
// Fase 37.3: segundo patamar (vermelho), hoje só usado pelo card de
// Oportunidades — o card de Pedidos usa o vermelho pra "cotação atrasada"
// (fase 18.6), um alerta diferente, não por dias parado.
const LIMITE_DIAS_CRITICO = 7

export function diasSemMovimentacao(ultimaMovimentacao: string): number {
  const inicio = new Date(ultimaMovimentacao).getTime()
  const agora = Date.now()
  const diffMs = Math.max(0, agora - inicio)
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

export function estaParado(ultimaMovimentacao: string): boolean {
  return diasSemMovimentacao(ultimaMovimentacao) >= LIMITE_DIAS_ALERTA
}

export function estaCritico(ultimaMovimentacao: string): boolean {
  return diasSemMovimentacao(ultimaMovimentacao) >= LIMITE_DIAS_CRITICO
}
