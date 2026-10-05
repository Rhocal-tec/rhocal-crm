import { montarLinkWhatsapp } from '@/lib/inteligencia/whatsapp'
import type { Database } from '@/types/database'

type RecompraPrevisao = Database['public']['Views']['v_recompra_priorizada']['Row']

// Mensagem do botão "WhatsApp" do card de Hora de Recomprar. Usa o texto que a
// IA já sugeriu pro card (texto_sugerido_ia, que já inclui o cross-sell); se o
// card ainda não tiver um, cai num texto padrão curto com o nome do item.
export function montarMensagemRecompra(previsao: RecompraPrevisao): string {
  const sugerido = previsao.texto_sugerido_ia?.trim()
  if (sugerido) return sugerido
  return `Olá! Aqui é da RHOCAL Equipamentos. Pelo seu histórico de compras, deve estar chegando a hora de repor ${previsao.item_nome}. Posso preparar um orçamento pra vocês?`
}

// Quem envia de fato é o comercial, com um clique dentro do próprio WhatsApp
// (mesmo princípio do disparo assistido de Campanhas) — sem API, sem envio
// automático. Devolve null quando o cliente não tem telefone válido.
export function linkWhatsappRecompra(
  previsao: RecompraPrevisao,
  telefone: string | null,
): string | null {
  if (!telefone) return null
  return montarLinkWhatsapp(telefone, montarMensagemRecompra(previsao))
}
