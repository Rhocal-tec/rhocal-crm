// Normalização de telefone para a ponte com o CRM WhatsApp.
// Chave de comparação = DDD + 8 últimos dígitos, pra tolerar números com e
// sem o 9º dígito.

// Só dígitos, sem o 55 do país. Retorna null se não parece telefone BR.
function nacional(bruto: string): string | null {
  let d = bruto.replace(/\D/g, '')
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length < 10 || d.length > 11) return null
  return d
}

export function chaveTelefone(bruto: string | null | undefined): string | null {
  if (!bruto) return null
  const n = nacional(bruto)
  return n ? n.slice(0, 2) + n.slice(-8) : null
}

// Telefone em dígitos com 55 na frente (formato usado na URL do CRM WhatsApp).
export function telefoneComPais(bruto: string | null | undefined): string | null {
  if (!bruto) return null
  const n = nacional(bruto)
  return n ? `55${n}` : null
}

export const WHATSAPP_INBOX_URL = 'https://crm-whatsapp-rhocal.vercel.app/inbox'

export function linkAbrirNoWhatsapp(bruto: string | null | undefined): string | null {
  const t = telefoneComPais(bruto)
  return t ? `${WHATSAPP_INBOX_URL}?telefone=${t}` : null
}
