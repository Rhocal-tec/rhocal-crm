// Fase 37.1: cor do indicador de temperatura no card do kanban de
// Oportunidades. Cores literais (não os tokens --accent-*), de propósito,
// pra não colidir visualmente com o âmbar/vermelho do alerta de dias parado
// no mesmo card (fase 37.3). Só os 3 valores sugeridos (fase 31) têm cor —
// `temperatura` é texto livre, qualquer outro valor fica sem indicador.
export const TEMPERATURA_CARD_CORES: Record<string, string> = {
  Quente: '#DC2626',
  Morno: '#EAB308',
  Frio: '#2563EB',
}
