'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { TIPO_INTERACAO_OPCOES, RESULTADO_INTERACAO_OPCOES } from '@/lib/interacoes/opcoes'
import type { Database } from '@/types/database'

type Interacao = Database['public']['Tables']['interacoes']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

// Fase 32.1: registro do que já foi FEITO (diferente de tarefas, que registra
// o que ainda vai ser feito). Recebe exatamente um dos dois ids, mesmo
// padrão dual já usado em TarefasTab.
export function HistoricoContatoTab({
  oportunidadeId,
  pedidoId,
}: {
  oportunidadeId?: string
  pedidoId?: string
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [interacoes, setInteracoes] = useState<Interacao[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tipo, setTipo] = useState<string>(TIPO_INTERACAO_OPCOES[0])
  const [resultado, setResultado] = useState<string>(RESULTADO_INTERACAO_OPCOES[0])
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setCarregando(true)

    async function carregar() {
      const query = supabase
        .from('interacoes')
        .select('*')
        .order('criado_em', { ascending: false })
      const { data } = oportunidadeId
        ? await query.eq('oportunidade_id', oportunidadeId)
        : await query.eq('pedido_id', pedidoId as string)

      const { data: profilesData } = await supabase.from('profiles').select('*')

      if (!ativo) return
      setInteracoes(data ?? [])
      setProfiles(profilesData ?? [])
      setCarregando(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [supabase, oportunidadeId, pedidoId])

  function nomeDoRegistrante(id: string): string {
    return profiles.find((p) => p.id === id)?.nome ?? '—'
  }

  async function registrarInteracao(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!user) return

    setSalvando(true)

    const { data, error } = await supabase
      .from('interacoes')
      .insert({
        oportunidade_id: oportunidadeId ?? null,
        pedido_id: pedidoId ?? null,
        tipo,
        resultado,
        observacao: observacao.trim() || null,
        registrado_por: user.id,
      })
      .select()
      .single()

    setSalvando(false)

    if (error || !data) {
      setErro('Não foi possível registrar a interação. Tente novamente.')
      return
    }

    setInteracoes((atual) => [data, ...atual])
    setObservacao('')
  }

  if (carregando) {
    return <div className="py-6 text-center text-sm text-muted">Carregando histórico…</div>
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <form
        onSubmit={registrarInteracao}
        className="flex flex-col gap-2 rounded-md border border-white/10 bg-surface-alt p-3"
      >
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              disabled={salvando}
            >
              {TIPO_INTERACAO_OPCOES.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted">Resultado</label>
            <select
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              disabled={salvando}
            >
              {RESULTADO_INTERACAO_OPCOES.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted">Observação (opcional)</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            className="input-field mt-1 w-full resize-none rounded-md px-2 py-1.5 text-sm"
            disabled={salvando}
          />
        </div>
        {erro && <p className="text-xs text-accent-danger">{erro}</p>}
        <button
          type="submit"
          disabled={salvando}
          className="mt-1 self-start rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
        >
          {salvando ? 'Registrando…' : '+ Registrar contato'}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {interacoes.length === 0 && (
          <p className="text-center text-xs text-muted/60">Nenhum contato registrado ainda.</p>
        )}
        {interacoes.map((interacao) => (
          <div
            key={interacao.id}
            className="rounded-md border border-white/10 bg-surface p-2.5 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="font-medium text-primary">{interacao.tipo}</span>
                <span className="text-muted">·</span>
                <span className="text-primary/80">{interacao.resultado}</span>
              </span>
              <span className="text-[11px] text-muted">
                {new Date(interacao.criado_em).toLocaleString('pt-BR')}
              </span>
            </div>
            {interacao.observacao && (
              <p className="mt-1 text-xs text-primary/70">{interacao.observacao}</p>
            )}
            <p className="mt-1 text-[11px] text-muted/80">
              por {nomeDoRegistrante(interacao.registrado_por)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
