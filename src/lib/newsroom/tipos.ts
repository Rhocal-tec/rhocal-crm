import type { Database, SetorTipo } from '@/types/database'

export type Comunicado = Database['public']['Tables']['newsroom_comunicados']['Row']
export type Destino = Database['public']['Tables']['newsroom_destinos']['Row']
export type Anexo = Database['public']['Tables']['newsroom_anexos']['Row']
export type Leitura = Database['public']['Tables']['newsroom_leituras']['Row']
export type Resposta = Database['public']['Tables']['newsroom_respostas']['Row']
export type Reacao = Database['public']['Tables']['newsroom_reacoes']['Row']
export type Comentario = Database['public']['Tables']['newsroom_comentarios']['Row']
export type Meta = Database['public']['Tables']['newsroom_metas']['Row']
export type DataEquipe = Database['public']['Tables']['newsroom_datas']['Row']

export type TipoComunicado =
  | 'novidade'
  | 'aviso'
  | 'urgente'
  | 'treinamento'
  | 'comemoracao'
  | 'reconhecimento'
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
  reconhecimento: { rotulo: 'Reconhecimento', icone: '🏆', classes: 'bg-accent-alert/15 text-accent-alert', borda: 'border-accent-alert/50' },
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

// Telas onde um aviso pode ficar restrito ("aviso por contexto").
export const CONTEXTOS: { valor: string; rotulo: string }[] = [
  { valor: '/dashboard', rotulo: 'Kanban' },
  { valor: '/tarefas', rotulo: 'Tarefas' },
  { valor: '/recompra', rotulo: 'Hora de Recomprar' },
  { valor: '/banco-precos', rotulo: 'Banco de Preços' },
  { valor: '/clientes', rotulo: 'Clientes' },
  { valor: '/cs', rotulo: 'CS' },
  { valor: '/busca', rotulo: 'Busca' },
  { valor: '/inteligencia', rotulo: 'Inteligência' },
  { valor: '/produtividade', rotulo: 'Produtividade' },
  { valor: '/painel', rotulo: 'Painel' },
]

export interface Enquete {
  pergunta: string
  opcoes: string[]
  multipla: boolean
}

export interface PerguntaQuiz {
  pergunta: string
  opcoes: string[]
  correta: number
}

export function lerEnquete(c: Comunicado): Enquete | null {
  const e = c.enquete as Partial<Enquete> | null
  if (!e || !Array.isArray(e.opcoes) || e.opcoes.length < 2) return null
  return { pergunta: String(e.pergunta ?? ''), opcoes: e.opcoes.map(String), multipla: !!e.multipla }
}

export function lerQuiz(c: Comunicado): PerguntaQuiz[] | null {
  const q = c.quiz as PerguntaQuiz[] | null
  if (!Array.isArray(q) || q.length === 0) return null
  return q.map((p) => ({
    pergunta: String(p.pergunta ?? ''),
    opcoes: Array.isArray(p.opcoes) ? p.opcoes.map(String) : [],
    correta: Number(p.correta ?? 0),
  }))
}

export function tipoDe(c: Pick<Comunicado, 'tipo'>) {
  return TIPOS[c.tipo as TipoComunicado] ?? TIPOS.aviso
}
