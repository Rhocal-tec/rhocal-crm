'use client'

import { useDroppable } from '@dnd-kit/core'
import { OPORTUNIDADE_STATUS_LABELS, OPORTUNIDADE_STATUS_STRIPE_VAR } from '@/lib/oportunidades/status'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import { OportunidadeCard } from './OportunidadeCard'
import type { Database, OportunidadeStatus } from '@/types/database'

type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

export function OportunidadeColumn({
  status,
  oportunidades,
  onAbrir,
  nomesPorId,
}: {
  status: OportunidadeStatus
  oportunidades: Oportunidade[]
  onAbrir: (id: string) => void
  nomesPorId: Record<string, string>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  const stripeVar = OPORTUNIDADE_STATUS_STRIPE_VAR[status] ?? '--text-primary'

  // Fase 37.2: soma do valor_estimado da coluna, ao lado do contador — omite
  // quando dá zero (cobre tanto "nenhuma tem valor" quanto "soma é zero").
  const valorTotalColuna = oportunidades.reduce((soma, o) => soma + (o.valor_estimado ?? 0), 0)

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-white/[0.03]">
      <div
        aria-hidden
        className="h-1 rounded-t-lg"
        style={{
          background: `repeating-linear-gradient(45deg, var(${stripeVar}) 0px, var(${stripeVar}) 3px, transparent 3px, transparent 8px)`,
        }}
      />
      <div className="flex items-center justify-between rounded-t-sm bg-surface-alt px-3 py-2.5">
        <h2 className="font-heading text-base font-semibold uppercase tracking-wider text-primary">
          {OPORTUNIDADE_STATUS_LABELS[status]}
        </h2>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-primary/70">
          {oportunidades.length}
          {valorTotalColuna > 0 && ` · ${formatarMoeda(valorTotalColuna)}`}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[200px] flex-1 flex-col gap-2 p-2 transition-colors ${
          isOver ? 'bg-accent-primary/5' : ''
        }`}
      >
        {oportunidades.map((oportunidade) => (
          <OportunidadeCard
            key={oportunidade.id}
            oportunidade={oportunidade}
            onAbrir={onAbrir}
            nomesPorId={nomesPorId}
          />
        ))}
        {oportunidades.length === 0 && (
          <p className="mt-2 text-center text-xs text-muted/60">Nenhuma oportunidade</p>
        )}
      </div>
    </div>
  )
}
