'use client'

// Lista as chamadas (feitas e recebidas) vinculadas a uma oportunidade, já
// sincronizadas pela rota de sync a cada 15 min. Usa o client Supabase
// compartilhado do app (`@/lib/supabase/client`, sessão em cookie) — nunca
// um `createClient` avulso de `@supabase/supabase-js`, que rodaria sem
// sessão e cairia como anônimo na policy "chamadas leitura" (to authenticated).
//
// Onde usar: dentro da tela de detalhes da oportunidade
// <HistoricoChamadas oportunidadeId={oportunidade.id} />

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database'

type Chamada = Pick<
  Database['public']['Tables']['chamadas']['Row'],
  'id' | 'direcao' | 'status' | 'numero_origem' | 'numero_destino' | 'duracao_segundos' | 'iniciada_em'
>

function statusLabel(status: string): string {
  switch (status) {
    case 'atendida':
      return 'Atendida'
    case 'nao_atendida':
      return 'Não atendida'
    case 'falha':
      return 'Falhou'
    default:
      return 'Em andamento'
  }
}

function statusCor(status: string): { cor: string; bg: string } {
  switch (status) {
    case 'atendida':
      return { cor: '#2FAE66', bg: 'rgba(47, 174, 102, 0.15)' }
    case 'nao_atendida':
      return { cor: '#F4B400', bg: 'rgba(244, 180, 0, 0.15)' }
    case 'falha':
      return { cor: '#E5484D', bg: 'rgba(229, 72, 77, 0.13)' }
    default:
      return { cor: '#3B7DD8', bg: 'rgba(59, 125, 216, 0.15)' }
  }
}

function formatarDuracao(segundos: number | null) {
  if (!segundos) return '—'
  const min = Math.floor(segundos / 60)
  const seg = segundos % 60
  return `${min}m ${seg}s`
}

function formatarData(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function HistoricoChamadas({ oportunidadeId }: { oportunidadeId: string }) {
  const [supabase] = useState(() => createClient())
  const [chamadas, setChamadas] = useState<Chamada[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      const { data } = await supabase
        .from('chamadas')
        .select(
          'id, direcao, status, numero_origem, numero_destino, duracao_segundos, iniciada_em',
        )
        .eq('oportunidade_id', oportunidadeId)
        .order('iniciada_em', { ascending: false })

      if (ativo) {
        setChamadas(data ?? [])
        setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [supabase, oportunidadeId])

  if (carregando) {
    return <p className="text-sm text-muted">Carregando chamadas...</p>
  }

  if (chamadas.length === 0) {
    return (
      <p className="text-sm text-muted">Nenhuma chamada registrada com esse cliente ainda.</p>
    )
  }

  return (
    <div className="space-y-2">
      {chamadas.map((c) => {
        const badge = statusCor(c.status)
        return (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-md border border-white/10 bg-surface-alt px-4 py-2 text-sm"
          >
            <div className="flex items-center gap-3">
              <span>{c.direcao === 'saida' ? '📤' : '📥'}</span>
              <div>
                <p className="font-medium text-primary">
                  {c.direcao === 'saida' ? 'Ligação feita' : 'Ligação recebida'}
                </p>
                <p className="text-xs text-muted">{formatarData(c.iniciada_em)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">{formatarDuracao(c.duracao_segundos)}</span>
              <span
                className="rounded-full px-2 py-1 text-xs font-medium"
                style={{ color: badge.cor, backgroundColor: badge.bg }}
              >
                {statusLabel(c.status)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
