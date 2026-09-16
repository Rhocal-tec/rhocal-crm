'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { PRAZO_COLUNAS, classificarPrazo } from '@/lib/tarefas/prazo'
import { sincronizarTarefaComOmie } from '@/lib/tarefas/sincronizar'
import { useConclusaoTarefa } from '@/lib/tarefas/useConclusaoTarefa'
import { OPORTUNIDADE_KANBAN_COLUMNS, OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { podeMoverOportunidade } from '@/lib/oportunidades/permissions'
import { TarefaColuna } from './TarefaColuna'
import { EncadearTarefaModal } from './EncadearTarefaModal'
import { TarefaModal } from './TarefaModal'
import { ConcluirTarefaModal } from './ConcluirTarefaModal'
import { OportunidadeColumn } from '@/components/oportunidades/OportunidadeColumn'
import { NovaOportunidadeModal } from '@/components/oportunidades/NovaOportunidadeModal'
import { CadastroRelampagoModal } from '@/components/oportunidades/CadastroRelampagoModal'
import { OportunidadeDetalheModal } from '@/components/oportunidades/OportunidadeDetalheModal'
import type { Database, OportunidadeStatus, SetorTipo } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']
type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

// Kanban único e contínuo: as 4 colunas de Tarefas (por prazo) seguidas das 4
// colunas de Oportunidades (por etapa do funil), rolando horizontalmente como
// uma coisa só. Substitui as antigas TarefasBoard/OportunidadesBoard (que
// tinham cada uma seu próprio container de scroll) — a fusão é necessária
// porque as 8 colunas precisam ser irmãs no mesmo container DOM pra rolar
// juntas; não dá pra simular isso com dois componentes independentes.
export function FunilBoard({ setor }: { setor: SetorTipo }) {
  const { user } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())

  // ===== Tarefas =====
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loadingTarefas, setLoadingTarefas] = useState(true)
  const [minhaFila, setMinhaFila] = useState(false)
  const [profilesPorId, setProfilesPorId] = useState<Record<string, string>>({})
  const [oportunidadesPorId, setOportunidadesPorId] = useState<
    Record<string, { numero: number; cliente_nome: string }>
  >({})
  const [pedidosPorId, setPedidosPorId] = useState<Record<string, { numero: number; cliente_nome: string }>>(
    {},
  )
  const [importandoTarefas, setImportandoTarefas] = useState(false)
  const [mensagemImportacaoTarefas, setMensagemImportacaoTarefas] = useState<string | null>(null)
  const [novaTarefaAberta, setNovaTarefaAberta] = useState(false)

  // ===== Oportunidades =====
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([])
  const [loadingOportunidades, setLoadingOportunidades] = useState(true)
  const [avisoOportunidade, setAvisoOportunidade] = useState<string | null>(null)
  const [novoLeadAberto, setNovoLeadAberto] = useState(false)
  const [cadastroRelampagoAberto, setCadastroRelampagoAberto] = useState(false)
  const [nomesPorId, setNomesPorId] = useState<Record<string, string>>({})
  const [importandoOportunidades, setImportandoOportunidades] = useState(false)
  const [mensagemImportacaoOportunidades, setMensagemImportacaoOportunidades] = useState<string | null>(
    null,
  )

  // Compartilhado: o modal de detalhe da oportunidade é aberto tanto ao
  // clicar num card de oportunidade quanto pelo fluxo "Virou oportunidade"
  // da conclusão de tarefa — uma única instância/estado serve aos dois.
  const [oportunidadeAbertaId, setOportunidadeAbertaId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const {
    tarefaConcluindo,
    tarefaEncadeando,
    novaOportunidadeAberta,
    prefillNovaOportunidade,
    salvando: salvandoConclusao,
    abrirConcluir,
    fecharConcluir,
    fecharEncadear,
    fecharNovaOportunidade,
    confirmarVirouOportunidade,
    confirmarAgendar,
    confirmarSemInteresse,
    aoOportunidadeCriada,
  } = useConclusaoTarefa({
    supabase,
    onTarefaAtualizada: (atualizada) =>
      setTarefas((atual) => atual.map((t) => (t.id === atualizada.id ? atualizada : t))),
    // Tudo já fica visível na mesma tela — só precisa abrir o modal de
    // detalhe, sem nenhuma troca de aba/navegação.
    onAbrirOportunidade: (id) => setOportunidadeAbertaId(id),
  })

  // --- Tarefas: carregamento, perfis, labels de cliente, Realtime ---

  useEffect(() => {
    if (!empresaAtiva) return
    let ativo = true
    setLoadingTarefas(true)

    supabase
      .from('tarefas')
      .select('*')
      .eq('empresa_id', empresaAtiva.id)
      .eq('excluida', false)
      .order('data_prevista', { ascending: true })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) console.error('Erro ao carregar tarefas:', error.message)
        setTarefas(data ?? [])
        setLoadingTarefas(false)
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
        setNomesPorId(Object.fromEntries(data.map((p) => [p.id, p.nome])))
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
          if (atualizada.excluida) {
            setTarefas((atual) => atual.filter((t) => t.id !== atualizada.id))
            return
          }
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
    if (!mensagemImportacaoTarefas) return
    const timeout = setTimeout(() => setMensagemImportacaoTarefas(null), 8000)
    return () => clearTimeout(timeout)
  }, [mensagemImportacaoTarefas])

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

  async function alterarSituacao(tarefa: Tarefa, novaSituacao: string) {
    const atualizada = { ...tarefa, situacao: novaSituacao }
    setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? atualizada : t)))

    const { error } = await supabase.from('tarefas').update({ situacao: novaSituacao }).eq('id', tarefa.id)

    if (error) {
      setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? tarefa : t)))
      return
    }

    sincronizarTarefaComOmie(tarefa.id)
  }

  async function excluirTarefa(tarefa: Tarefa) {
    if (!window.confirm(`Excluir a tarefa "${tarefa.descricao}"? Ela sai do quadro mas não é apagada do banco.`)) {
      return
    }
    setTarefas((atual) => atual.filter((t) => t.id !== tarefa.id))

    const { error } = await supabase
      .from('tarefas')
      .update({ excluida: true, excluida_em: new Date().toISOString(), excluida_por: user?.id ?? null })
      .eq('id', tarefa.id)

    if (error) setTarefas((atual) => [...atual, tarefa])
  }

  async function importarTarefasDoOmie() {
    if (!empresaAtiva) return
    setImportandoTarefas(true)
    setMensagemImportacaoTarefas(null)

    try {
      const resposta = await fetch('/api/omie/importar-tarefas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaSlug: empresaAtiva.slug }),
      })
      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok || !dados || dados.erro) {
        setMensagemImportacaoTarefas(dados?.erro ?? 'Não foi possível importar tarefas do Omie agora.')
        return
      }

      const partes = [`${dados.importadas} nova(s) tarefa(s) pendente(s) importada(s) do Omie`]
      if (dados.ignoradas > 0) partes.push(`${dados.ignoradas} já existiam`)
      if (dados.semOportunidadeVinculada > 0) {
        partes.push(`${dados.semOportunidadeVinculada} sem oportunidade correspondente importada ainda`)
      }
      setMensagemImportacaoTarefas(`${partes.join(' · ')}.`)
    } catch {
      setMensagemImportacaoTarefas('Não foi possível importar tarefas do Omie agora.')
    } finally {
      setImportandoTarefas(false)
    }
  }

  // --- Oportunidades: carregamento, Realtime, drag-and-drop ---

  useEffect(() => {
    if (!empresaAtiva) return
    let ativo = true
    setLoadingOportunidades(true)

    async function carregar() {
      const { data, error } = await supabase
        .from('oportunidades')
        .select('*')
        .eq('empresa_id', empresaAtiva!.id)
        .not('status', 'in', '(GANHO,PERDIDO)')
        .order('criado_em', { ascending: true })

      if (!ativo) return
      if (error) {
        console.error('Erro ao carregar oportunidades:', error.message)
      } else {
        setOportunidades(data ?? [])
      }
      setLoadingOportunidades(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [supabase, empresaAtiva])

  useEffect(() => {
    if (!empresaAtiva) return
    const empresaId = empresaAtiva.id

    const channel = supabase
      .channel(`oportunidades-kanban-${empresaId}`)
      .on<Oportunidade>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'oportunidades' },
        (payload) => {
          const nova = payload.new
          if (nova.empresa_id !== empresaId) return
          if (nova.status === 'GANHO' || nova.status === 'PERDIDO') return
          setOportunidades((atual) => {
            if (atual.some((o) => o.id === nova.id)) return atual
            return [...atual, nova]
          })
        },
      )
      .on<Oportunidade>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'oportunidades' },
        (payload) => {
          const atualizada = payload.new
          if (atualizada.empresa_id !== empresaId) return
          setOportunidades((atual) => {
            if (atualizada.status === 'GANHO' || atualizada.status === 'PERDIDO') {
              return atual.filter((o) => o.id !== atualizada.id)
            }
            const existe = atual.some((o) => o.id === atualizada.id)
            if (!existe) return [...atual, atualizada]
            return atual.map((o) => (o.id === atualizada.id ? atualizada : o))
          })
        },
      )
      .on<Oportunidade>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'oportunidades' },
        (payload) => {
          const removida = payload.old
          setOportunidades((atual) => atual.filter((o) => o.id !== removida.id))
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Erro na subscription Realtime de oportunidades:', status, err)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, empresaAtiva])

  useEffect(() => {
    if (!avisoOportunidade) return
    const timeout = setTimeout(() => setAvisoOportunidade(null), 4000)
    return () => clearTimeout(timeout)
  }, [avisoOportunidade])

  useEffect(() => {
    if (!mensagemImportacaoOportunidades) return
    const timeout = setTimeout(() => setMensagemImportacaoOportunidades(null), 8000)
    return () => clearTimeout(timeout)
  }, [mensagemImportacaoOportunidades])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return

      const oportunidadeId = active.id as string
      const destino = over.id as OportunidadeStatus
      const origem = active.data.current?.status as OportunidadeStatus | undefined

      // `over.id` só existe pra colunas que chamaram useDroppable — as 4
      // colunas de Oportunidade. Colunas de Tarefa nunca se registram como
      // droppable, então soltar um card ali nunca chega até aqui com um
      // `destino` fora de OPORTUNIDADE_KANBAN_COLUMNS. Checagem redundante
      // com o comportamento do dnd-kit, mantida só pra deixar a intenção
      // explícita no código.
      if (!origem || origem === destino || !OPORTUNIDADE_KANBAN_COLUMNS.includes(destino)) return

      if (!podeMoverOportunidade(setor)) {
        setAvisoOportunidade(
          `Seu perfil não pode mover oportunidades para "${OPORTUNIDADE_STATUS_LABELS[destino]}".`,
        )
        return
      }

      const anterior = oportunidades.find((o) => o.id === oportunidadeId)

      setOportunidades((atual) =>
        atual.map((o) =>
          o.id === oportunidadeId ? { ...o, status: destino, movido_por: user?.id ?? null } : o,
        ),
      )

      const { error } = await supabase
        .from('oportunidades')
        .update({ status: destino })
        .eq('id', oportunidadeId)

      if (error) {
        console.error('Erro ao mover oportunidade:', error.message)
        setAvisoOportunidade('Não foi possível mover a oportunidade. Tente novamente.')
        if (anterior) {
          setOportunidades((atual) => atual.map((o) => (o.id === oportunidadeId ? anterior : o)))
        }
      }
    },
    [oportunidades, setor, supabase, user],
  )

  async function importarOportunidadesDoOmie() {
    if (!empresaAtiva) return
    setImportandoOportunidades(true)
    setMensagemImportacaoOportunidades(null)

    try {
      const resposta = await fetch('/api/omie/importar-oportunidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaSlug: empresaAtiva.slug }),
      })
      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok || !dados || dados.erro) {
        setMensagemImportacaoOportunidades(
          dados?.erro ?? 'Não foi possível importar oportunidades do Omie agora.',
        )
        return
      }

      const detalhes = [
        dados.ignoradas > 0 ? `${dados.ignoradas} já existiam` : null,
        dados.ignoradasPorData > 0 ? `${dados.ignoradasPorData} fora dos últimos 30 dias` : null,
      ].filter(Boolean)

      setMensagemImportacaoOportunidades(
        `${dados.importadas} nova(s) oportunidade(s) importada(s) do Omie${
          detalhes.length > 0 ? ` (${detalhes.join(', ')})` : ''
        }.`,
      )
    } catch {
      setMensagemImportacaoOportunidades('Não foi possível importar oportunidades do Omie agora.')
    } finally {
      setImportandoOportunidades(false)
    }
  }

  if (loadingTarefas || loadingOportunidades) {
    return <div className="flex flex-1 items-center justify-center text-muted">Carregando…</div>
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

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {setor === 'gestor' && (
            <>
              <button
                onClick={importarTarefasDoOmie}
                disabled={importandoTarefas || !empresaAtiva}
                className="rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-2 text-sm font-medium text-accent-compras transition-colors hover:bg-accent-compras/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importandoTarefas ? 'Importando…' : 'Importar tarefas do Omie'}
              </button>
              <button
                onClick={importarOportunidadesDoOmie}
                disabled={importandoOportunidades || !empresaAtiva}
                className="rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-2 text-sm font-medium text-accent-compras transition-colors hover:bg-accent-compras/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importandoOportunidades ? 'Importando…' : 'Importar oportunidades do Omie'}
              </button>
            </>
          )}
          <button
            onClick={() => setCadastroRelampagoAberto(true)}
            className="rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-primary/80 transition-colors hover:bg-white/5"
          >
            Cadastro rápido
          </button>
          <button
            onClick={() => setNovoLeadAberto(true)}
            className="rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-primary/80 transition-colors hover:bg-white/5"
          >
            + Novo Lead
          </button>
          <button
            onClick={() => setNovaTarefaAberta(true)}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark"
          >
            + Nova Tarefa
          </button>
        </div>
      </div>

      {mensagemImportacaoTarefas && (
        <div className="mx-6 mt-4 rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-2 text-sm text-accent-compras">
          {mensagemImportacaoTarefas}
        </div>
      )}
      {mensagemImportacaoOportunidades && (
        <div className="mx-6 mt-4 rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-2 text-sm text-accent-compras">
          {mensagemImportacaoOportunidades}
        </div>
      )}
      {avisoOportunidade && (
        <div className="mx-6 mt-4 rounded-md border border-accent-alert/40 bg-accent-alert/10 px-4 py-2 text-sm text-accent-alert">
          {avisoOportunidade}
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
          {PRAZO_COLUNAS.map((bucket) => (
            <TarefaColuna
              key={bucket}
              bucket={bucket}
              tarefas={tarefasVisiveis.filter((t) => classificarPrazo(t) === bucket)}
              clienteLabelPorTarefa={clienteLabelPorTarefa}
              responsavelPorId={profilesPorId}
              onConcluir={abrirConcluir}
              onIniciar={(t) => alterarSituacao(t, 'Em Execução')}
              onCancelar={(t) => alterarSituacao(t, 'Cancelada')}
              onReabrir={(t) => alterarSituacao(t, 'Pendente')}
              onExcluir={excluirTarefa}
            />
          ))}

          {/* Divisória visual entre Tarefas e Oportunidades — só uma pista de
              que tem mais coluna pra rolar, sem nenhum efeito funcional. */}
          <div aria-hidden className="flex w-8 shrink-0 items-center justify-center border-l border-white/10 pl-2">
            <span
              className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-widest text-muted/60"
              style={{ writingMode: 'vertical-rl' }}
            >
              Oportunidades
            </span>
          </div>

          {OPORTUNIDADE_KANBAN_COLUMNS.map((status) => (
            <OportunidadeColumn
              key={status}
              status={status}
              oportunidades={oportunidades.filter((o) => o.status === status)}
              onAbrir={setOportunidadeAbertaId}
              nomesPorId={nomesPorId}
            />
          ))}
        </div>
      </DndContext>

      <EncadearTarefaModal
        tarefaConcluida={tarefaEncadeando}
        onClose={fecharEncadear}
        onCriada={(nova) => setTarefas((atual) => [...atual, nova])}
      />

      {novaTarefaAberta && (
        <TarefaModal
          empresaId={empresaAtiva?.id ?? null}
          onClose={() => setNovaTarefaAberta(false)}
          onCriada={(nova) => setTarefas((atual) => (atual.some((t) => t.id === nova.id) ? atual : [...atual, nova]))}
        />
      )}

      <ConcluirTarefaModal
        tarefa={tarefaConcluindo}
        onClose={fecharConcluir}
        onVirouOportunidade={confirmarVirouOportunidade}
        onAgendarNovoContato={confirmarAgendar}
        onSemInteresse={confirmarSemInteresse}
        salvando={salvandoConclusao}
      />

      <NovaOportunidadeModal
        open={novaOportunidadeAberta}
        onClose={fecharNovaOportunidade}
        prefill={prefillNovaOportunidade}
        onCreated={aoOportunidadeCriada}
        empresaId={empresaAtiva?.id}
      />

      <NovaOportunidadeModal open={novoLeadAberto} onClose={() => setNovoLeadAberto(false)} />

      <CadastroRelampagoModal
        open={cadastroRelampagoAberto}
        onClose={() => setCadastroRelampagoAberto(false)}
      />

      <OportunidadeDetalheModal
        oportunidadeId={oportunidadeAbertaId}
        onClose={() => setOportunidadeAbertaId(null)}
        setor={setor}
      />
    </div>
  )
}
