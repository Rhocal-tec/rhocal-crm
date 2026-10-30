'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database'
import type { PessoaOpcao } from './ComunicadoForm'

type Sugestao = Database['public']['Tables']['newsroom_sugestoes']['Row']

export function GerenciarSugestoes({ pessoas }: { pessoas: PessoaOpcao[] }) {
  const [supabase] = useState(() => createClient())
  const [lista, setLista] = useState<Sugestao[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [respostas, setRespostas] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('newsroom_sugestoes').select('*').order('criado_em', { ascending: false })
    if (error) setErro('Não foi possível carregar. Confira se a migration 0043 foi executada.')
    setLista(data ?? [])
  }, [supabase])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function marcarLida(s: Sugestao) {
    await supabase.from('newsroom_sugestoes').update({ status: 'lida' }).eq('id', s.id)
    carregar()
  }

  async function responder(s: Sugestao) {
    const texto = (respostas[s.id] ?? '').trim()
    if (!texto) return
    await supabase
      .from('newsroom_sugestoes')
      .update({ status: 'respondida', resposta: texto, respondido_em: new Date().toISOString() })
      .eq('id', s.id)
    carregar()
  }

  return (
    <div className="space-y-3">
      {erro && <p className="text-sm text-accent-danger">{erro}</p>}
      {lista.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-surface p-6 text-center text-sm text-muted">Nenhuma sugestão recebida.</p>
      ) : (
        lista.map((s) => (
          <div key={s.id} className="rounded-lg border border-white/10 bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                {s.anonima ? '🕶 Anônima' : `👤 ${pessoas.find((p) => p.id === s.usuario_id)?.nome ?? 'Identificada'}`}
                {s.categoria ? ` · ${s.categoria}` : ''}
              </span>
              <span>
                {new Date(s.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {s.status}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-primary">{s.texto}</p>
            {s.resposta && (
              <p className="mt-2 rounded-md bg-accent-success/10 p-2 text-sm text-accent-success">Sua resposta: {s.resposta}</p>
            )}
            {s.status !== 'respondida' && (
              <div className="mt-3 space-y-2">
                {!s.anonima && (
                  <textarea
                    value={respostas[s.id] ?? ''}
                    onChange={(e) => setRespostas((r) => ({ ...r, [s.id]: e.target.value }))}
                    rows={2}
                    placeholder="Responder (a pessoa vê a resposta no Newsroom)"
                    className="input-field w-full rounded-md px-2 py-1.5 text-sm text-primary"
                  />
                )}
                <div className="flex gap-2">
                  {!s.anonima && (
                    <button onClick={() => responder(s)} className="rounded-md bg-accent-success px-3 py-1 text-xs font-medium text-white">
                      Responder
                    </button>
                  )}
                  {s.status === 'nova' && (
                    <button onClick={() => marcarLida(s)} className="rounded-md border border-white/15 px-3 py-1 text-xs text-primary">
                      Marcar como lida
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
