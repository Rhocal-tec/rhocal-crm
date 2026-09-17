'use client'

// Card "Motivos de perda" do Painel executivo — mesma barra horizontal de
// sempre, mas cada linha agora é clicável e expande um drill-down com os
// pedidos daquele motivo (mesmo padrão de accordion do Analítico por
// Funcionário: um Set de chaves expandidas, sem query nova — os dados já
// vêm calculados no componente pai, ver src/app/painel/page.tsx).
import { Fragment, useState } from 'react'
import { formatarMoeda } from '@/lib/kanban/formatacao'

export interface PedidoPerdidoLinha {
  id: string
  numero: number
  clienteNome: string
  valor: number
  criadoPorNome: string
}

export interface MotivoPerdaBarra {
  motivo: string
  quantidade: number
  pedidos: PedidoPerdidoLinha[]
}

export function MotivosPerdaCard({ dados }: { dados: MotivoPerdaBarra[] }) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  if (dados.length === 0) {
    return <p className="text-sm text-muted">Nenhum pedido perdido no período.</p>
  }

  const max = Math.max(1, ...dados.map((d) => d.quantidade))

  function alternar(motivo: string) {
    setExpandidos((atual) => {
      const novo = new Set(atual)
      if (novo.has(motivo)) novo.delete(motivo)
      else novo.add(motivo)
      return novo
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      {dados.map((d) => {
        const aberto = expandidos.has(d.motivo)
        return (
          <Fragment key={d.motivo}>
            <button
              type="button"
              onClick={() => alternar(d.motivo)}
              className="flex items-center gap-3 rounded-md py-1 text-left transition-colors hover:bg-white/5"
            >
              <span className="w-4 shrink-0 text-center text-xs text-muted">{aberto ? '▾' : '▸'}</span>
              <span className="w-32 shrink-0 truncate text-xs text-muted" title={d.motivo}>
                {d.motivo}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(2, (d.quantidade / max) * 100)}%`,
                    background: 'var(--accent-danger)',
                  }}
                  title={`${d.motivo}: ${d.quantidade}`}
                />
              </div>
              <span className="w-28 shrink-0 text-right font-mono text-xs text-primary">
                {d.quantidade}
              </span>
            </button>

            {aberto && (
              <div className="ml-7 mb-1 rounded-md border border-white/10 bg-surface-alt/40 p-2.5">
                {d.pedidos.length === 0 ? (
                  <p className="text-xs text-muted/70">Nenhum pedido encontrado.</p>
                ) : (
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {d.pedidos.map((p) => (
                      <div key={p.id} className="text-xs text-primary/80">
                        <span className="font-mono">#{p.numero}</span> — {p.clienteNome} ·{' '}
                        {formatarMoeda(p.valor)} · {p.criadoPorNome}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
