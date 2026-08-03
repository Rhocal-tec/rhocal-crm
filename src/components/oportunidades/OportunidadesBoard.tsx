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
import { OPORTUNIDADE_KANBAN_COLUMNS, OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { podeMoverOportunidade } from '@/lib/oportunidades/permissions'
import { OportunidadeColumn } from './OportunidadeColumn'
import { NovaOportunidadeModal } from './NovaOportunidadeModal'
import { CadastroRelampagoModal } from './CadastroRelampagoModal'
import { OportunidadeDetalheModal } from './OportunidadeDetalheModal'
import type { Database, OportunidadeStatus, SetorTipo } from '@/types/database'

type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

export function OportunidadesBoard({ setor }: { setor: SetorTipo }) {
  const { user } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([])
  const [loading, setLoading] = useState(true)
  const [aviso, setAviso] = useState<string | null>(null)
  const [novaOportunidadeAberta, setNovaOportunidadeAberta] = useState(false)
  const [cadastroRelampagoAberto, setCadastroRelampagoAberto] = useState(false)
  const [oportunidadeAbertaId, setOportunidadeAbertaId] = useState<string | null>(null)
  const [nomesPorId, setNomesPorId] = useState<Record<string, string>>({})
  const [importando, setImportando] = useState(false)
  const [mensagemImportacao, setMensagemImportacao] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  // Carrega as oportunidades ativas (fora de GANHO/PERDIDO), escopadas pela
  // empresa ativa — mesmo padrão do kanban de pedidos.
  useEffect(() => {
    if (!empresaAtiva) return
    let ativo = true
    setLoading(true)

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
      setLoading(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [supabase, empresaAtiva])

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
    if (!aviso) return
    const timeout = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(timeout)
  }, [aviso])

  useEffect(() => {
    if (!mensagemImportacao) return
    const timeout = setTimeout(() => setMensagemImportacao(null), 8000)
    return () => clearTimeout(timeout)
  }, [mensagemImportacao])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return

      const oportunidadeId = active.id as string
      const destino = over.id as OportunidadeStatus
      const origem = active.data.current?.status as OportunidadeStatus | undefined

      if (!origem || origem === destino) return

      if (!podeMoverOportunidade(setor)) {
        setAviso(
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
        setAviso('Não foi possível mover a oportunidade. Tente novamente.')
        if (anterior) {
          setOportunidades((atual) => atual.map((o) => (o.id === oportunidadeId ? anterior : o)))
        }
      }
    },
    [oportunidades, setor, supabase, user],
  )

  // Fase 31: exclusivo do gestor. Chama ListarOportunidades no Omie (via rota
  // server-side, credenciais nunca chegam ao client) e insere as que ainda
  // não têm omie_oportunidade_id no nosso banco — o INSERT resultante chega
  // sozinho pelo canal Realtime já assinado acima, sem precisar refazer a
  // busca aqui.
  async function importarDoOmie() {
    if (!empresaAtiva) return
    setImportando(true)
    setMensagemImportacao(null)

    try {
      const resposta = await fetch('/api/omie/importar-oportunidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaSlug: empresaAtiva.slug }),
      })
      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok || !dados || dados.erro) {
        setMensagemImportacao(
          dados?.erro ?? 'Não foi possível importar oportunidades do Omie agora.',
        )
        return
      }

      setMensagemImportacao(
        `${dados.importadas} nova(s) oportunidade(s) importada(s) do Omie${
          dados.ignoradas > 0 ? ` (${dados.ignoradas} já existiam)` : ''
        }.`,
      )
    } catch {
      setMensagemImportacao('Não foi possível importar oportunidades do Omie agora.')
    } finally {
      setImportando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        Carregando oportunidades…
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex justify-end gap-2 px-6 pt-4">
        {setor === 'gestor' && (
          <button
            onClick={importarDoOmie}
            disabled={importando || !empresaAtiva}
            className="rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-2 text-sm font-medium text-accent-compras transition-colors hover:bg-accent-compras/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importando ? 'Importando…' : 'Importar do Omie'}
          </button>
        )}
        <button
          onClick={() => setCadastroRelampagoAberto(true)}
          className="rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-primary/80 transition-colors hover:bg-white/5"
        >
          Cadastro rápido
        </button>
        <button
          onClick={() => setNovaOportunidadeAberta(true)}
          className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark"
        >
          + Novo Lead
        </button>
      </div>

      {mensagemImportacao && (
        <div className="mx-6 mt-4 rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-2 text-sm text-accent-compras">
          {mensagemImportacao}
        </div>
      )}

      {aviso && (
        <div className="mx-6 mt-4 rounded-md border border-accent-alert/40 bg-accent-alert/10 px-4 py-2 text-sm text-accent-alert">
          {aviso}
        </div>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
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

      <NovaOportunidadeModal
        open={novaOportunidadeAberta}
        onClose={() => setNovaOportunidadeAberta(false)}
      />
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
