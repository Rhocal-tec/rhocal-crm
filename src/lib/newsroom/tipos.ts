import type { Database, SetorTipo } from '@/types/database'

export type Comunicado = Database['public']['Tables']['newsroom_comunicados']['Row']
export type Destino = Database['public']['Tables']['newsroom_destinos']['Row']
export type Anexo = Database['public']['Tables']['newsroom_anexos']['Row']
export type Leitura = Database['public']['Tables']['newsroom_leituras']['Row']

export type TipoComunicado = 'novidade' | 'aviso' | 'urgente' | 'treinamento' | 'comemoracao'
export type Exibicao = 'popup' | 'faixa' | 'mural'

export const TIPOS: Record<
  TipoComunicado,
  { rotulo: string; icone: string; classes: string; borda: string }
> = {
  novidade: { rotulo: 'Novidade', icone: '✨', classes: 'bg-accent-primary/15 text-accent-primary', borda: 'border-accent-primary/40' },
  aviso: { rotulo: 'Aviso', icone: '📢', classes: 'bg-accent-alert/15 text-accent-alert', borda: 'border-accent-alert/40' },
  urgente: { rotulo: 'Urgente', icone: '🚨', classes: 'bg-accent-danger/15 text-accent-danger', borda: 'border-accent-danger/60' },
  treinamento: { rotulo: 'Treinamento', icone: '🎓', classes: 'bg-accent-compras/15 text-accent-compras', borda: 'border-accent-compras/40' },
  comemoracao: { rotulo: 'Comemoração', icone: '🎉', classes: 'bg-accent-success/15 text-accent-success', borda: 'border-accent-success/40' },
}

export const EXIBICOES: { valor: Exibicao; rotulo: string; descricao: string }[] = [
  { valor: 'popup', rotulo: 'Pop-up ao abrir o CRM', descricao: 'Bloqueia a tela até clicar em Entendi' },
  { valor: 'faixa', rotulo: 'Faixa fixa no topo', descricao: 'Fica no topo até o fim do período' },
  { valor: 'mural', rotulo: 'Somente no Newsroom', descricao: 'Não interrompe; aparece na página e no sino' },
]

export const SETORES: { valor: SetorTipo; rotulo: string }[] = [
  { valor: 'comercial', rotulo: 'Comercial' },
  { valor: 'compras', rotulo: 'Compras' },
  { valor: 'cs', rotulo: 'CS' },
  { valor: 'gestor', rotulo: 'Gestor' },
]

export function tipoDe(c: Comunicado) {
  return TIPOS[c.tipo as TipoComunicado] ?? TIPOS.aviso
}
