import type { SetorTipo } from '@/types/database'
import type { Comunicado, Destino, Leitura } from './tipos'

export function podeGerenciarNewsroom(setor: SetorTipo | undefined | null): boolean {
  return setor === 'gestor'
}

// Publicado e dentro do período (início ≤ agora < fim).
export function vigente(c: Comunicado, agora: Date = new Date()): boolean {
  if (c.status !== 'publicado') return false
  if (new Date(c.inicio_em) > agora) return false
  if (c.fim_em && new Date(c.fim_em) <= agora) return false
  return true
}

export function situacao(c: Comunicado, agora: Date = new Date()): 'rascunho' | 'agendado' | 'ativo' | 'encerrado' {
  if (c.status === 'rascunho') return 'rascunho'
  if (c.status === 'encerrado') return 'encerrado'
  if (new Date(c.inicio_em) > agora) return 'agendado'
  if (c.fim_em && new Date(c.fim_em) <= agora) return 'encerrado'
  return 'ativo'
}

export function destinadoA(
  destinos: Destino[],
  usuarioId: string,
  setor: SetorTipo,
): boolean {
  return destinos.some(
    (d) =>
      d.tipo === 'todos' ||
      (d.tipo === 'setor' && d.setor === setor) ||
      (d.tipo === 'pessoa' && d.usuario_id === usuarioId),
  )
}

export function jaLeu(
  c: Comunicado,
  leituras: Leitura[],
  usuarioId: string,
  ocorrencia: string = '',
): boolean {
  return leituras.some(
    (l) =>
      l.comunicado_id === c.id &&
      l.usuario_id === usuarioId &&
      l.versao === c.versao &&
      (l.ocorrencia ?? '') === ocorrencia,
  )
}

// Aviso por contexto: sem rota = aparece em qualquer tela; com rota = só nessa tela.
export function contextoOk(c: Comunicado, pathname: string): boolean {
  if (!c.contexto_rota) return true
  return pathname === c.contexto_rota || pathname.startsWith(`${c.contexto_rota}/`)
}

// Urgente primeiro; depois início mais recente.
export function ordenar(a: Comunicado, b: Comunicado): number {
  const ua = a.tipo === 'urgente' ? 0 : 1
  const ub = b.tipo === 'urgente' ? 0 : 1
  if (ua !== ub) return ua - ub
  return new Date(b.inicio_em).getTime() - new Date(a.inicio_em).getTime()
}

// Variáveis de mensagem: {nome}, {setor}. Sem dado, usa texto neutro.
export function aplicarVariaveis(texto: string, nome: string | null | undefined, setor: string | null | undefined): string {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0] || 'pessoal'
  return texto.replace(/\{nome\}/gi, primeiro).replace(/\{setor\}/gi, setor || 'equipe')
}

export function linkSeguro(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}
