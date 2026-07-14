'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { STATUS_LABELS } from '@/lib/kanban/status'
import { diasSemMovimentacao, estaParado } from '@/lib/kanban/dias-parado'
import type { Database } from '@/types/database'

type Pedido = Database['public']['Tables']['pedidos']['Row']

export function PedidoCard({
  pedido,
  onAbrir,
  podeArquivar,
  onArquivar,
  nomesPorId,
}: {
  pedido: Pedido
  onAbrir: (id: string) => void
  podeArquivar: boolean
  onArquivar: (id: string) => void
  nomesPorId: Record<string, string>
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: pedido.id,
    data: { status: pedido.status },
  })

  const parado = estaParado(pedido.ultima_movimentacao)
  const dias = diasSemMovimentacao(pedido.ultima_movimentacao)
  // Sem movimentação de status ainda (pedido recém-criado): mostra quem criou.
  const nomeUltimoResponsavel = nomesPorId[pedido.movido_por ?? pedido.criado_por]

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onAbrir(pedido.id)}
      className={`cursor-grab touch-none rounded-lg border p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
        parado
          ? 'border-accent-alert/60 bg-accent-alert/10'
          : 'border-white/10 bg-surface'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-primary">
          Pedido #{pedido.numero}
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-primary/80">{pedido.cliente_nome}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-muted">
          {STATUS_LABELS[pedido.status]}
        </span>
        {parado && (
          <span className="text-xs font-medium text-accent-alert">
            há {dias} {dias === 1 ? 'dia' : 'dias'} sem movimentação
          </span>
        )}
      </div>
      {nomeUltimoResponsavel && (
        <p className="mt-1 truncate text-[11px] text-muted/80">
          Movido por {nomeUltimoResponsavel}
        </p>
      )}
      {podeArquivar && pedido.status === 'PEDIDO_EFETUADO' && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onArquivar(pedido.id)
          }}
          className="mt-2 w-full rounded-md border border-white/15 py-1 text-xs font-medium text-primary/70 hover:bg-white/5"
        >
          Arquivar
        </button>
      )}
    </div>
  )
}
