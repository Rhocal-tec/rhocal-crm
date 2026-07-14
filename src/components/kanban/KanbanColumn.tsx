'use client'

import { useDroppable } from '@dnd-kit/core'
import { STATUS_LABELS, STATUS_STRIPE_VAR } from '@/lib/kanban/status'
import { PedidoCard } from './PedidoCard'
import type { Database, PedidoStatus } from '@/types/database'

type Pedido = Database['public']['Tables']['pedidos']['Row']

export function KanbanColumn({
  status,
  pedidos,
  onAbrir,
  podeArquivar,
  onArquivar,
  nomesPorId,
}: {
  status: PedidoStatus
  pedidos: Pedido[]
  onAbrir: (id: string) => void
  podeArquivar: boolean
  onArquivar: (id: string) => void
  nomesPorId: Record<string, string>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  const stripeVar = STATUS_STRIPE_VAR[status] ?? '--text-primary'

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
          {STATUS_LABELS[status]}
        </h2>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-primary/70">
          {pedidos.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[200px] flex-1 flex-col gap-2 p-2 transition-colors ${
          isOver ? 'bg-accent-primary/5' : ''
        }`}
      >
        {pedidos.map((pedido) => (
          <PedidoCard
            key={pedido.id}
            pedido={pedido}
            onAbrir={onAbrir}
            podeArquivar={podeArquivar}
            onArquivar={onArquivar}
            nomesPorId={nomesPorId}
          />
        ))}
        {pedidos.length === 0 && (
          <p className="mt-2 text-center text-xs text-muted/60">Nenhum pedido</p>
        )}
      </div>
    </div>
  )
}
