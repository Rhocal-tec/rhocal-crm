'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Database } from '@/types/database'

type Sugestao = Database['public']['Tables']['newsroom_sugestoes']['Row']

const CATEGORIAS = ['Sugestão para o CRM', 'Processo / rotina', 'Elogio', 'Problema', 'Outro']

export function CaixaSugestoes() {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [texto, setTexto] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS[0])
  const [anonima, setAnonima] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [minhas, setMinhas] = useState<Sugestao[]>([])

  const carregar = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('newsroom_sugestoes')
      .select('*')
      .eq('usuario_id', user.id)
      .order('criado_em', { ascending: false })
    setMinhas(data ?? [])
  }, [supabase, user])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function enviar() {
    if (!user) return
    const t = texto.trim()
    if (t.length < 3) {
      setMsg('Escreva pelo menos 3 caracteres.')
      return
    }
    setEnviando(true)
    const { error } = await supabase.from('newsroom_sugestoes').insert({
      usuario_id: anonima ? null : user.id,
      anonima,
      categoria,
      texto: t,
    })
    setEnviando(false)
    if (error) {
      setMsg('Não foi possível enviar. Tente novamente.')
      return
    }
    setTexto('')
    setMsg(anonima ? 'Enviado de forma anônima. Obrigado! 🙏' : 'Enviado ao gestor. Obrigado! 🙏')
    carregar()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-white/10 bg-surface p-4">
        <h2 className="font-heading text-lg font-semibold text-primary">Caixa de sugestões</h2>
        <p className="text-xs text-muted">Fale direto com o gestor. Se marcar anônima, ninguém sabe quem enviou.</p>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="input-field rounded-md px-2 py-1.5 text-sm text-primary">
          {CATEGORIAS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          maxLength={2000}
          className="input-field w-full rounded-md px-2 py-1.5 text-sm text-primary"
        />
        <label className="flex items-center gap-2 text-sm text-primary">
          <input type="checkbox" checked={anonima} onChange={(e) => setAnonima(e.target.checked)} />
          Enviar de forma anônima (não poderei ver a resposta)
        </label>
        {msg && <p className="text-sm text-primary">{msg}</p>}
        <button onClick={enviar} disabled={enviando} className="rounded-md bg-accent-success px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>

      {minhas.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-primary">Minhas sugestões</h3>
          {minhas.map((s) => (
            <div key={s.id} className="rounded-lg border border-white/10 bg-surface p-3 text-sm">
              <p className="text-xs text-muted">
                {s.categoria} · {new Date(s.criado_em).toLocaleDateString('pt-BR')} · {s.status}
              </p>
              <p className="whitespace-pre-wrap text-primary">{s.texto}</p>
              {s.resposta && <p className="mt-2 rounded-md bg-accent-success/10 p-2 text-accent-success">Resposta do gestor: {s.resposta}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
