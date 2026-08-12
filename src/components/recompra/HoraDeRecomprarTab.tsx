'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { RecompraCard } from './RecompraCard'
import type { Database, SetorTipo } from '@/types/database'

type RecompraPrevisao = Database['public']['Views']['v_recompra_priorizada']['Row']
type ItemAssociado = Database['public']['Tables']['itens_associados']['Row']

export function HoraDeRecomprarTab({ setor }: { setor: SetorTipo }) {
  const { profile } = useAuth()
  const { empresaAtiva, loading: empresaLoading } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [previsoes, setPrevisoes] = useState<RecompraPrevisao[]>([])
  const [crossSellPorItem, setCrossSellPorItem] = useState<Record<string, ItemAssociado[]>>({})
  const [loading, setLoading] = useState(true)
  const [apenasMeus, setApenasMeus] = useState(setor !== 'gestor')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    let ativo = true
    setLoading(true)

    supabase
      .from('v_recompra_priorizada')
      .select('*')
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) console.error('Erro ao carregar previsões de recompra:', error.message)
        setPrevisoes(data ?? [])
        setLoading(false)
      })

    return () => {
      ativo = false
    }
  }, [supabase])

  // Cross-sell: busca as associações só para os item_codigo que estão na
  // tela, agrupa por item principal e mantém só as 3 mais frequentes por
  // item — o resto fica denso demais pro card.
  useEffect(() => {
    let ativo = true
    const codigos = Array.from(new Set(previsoes.map((p) => p.item_codigo)))
    if (codigos.length === 0) {
      setCrossSellPorItem({})
      return
    }

    supabase
      .from('itens_associados')
      .select('*')
      .in('item_codigo_principal', codigos)
      .order('frequencia_conjunta', { ascending: false })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) {
          console.error('Erro ao carregar itens associados:', error.message)
          return
        }
        const agrupado: Record<string, ItemAssociado[]> = {}
        for (const associacao of data ?? []) {
          const lista = agrupado[associacao.item_codigo_principal] ?? []
          if (lista.length < 3) {
            lista.push(associacao)
            agrupado[associacao.item_codigo_principal] = lista
          }
        }
        setCrossSellPorItem(agrupado)
      })

    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, previsoes.map((p) => p.item_codigo).join(',')])

  const previsoesVisiveis = useMemo(() => {
    const buscaNormalizada = busca.trim().toLowerCase()
    return previsoes.filter((previsao) => {
      if (apenasMeus && previsao.vendedor_omie_id !== profile?.vendedor_omie_id) return false
      if (buscaNormalizada && !previsao.cliente_nome.toLowerCase().includes(buscaNormalizada)) {
        return false
      }
      return true
    })
  }, [previsoes, apenasMeus, busca, profile?.vendedor_omie_id])

  useEffect(() => {
    document.title = `Hora de Recomprar (${previsoesVisiveis.length}) · RHOCAL CRM`
    return () => {
      document.title = 'RHOCAL CRM'
    }
  }, [previsoesVisiveis.length])

  function atualizarPrevisao(atualizada: RecompraPrevisao) {
    setPrevisoes((atual) => atual.map((p) => (p.id === atualizada.id ? atualizada : p)))
  }

  // O motor de recompra (src/lib/recompra/omie-client.ts) hoje só resolve
  // credenciais da RHOCAL — recompra_previsao não tem empresa_id porque a
  // sincronização ainda não cobre MATSEG. Em vez de mostrar dados da RHOCAL
  // por baixo do pano com o workspace MATSEG ativo, a aba avisa e não lista
  // nada nesse caso.
  if (!empresaLoading && empresaAtiva && empresaAtiva.slug !== 'rhocal') {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
        A Hora de Recomprar ainda só cobre dados da RHOCAL — o motor de sincronização não tem
        credenciais da {empresaAtiva.nome_fantasia} configuradas ainda.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        Carregando previsões de recompra…
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4">
        <div>
          <h1 className="font-heading text-xl font-semibold text-primary">Hora de Recomprar</h1>
          <p className="text-xs text-muted">
            {previsoesVisiveis.length} item(ns) aguardando ação
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente…"
            className="input-field rounded-md px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => setApenasMeus((atual) => !atual)}
            aria-pressed={apenasMeus}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              apenasMeus
                ? 'bg-accent-primary text-white'
                : 'bg-white/5 text-muted hover:bg-white/10 hover:text-primary'
            }`}
          >
            {apenasMeus ? '✓ Só os meus' : 'Só os meus'}
          </button>
        </div>
      </div>

      {previsoesVisiveis.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
          {previsoes.length === 0
            ? 'Nenhuma previsão de recompra em aberto no momento.'
            : 'Nenhum item bate com os filtros atuais.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {previsoesVisiveis.map((previsao) => (
            <RecompraCard
              key={previsao.id}
              previsao={previsao}
              crossSell={crossSellPorItem[previsao.item_codigo] ?? []}
              onAtualizada={atualizarPrevisao}
            />
          ))}
        </div>
      )}
    </div>
  )
}
