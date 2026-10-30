'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useNewsroom } from '@/contexts/NewsroomContext'
import { podeGerenciarNewsroom } from '@/lib/newsroom/regras'
import type { Comentario, Reacao } from '@/lib/newsroom/tipos'

const EMOJIS = ['👍', '✅', '👏', '❤️']

// Reações (emoji) e comentários curtos de um comunicado.
export function Reacoes({ comunicadoId }: { comunicadoId: string }) {
  const { user, profile } = useAuth()
  const { nomes } = useNewsroom()
  const [supabase] = useState(() => createClient())
  const [reacoes, setReacoes] = useState<Reacao[]>([])
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    const [r, c] = await Promise.all([
      supabase.from('newsroom_reacoes').select('*').eq('comunicado_id', comunicadoId),
      supabase.from('newsroom_comentarios').select('*').eq('comunicado_id', comunicadoId).order('criado_em'),
    ])
    setReacoes(r.data ?? [])
    setComentarios(c.data ?? [])
  }, [supabase, comunicadoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function alternar(emoji: string) {
    if (!user) return
    const minha = reacoes.find((r) => r.usuario_id === user.id && r.emoji === emoji)
    if (minha) await supabase.from('newsroom_reacoes').delete().eq('id', minha.id)
    else await supabase.from('newsroom_reacoes').insert({ comunicado_id: comunicadoId, usuario_id: user.id, emoji })
    carregar()
  }

  async function comentar() {
    const t = texto.trim()
    if (!user || !t) return
    setEnviando(true)
    const { error } = await supabase
      .from('newsroom_comentarios')
      .insert({ comunicado_id: comunicadoId, usuario_id: user.id, texto: t.slice(0, 500) })
    setEnviando(false)
    if (!error) {
      setTexto('')
      carregar()
    }
  }

  async function apagar(id: string) {
    await supabase.from('newsroom_comentarios').delete().eq('id', id)
    carregar()
  }

  const gestor = profile ? podeGerenciarNewsroom(profile.setor) : false

  return (
    <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {EMOJIS.map((e) => {
          const qtd = reacoes.filter((r) => r.emoji === e).length
          const minha = reacoes.some((r) => r.emoji === e && r.usuario_id === user?.id)
          return (
            <button
              key={e}
              onClick={() => alternar(e)}
              className={`rounded-full px-2.5 py-0.5 text-sm ${minha ? 'bg-accent-primary/25 text-primary' : 'bg-white/5 text-muted hover:text-primary'}`}
            >
              {e} {qtd > 0 ? qtd : ''}
            </button>
          )
        })}
        <button onClick={() => setAberto((v) => !v)} className="ml-auto text-xs text-muted hover:text-primary">
          💬 Comentários ({comentarios.length})
        </button>
      </div>
      {aberto && (
        <div className="space-y-2">
          {comentarios.map((c) => (
            <div key={c.id} className="rounded-md bg-white/5 px-3 py-2 text-sm">
              <p className="text-xs text-muted">
                {nomes[c.usuario_id] ?? 'Usuário'} · {new Date(c.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {(c.usuario_id === user?.id || gestor) && (
                  <button onClick={() => apagar(c.id)} className="ml-2 text-accent-danger hover:underline">
                    apagar
                  </button>
                )}
              </p>
              <p className="whitespace-pre-wrap text-primary">{c.texto}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={500}
              placeholder="Comentário curto…"
              className="input-field flex-1 rounded-md px-2 py-1.5 text-sm text-primary"
            />
            <button onClick={comentar} disabled={enviando || !texto.trim()} className="rounded-md bg-accent-primary px-3 py-1 text-sm text-white disabled:opacity-50">
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
