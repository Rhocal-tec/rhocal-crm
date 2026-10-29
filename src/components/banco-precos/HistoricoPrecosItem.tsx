'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import { termoSeguro } from './BancoPrecos'
import type { Database } from '@/types/database'

type Preco = Database['public']['Tables']['banco_precos']['Row']

// Aparece na aba de cotações: mostra o que já foi pago/cotado do mesmo CA ou de
// item parecido (descrição), puxando do Banco de Preços.
export function HistoricoPrecosItem({
  ca,
  descricao,
  cotacaoIdsAtuais,
  menorPrecoAtual,
}: {
  ca: string | null
  descricao: string
  cotacaoIdsAtuais: string[]
  menorPrecoAtual: number | null
}) {
  const [supabase] = useState(() => createClient())
  const [registros, setRegistros] = useState<Preco[]>([])
  const [aberto, setAberto] = useState(false)
  const chaveIds = cotacaoIdsAtuais.join(',')

  useEffect(() => {
    let ativo = true
    const filtros: string[] = []
    const caLimpo = termoSeguro(ca ?? '')
    if (caLimpo) filtros.push(`ca.eq.${caLimpo}`)
    const palavras = termoSeguro(descricao)
      .split(/\s+/)
      .filter((p) => p.length > 2)
      .slice(0, 3)
    if (palavras.length > 0) filtros.push(`item_descricao.ilike.%${palavras.join('%')}%`)
    if (filtros.length === 0) return

    supabase
      .from('banco_precos')
      .select('*')
      .or(filtros.join(','))
      .order('data_preco', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!ativo) return
        const idsAtuais = new Set(chaveIds ? chaveIds.split(',') : [])
        setRegistros((data ?? []).filter((r) => !r.cotacao_id || !idsAtuais.has(r.cotacao_id)))
      })
    return () => {
      ativo = false
    }
  }, [supabase, ca, descricao, chaveIds])

  if (registros.length === 0) return null

  const menor = registros.reduce((a, b) => (b.preco < a.preco ? b : a))
  const ultimo = registros[0]
  const acima =
    menorPrecoAtual !== null && menor.preco > 0 && menorPrecoAtual > menor.preco
      ? ((menorPrecoAtual - menor.preco) / menor.preco) * 100
      : null

  return (
    <div className="mt-3 rounded-md border border-accent-compras/30 bg-accent-compras/5 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold text-accent-compras">Banco de Preços</span>
        <span className="text-muted">
          Menor: <span className="font-mono text-primary">{formatarMoeda(menor.preco)}</span> ({menor.fornecedor},{' '}
          {formatarDataSomente(menor.data_preco)})
        </span>
        <span className="text-muted">
          Último: <span className="font-mono text-primary">{formatarMoeda(ultimo.preco)}</span> ({ultimo.fornecedor},{' '}
          {formatarDataSomente(ultimo.data_preco)})
        </span>
        <span className="text-muted">{registros.length} registro(s)</span>
        {acima !== null && acima >= 1 && (
          <span className="font-medium text-accent-alert">
            ⚠ Melhor cotação atual está {acima.toFixed(0)}% acima do menor preço histórico
          </span>
        )}
        <button onClick={() => setAberto((a) => !a)} className="ml-auto text-muted hover:text-primary">
          {aberto ? 'Ocultar ▲' : 'Ver histórico ▼'}
        </button>
      </div>
      {aberto && (
        <ul className="mt-2 divide-y divide-white/5">
          {registros.slice(0, 8).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 py-1 text-muted">
              <span>{formatarDataSomente(r.data_preco)}</span>
              <span className="text-primary">{r.fornecedor}</span>
              <span className="font-mono text-primary">{formatarMoeda(r.preco)}</span>
              <span className="truncate">{r.item_descricao}</span>
              {r.ca && <span className="font-mono">CA {r.ca}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
