// Indicadores de WhatsApp na aba Produtividade (vindos do CRM WhatsApp pela
// ponte /api/bridge/produtividade). Tipos, limites de alerta e formatação.

export interface IndicadoresWhatsapp {
  conversas_atendidas: number
  mensagens_enviadas: number
  conversas_novas: number
  tempo_medio_primeira_resposta_min: number | null
  tempo_medio_primeira_resposta_corrido_min: number | null
  sem_resposta_agora: number
  maior_espera_min: number
  esquecidas: number
  concluidas: number
}

export interface RespostaWhatsappProdutividade {
  // true = o CRM WhatsApp não respondeu (ou falhou): a aba mostra aviso e segue.
  indisponivel: boolean
  regras: Record<string, string>
  // Por id de perfil deste CRM. Perfil ausente = sem usuário no CRM WhatsApp.
  porPerfil: Record<string, IndicadoresWhatsapp>
  // Só para o gestor.
  equipe: {
    conversas_atendidas: number
    tempo_medio_primeira_resposta_min: number | null
    sem_resposta_agora: number
    esquecidas: number
  } | null
}

// ── Limites de alerta (fáceis de mudar) ──
// Tempos em minutos de horário comercial: até VERDE_ATE_MIN = verde; até
// AMARELO_ATE_MIN = amarelo; acima disso = vermelho.
export const LIMITE_RESPOSTA_VERDE_ATE_MIN = 30
export const LIMITE_RESPOSTA_AMARELO_ATE_MIN = 120
// "Sem resposta agora" e "esquecidas": amarelo quando maior que este valor.
export const LIMITE_CONTAGEM_ALERTA_ACIMA_DE = 0

export type TomAlerta = 'neutro' | 'verde' | 'amarelo' | 'vermelho'

export function tomTempoResposta(min: number | null | undefined): TomAlerta {
  if (min === null || min === undefined) return 'neutro'
  if (min <= LIMITE_RESPOSTA_VERDE_ATE_MIN) return 'verde'
  if (min <= LIMITE_RESPOSTA_AMARELO_ATE_MIN) return 'amarelo'
  return 'vermelho'
}

export function tomContagem(n: number): TomAlerta {
  return n > LIMITE_CONTAGEM_ALERTA_ACIMA_DE ? 'amarelo' : 'neutro'
}

// "12 min", "1h 20min", "2h" — minutos (úteis) com arredondamento.
export function formatarMinutos(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return '—'
  const total = Math.round(min)
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}
