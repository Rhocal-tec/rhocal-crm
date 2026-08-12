'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { PRAZO_COLUNAS, classificarPrazo } from '@/lib/tarefas/prazo'
import { sincronizarTarefaComOmie } from '@/lib/tarefas/sincronizar'
import { TarefaColuna } from './TarefaColuna'
import { EncadearTarefaModal } from './EncadearTarefaModal'
import type { Database, SetorTipo } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']

export function TarefasBoard({ setor }: { setor: SetorTipo }) {
  const { user } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const [minhaFila, setMinhaFila] = useState(false)
  const [profilesPorId, setProfilesPorId] = useState<Record<string, string>>({})
  const [oportunidadesPorId, setOportunidadesPorId] = useState<
    Record<string, { numero: number; cliente_nome: string }>
  >({})
  const [pedidosPorId, setPedidosPorId] = useState<Record<string, { numero: number; cliente_nome: string }>>(
    {},
  )
  const [tarefaEncadeando, setTarefaEncadeando] = useState<Tarefa | null>(null)
  const [importando, setImportando] = useState(false)
  const [mensagemImportacao, setMensagemImportacao] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaAtiva) return
    let ativo = true
    setLoading(true)

    supabase
      .from('tarefas')
      .select('*')
      .eq('empresa_id', empresaAtiva.id)
      .order('data_prevista', { ascending: true })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) console.error('Erro ao carregar tarefas:', error.message)
        setTarefas(data ?? [])
        setLoading(false)
      })

    return () => {
      ativo = false
    }
  }, [supabase, empresaAtiva])

  useEffect(() => {
    let ativo = true
    supabase
      .from('profiles')
      .select('id, nome')
      .then(({ data }) => {
        if (!ativo || !data) return
        setProfilesPorId(Object.fromEntries(data.map((p) => [p.id, p.nome])))
      })
    return () => {
      ativo = false
    }
  }, [supabase])

  // Resolve nome do cliente por tarefa via oportunidade_id/pedido_id — só
  // busca os ids que ainda não estão nos mapas locais.
  useEffect(() => {
    let ativo = true

    const idsOportunidade = Array.from(
      new Set(tarefas.map((t) => t.oportunidade_id).filter((id): id is string => id !== null)),
    ).filter((id) => !(id in oportunidadesPorId))
    const idsPedido = Array.from(
      new Set(tarefas.map((t) => t.pedido_id).filter((id): id is string => id !== null)),
    ).filter((id) => !(id in pedidosPorId))

    async function carregar() {
      if (idsOportunidade.length > 0) {
        const { data } = await supabase
          .from('oportunidades')
          .select('id, numero, cliente_nome')
          .in('id', idsOportunidade)
        if (ativo && data) {
          setOportunidadesPorId((atual) => ({
            ...atual,
            ...Object.fromEntries(data.map((o) => [o.id, { numero: o.numero, cliente_nome: o.cliente_nome }])),
          }))
        }
      }
      if (idsPedido.length > 0) {
        const { data } = await supabase.from('pedidos').select('id, numero, cliente_nome').in('id', idsPedido)
        if (ativo && data) {
          setPedidosPorId((atual) => ({
            ...atual,
            ...Object.fromEntries(data.map((p) => [p.id, { numero: p.numero, cliente_nome: p.cliente_nome }])),
          }))
        }
      }
    }

    if (idsOportunidade.length > 0 || idsPedido.length > 0) carregar()

    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, tarefas])

  useEffect(() => {
    if (!empresaAtiva) return
    const empresaId = empresaAtiva.id

    const channel = supabase
      .channel(`tarefas-kanban-${empresaId}`)
      .on<Tarefa>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tarefas' },
        (payload) => {
          const nova = payload.new
          if (nova.empresa_id !== empresaId) return
          setTarefas((atual) => (atual.some((t) => t.id === nova.id) ? atual : [...atual, nova]))
        },
      )
      .on<Tarefa>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tarefas' },
        (payload) => {
          const atualizada = payload.new
          if (atualizada.empresa_id !== empresaId) return
          setTarefas((atual) => {
            const existe = atual.some((t) => t.id === atualizada.id)
            if (!existe) return [...atual, atualizada]
            return atual.map((t) => (t.id === atualizada.id ? atualizada : t))
          })
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Erro na subscription Realtime de tarefas:', status, err)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, empresaAtiva])

  useEffect(() => {
    if (!mensagemImportacao) return
    const timeout = setTimeout(() => setMensagemImportacao(null), 8000)
    return () => clearTimeout(timeout)
  }, [mensagemImportacao])

  const tarefasVisiveis = useMemo(
    () => (minhaFila ? tarefas.filter((t) => t.responsavel === user?.id) : tarefas),
    [tarefas, minhaFila, user],
  )

  const clienteLabelPorTarefa = useMemo(() => {
    const mapa: Record<string, string | null> = {}
    for (const tarefa of tarefasVisiveis) {
      if (tarefa.oportunidade_id) {
        const op = oportunidadesPorId[tarefa.oportunidade_id]
        mapa[tarefa.id] = op ? `${op.cliente_nome} · Oportunidade #${op.numero}` : null
      } else if (tarefa.pedido_id) {
        const pedido = pedidosPorId[tarefa.pedido_id]
        mapa[tarefa.id] = pedido ? `${pedido.cliente_nome} · Pedido #${pedido.numero}` : null
      } else {
        mapa[tarefa.id] = null
      }
    }
    return mapa
  }, [tarefasVisiveis, oportunidadesPorId, pedidosPorId])

  async function concluirTarefa(tarefa: Tarefa) {
    const atualizada = { ...tarefa, situacao: 'Realizada', concluida: true }
    setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? atualizada : t)))

    const { error } = await supabase
      .from('tarefas')
      .update({ situacao: 'Realizada', concluida: true })
      .eq('id', tarefa.id)

    if (error) {
      setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? tarefa : t)))
      return
    }

    sincronizarTarefaComOmie(tarefa.id)
    setTarefaEncadeando(atualizada)
  }

  async function importarDoOmie() {
    if (!empresaAtiva) return
    setImportando(true)
    setMensagemImportacao(null)

    try {
      const resposta = await fetch('/api/omie/importar-tarefas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaSlug: empresaAtiva.slug }),
      })
      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok || !dados || dados.erro) {
        setMensagemImportacao(dados?.erro ?? 'Não foi possível importar tarefas do Omie agora.')
        return
      }

      const partes = [`${dados.importadas} nova(s) tarefa(s) pendente(s) importada(s) do Omie`]
      if (dados.ignoradas > 0) partes.push(`${dados.ignoradas} já existiam`)
      if (dados.semOportunidadeVinculada > 0) {
        partes.push(`${dados.semOportunidadeVinculada} sem oportunidade correspondente importada ainda`)
      }
      setMensagemImportacao(`${partes.join(' · ')}.`)
    } catch {
      setMensagemImportacao('Não foi possível importar tarefas do Omie agora.')
    } finally {
      setImportando(false)
    }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-muted">Carregando tarefas…</div>
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4">
        <button
          onClick={() => setMinhaFila((atual) => !atual)}
          aria-pressed={minhaFila}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            minhaFila
              ? 'bg-accent-primary text-white'
              : 'bg-white/5 text-muted hover:bg-white/10 hover:text-primary'
          }`}
        >
          {minhaFila ? '✓ Minha fila' : 'Minha fila'}
        </button>

        {setor === 'gestor' && (
          <button
            onClick={importarDoOmie}
            disabled={importando || !empresaAtiva}
            className="rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-2 text-sm font-medium text-accent-compras transition-colors hover:bg-accent-compras/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importando ? 'Importando…' : 'Importar tarefas do Omie'}
          </button>
        )}
      </div>

      {mensagemImportacao && (
        <div className="mx-6 mt-4 rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-2 text-sm text-accent-compras">
          {mensagemImportacao}
        </div>
      )}

      <div className="flex flex-1 gap-4 overflow-x-auto p-6">
        {PRAZO_COLUNAS.map((bucket) => (
          <TarefaColuna
            key={bucket}
            bucket={bucket}
            tarefas={tarefasVisiveis.filter((t) => classificarPrazo(t) === bucket)}
            clienteLabelPorTarefa={clienteLabelPorTarefa}
            responsavelPorId={profilesPorId}
            onConcluir={concluirTarefa}
          />
        ))}
      </div>

      <EncadearTarefaModal
        tarefaConcluida={tarefaEncadeando}
        onClose={() => setTarefaEncadeando(null)}
        onCriada={(nova) => setTarefas((atual) => [...atual, nova])}
      />
    </div>
  )
}
