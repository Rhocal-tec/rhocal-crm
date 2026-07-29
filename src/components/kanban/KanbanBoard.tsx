'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { KANBAN_COLUMNS, STATUS_LABELS } from '@/lib/kanban/status'
import { podeMoverPara } from '@/lib/kanban/permissions'
import { validarPedidoParaCotado } from '@/lib/kanban/validacao-cotado'
import { KanbanColumn } from './KanbanColumn'
import { NovoOrcamentoModal } from './NovoOrcamentoModal'
import { PedidoDetalheModal } from './PedidoDetalheModal'
import type { Database, PedidoStatus, SetorTipo } from '@/types/database'

type Pedido = Database['public']['Tables']['pedidos']['Row']

export function KanbanBoard({ setor }: { setor: SetorTipo }) {
  const { user } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const [novoOrcamentoAberto, setNovoOrcamentoAberto] = useState(false)
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null)
  // Nome de cada colaborador por id — usado para exibir "Movido por X" no
  // card a partir de pedido.movido_por/criado_por, sem depender de embed do
  // PostgREST (que não sobrevive aos payloads de Realtime, que trazem só a
  // linha crua de `pedidos`).
  const [nomesPorId, setNomesPorId] = useState<Record<string, string>>({})

  const podeCriarOrcamento = setor === 'comercial' || setor === 'gestor'
  const podeArquivar = setor === 'comercial' || setor === 'gestor'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  // Carrega os pedidos visíveis no kanban (tudo exceto ARQUIVADO e PERDIDO),
  // escopados pela empresa ativa. Refaz a busca sempre que a empresa ativa
  // muda (troca no seletor do header).
  useEffect(() => {
    if (!empresaAtiva) return
    let ativo = true
    setLoading(true)

    async function carregar() {
      const { data, error } = await supabase
        .from('pedidos')
        .select('*')
        .eq('empresa_id', empresaAtiva!.id)
        .not('status', 'in', '(ARQUIVADO,PERDIDO)')
        .order('criado_em', { ascending: true })

      if (!ativo) return
      if (error) {
        console.error('Erro ao carregar pedidos:', error.message)
      } else {
        setPedidos(data ?? [])
      }
      setLoading(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [supabase, empresaAtiva])

  // Nomes de todos os colaboradores, para resolver "Movido por X" nos cards.
  useEffect(() => {
    let ativo = true

    async function carregar() {
      const { data } = await supabase.from('profiles').select('id, nome')
      if (!ativo || !data) return
      setNomesPorId(Object.fromEntries(data.map((p) => [p.id, p.nome])))
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [supabase])

  // Realtime: reflete instantaneamente pedidos criados/movidos por outros usuários.
  // Usa três registros separados (INSERT/UPDATE/DELETE) em vez de um único
  // filtro '*' — é o padrão documentado pelo Supabase e evita depender de um
  // wildcard que, combinado com a configuração de replicação do projeto,
  // pode não entregar todos os tipos de evento de forma confiável.
  useEffect(() => {
    if (!empresaAtiva) return
    const empresaId = empresaAtiva.id

    const channel = supabase
      .channel(`pedidos-kanban-${empresaId}`)
      .on<Pedido>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos' },
        (payload) => {
          const novo = payload.new
          if (novo.empresa_id !== empresaId) return
          if (novo.status === 'ARQUIVADO' || novo.status === 'PERDIDO') return
          setPedidos((atual) => {
            if (atual.some((p) => p.id === novo.id)) return atual
            return [...atual, novo]
          })
        },
      )
      .on<Pedido>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pedidos' },
        (payload) => {
          const atualizado = payload.new
          if (atualizado.empresa_id !== empresaId) return
          setPedidos((atual) => {
            if (atualizado.status === 'ARQUIVADO' || atualizado.status === 'PERDIDO') {
              return atual.filter((p) => p.id !== atualizado.id)
            }
            const existe = atual.some((p) => p.id === atualizado.id)
            if (!existe) return [...atual, atualizado]
            return atual.map((p) => (p.id === atualizado.id ? atualizado : p))
          })
        },
      )
      .on<Pedido>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pedidos' },
        (payload) => {
          const removido = payload.old
          setPedidos((atual) => atual.filter((p) => p.id !== removido.id))
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Erro na subscription Realtime de pedidos:', status, err)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, empresaAtiva])

  // Some avisos de bloqueio automaticamente após alguns segundos.
  useEffect(() => {
    if (!aviso) return
    const timeout = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(timeout)
  }, [aviso])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return

      const pedidoId = active.id as string
      const destino = over.id as PedidoStatus
      const origem = active.data.current?.status as PedidoStatus | undefined

      if (!origem || origem === destino) return

      if (!podeMoverPara(setor, destino)) {
        setAviso(
          `Seu perfil não pode mover pedidos para "${STATUS_LABELS[destino]}".`,
        )
        return
      }

      // Aviso não bloqueante: itens sem cotação vencedora/custo final não impedem
      // o card de ir para PEDIDO_COTADO, só avisam o que falta.
      if (destino === 'PEDIDO_COTADO') {
        const resultado = await validarPedidoParaCotado(supabase, pedidoId)
        if (!resultado.ok) {
          setAviso(resultado.mensagem)
        }
      }

      const pedidoAnterior = pedidos.find((p) => p.id === pedidoId)

      // Atualização otimista. movido_por é setado aqui só para a UI não piscar
      // com o nome antigo até o eco do Realtime chegar — quem grava de fato é
      // a trigger fn_pedido_movimentado (auth.uid()), no servidor.
      setPedidos((atual) =>
        atual.map((p) =>
          p.id === pedidoId ? { ...p, status: destino, movido_por: user?.id ?? null } : p,
        ),
      )

      const { error } = await supabase
        .from('pedidos')
        .update({ status: destino })
        .eq('id', pedidoId)

      if (error) {
        console.error('Erro ao mover pedido:', error.message)
        setAviso('Não foi possível mover o pedido. Tente novamente.')
        // Reverte a atualização otimista.
        if (pedidoAnterior) {
          setPedidos((atual) => atual.map((p) => (p.id === pedidoId ? pedidoAnterior : p)))
        }
      }
    },
    [pedidos, setor, supabase, user],
  )

  const handleArquivar = useCallback(
    async (pedidoId: string) => {
      const pedidoAnterior = pedidos.find((p) => p.id === pedidoId)
      if (!pedidoAnterior) return

      // Atualização otimista.
      setPedidos((atual) =>
        atual.map((p) =>
          p.id === pedidoId
            ? { ...p, status: 'ARQUIVADO', arquivado_motivo: 'manual', movido_por: user?.id ?? null }
            : p,
        ),
      )

      const { error } = await supabase
        .from('pedidos')
        .update({ status: 'ARQUIVADO', arquivado_motivo: 'manual' })
        .eq('id', pedidoId)

      if (error) {
        console.error('Erro ao arquivar pedido:', error.message)
        setAviso('Não foi possível arquivar o pedido. Tente novamente.')
        // Reverte a atualização otimista.
        setPedidos((atual) => atual.map((p) => (p.id === pedidoId ? pedidoAnterior : p)))
      }
    },
    [pedidos, supabase, user],
  )

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        Carregando pedidos…
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      {podeCriarOrcamento && (
        <div className="flex justify-end px-6 pt-4">
          <button
            onClick={() => setNovoOrcamentoAberto(true)}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark"
          >
            + Novo Orçamento
          </button>
        </div>
      )}

      {aviso && (
        <div className="mx-6 mt-4 rounded-md border border-accent-alert/40 bg-accent-alert/10 px-4 py-2 text-sm text-accent-alert">
          {aviso}
        </div>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
          {KANBAN_COLUMNS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              pedidos={pedidos.filter((p) => p.status === status)}
              onAbrir={setPedidoAbertoId}
              podeArquivar={podeArquivar}
              onArquivar={handleArquivar}
              nomesPorId={nomesPorId}
            />
          ))}
        </div>
      </DndContext>

      <NovoOrcamentoModal
        open={novoOrcamentoAberto}
        onClose={() => setNovoOrcamentoAberto(false)}
      />
      <PedidoDetalheModal
        pedidoId={pedidoAbertoId}
        onClose={() => setPedidoAbertoId(null)}
        onDuplicado={setPedidoAbertoId}
        setor={setor}
      />
    </div>
  )
}
