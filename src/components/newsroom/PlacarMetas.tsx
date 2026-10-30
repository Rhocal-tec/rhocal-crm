'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { contarIndicador, intervaloDeDatas, INDICADORES, type Indicador } from '@/lib/newsroom/indicadores'
import type { Meta } from '@/lib/newsroom/tipos'

function fmtData(d: string): string {
  const [a, m, di] = d.split('-')
  return `${di}/${m}/${a}`
}

// Barras de progresso das metas, com dados reais do CRM (empresa ativa).
export function PlacarMetas({ metas }: { metas: Meta[] }) {
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [valores, setValores] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(false)
  const chave = metas.map((m) => `${m.id}:${m.meta_valor}:${m.inicio}:${m.fim}`).join('|')

  useEffect(() => {
    if (!empresaAtiva || metas.length === 0) return
    let ativo = true
    setCarregando(true)
    ;(async () => {
      const res: Record<string, number> = {}
      for (const m of metas) {
        try {
          const { inicioISO, fimISO } = intervaloDeDatas(m.inicio, m.fim)
          res[m.id] = await contarIndicador(supabase, m.indicador as Indicador, empresaAtiva.id, inicioISO, fimISO)
        } catch (e) {
          console.error('Placar: erro ao calcular meta', e)
          res[m.id] = 0
        }
      }
      if (ativo) {
        setValores(res)
        setCarregando(false)
      }
    })()
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, empresaAtiva, chave])

  if (metas.length === 0) return null

  return (
    <div className="space-y-3">
      {metas.map((m) => {
        const atual = valores[m.id] ?? 0
        const pct = Math.min(100, Math.round((atual / Number(m.meta_valor)) * 100))
        const batida = atual >= Number(m.meta_valor)
        const info = INDICADORES[m.indicador as Indicador]
        return (
          <div key={m.id} className="rounded-lg border border-white/10 bg-surface p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-primary">
                🎯 {m.titulo} {batida && <span className="text-accent-success">— meta batida! 🎉</span>}
              </p>
              <p className="text-xs text-muted">
                {fmtData(m.inicio)} a {fmtData(m.fim)}
              </p>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${batida ? 'bg-accent-success' : 'bg-accent-primary'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              {carregando && valores[m.id] === undefined ? 'Calculando…' : `${atual} de ${Number(m.meta_valor)} ${info?.unidade ?? ''} (${pct}%)`}
              {info ? ` · ${info.rotulo}` : ''}
            </p>
          </div>
        )
      })}
    </div>
  )
}
