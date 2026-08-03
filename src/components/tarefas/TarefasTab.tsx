'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatarDataSomente } from '@/lib/kanban/formatacao'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

// Aba de acompanhamento reutilizada tanto no modal de oportunidade quanto no
// modal de pedido (fase 31) — recebe exatamente um dos dois ids.
export function TarefasTab({
  oportunidadeId,
  pedidoId,
}: {
  oportunidadeId?: string
  pedidoId?: string
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [carregando, setCarregando] = useState(true)
  const [descricao, setDescricao] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [dataPrevista, setDataPrevista] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setCarregando(true)

    async function carregar() {
      const query = supabase.from('tarefas').select('*').order('criado_em', { ascending: true })
      const { data } = oportunidadeId
        ? await query.eq('oportunidade_id', oportunidadeId)
        : await query.eq('pedido_id', pedidoId as string)

      const { data: profilesData } = await supabase.from('profiles').select('*')

      if (!ativo) return
      setTarefas(data ?? [])
      setProfiles(profilesData ?? [])
      setCarregando(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [supabase, oportunidadeId, pedidoId])

  function nomeDoResponsavel(id: string | null): string {
    if (!id) return '—'
    return profiles.find((p) => p.id === id)?.nome ?? '—'
  }

  async function adicionarTarefa(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!user) return
    if (!descricao.trim()) {
      setErro('Informe a descrição da tarefa.')
      return
    }

    setSalvando(true)

    const { data, error } = await supabase
      .from('tarefas')
      .insert({
        oportunidade_id: oportunidadeId ?? null,
        pedido_id: pedidoId ?? null,
        descricao: descricao.trim(),
        responsavel: responsavel || null,
        data_prevista: dataPrevista || null,
        criado_por: user.id,
      })
      .select()
      .single()

    setSalvando(false)

    if (error || !data) {
      setErro('Não foi possível criar a tarefa. Tente novamente.')
      return
    }

    setTarefas((atual) => [...atual, data])
    setDescricao('')
    setResponsavel('')
    setDataPrevista('')
  }

  async function alternarConcluida(tarefa: Tarefa) {
    const novoValor = !tarefa.concluida
    setTarefas((atual) =>
      atual.map((t) => (t.id === tarefa.id ? { ...t, concluida: novoValor } : t)),
    )

    const { error } = await supabase
      .from('tarefas')
      .update({ concluida: novoValor })
      .eq('id', tarefa.id)

    if (error) {
      setTarefas((atual) =>
        atual.map((t) => (t.id === tarefa.id ? { ...t, concluida: tarefa.concluida } : t)),
      )
    }
  }

  if (carregando) {
    return <div className="py-6 text-center text-sm text-muted">Carregando tarefas…</div>
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <form
        onSubmit={adicionarTarefa}
        className="flex flex-col gap-2 rounded-md border border-white/10 bg-surface-alt p-3"
      >
        <div>
          <label className="block text-xs text-muted">Descrição</label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
            placeholder="Ex: Ligar para confirmar interesse"
            disabled={salvando}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted">Responsável (opcional)</label>
            <select
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              disabled={salvando}
            >
              <option value="">—</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted">Data prevista (opcional)</label>
            <input
              type="date"
              value={dataPrevista}
              onChange={(e) => setDataPrevista(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              disabled={salvando}
            />
          </div>
        </div>
        {erro && <p className="text-xs text-accent-danger">{erro}</p>}
        <button
          type="submit"
          disabled={salvando}
          className="mt-1 self-start rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
        >
          {salvando ? 'Adicionando…' : '+ Adicionar tarefa'}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {tarefas.length === 0 && (
          <p className="text-center text-xs text-muted/60">Nenhuma tarefa cadastrada.</p>
        )}
        {tarefas.map((tarefa) => (
          <div
            key={tarefa.id}
            className={`flex items-start gap-3 rounded-md border p-2.5 ${
              tarefa.concluida
                ? 'border-white/5 bg-white/[0.02] opacity-60'
                : 'border-white/10 bg-surface'
            }`}
          >
            <input
              type="checkbox"
              checked={tarefa.concluida}
              onChange={() => alternarConcluida(tarefa)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent-success"
            />
            <div className="flex-1">
              <p
                className={`text-sm text-primary ${tarefa.concluida ? 'line-through' : ''}`}
              >
                {tarefa.descricao}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {nomeDoResponsavel(tarefa.responsavel)}
                {tarefa.data_prevista && ` · até ${formatarDataSomente(tarefa.data_prevista)}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
