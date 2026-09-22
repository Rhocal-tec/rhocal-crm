// Disparo assistido de WhatsApp (fase de Inteligência Comercial > Campanhas):
// monta um link wa.me que já abre a conversa com o número certo e a
// mensagem preenchida — quem envia de fato é a pessoa, com um clique dentro
// do próprio WhatsApp. Sem API oficial, sem provedor terceirizado, sem
// disparo em massa automatizado.

// Normaliza pra E.164 sem o "+": só dígitos, sempre com o 55 na frente.
// Números locais brasileiros (com DDD) têm no máximo 11 dígitos (DDD de 2 +
// celular de 9); com o 55 na frente, o mínimo passa a ser 12 (DDD + fixo de
// 8 dígitos). Por isso "tem 12+ dígitos E já começa com 55" é o único caso
// tratado como "já tem o código do país" — inclusive quando o DDD do
// cliente também é 55 (Santa Maria/RS e região): um número de 11 dígitos
// começando em "55" ali é o DDD, não o código do país, e cai corretamente
// no braço de "adicionar 55".
function normalizarTelefoneWhatsapp(telefoneBruto: string): string | null {
  const digitos = telefoneBruto.replace(/\D/g, '')
  if (digitos.length < 10) return null
  if (digitos.length >= 12 && digitos.startsWith('55')) return digitos
  return `55${digitos}`
}

export function montarLinkWhatsapp(telefoneBruto: string, mensagem: string): string | null {
  const numero = normalizarTelefoneWhatsapp(telefoneBruto)
  if (!numero) return null
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}
