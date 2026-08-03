'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { diasSemMovimentacao, estaParado } from '@/lib/kanban/dias-parado'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import type { Database } from '@/types/database'

type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

export function OportunidadeCard({
  oportunidade,
  onAbrir,
  nomesPorId,
}: {
  oportunidade: Oportunidade
  onAbrir: (id: string) => void
  nomesPorId: Record<string, string>
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: oportunidade.id,
    data: { status: oportunidade.status },
  })

  const parado = estaParado(oportunidade.ultima_movimentacao)
  const dias = diasSemMovimentacao(oportunidade.ultima_movimentacao)
  const nomeUltimoResponsavel = nomesPorId[oportunidade.movido_por ?? oportunidade.criado_por]

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
      onClick={() => onAbrir(oportunidade.id)}
      className={`cursor-grab touch-none rounded-lg border p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
        parado ? 'border-accent-alert/60 bg-accent-alert/10' : 'border-white/10 bg-surface'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-primary">
          Oportunidade #{oportunidade.numero}
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-primary/80">{oportunidade.cliente_nome}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-muted">
          {OPORTUNIDADE_STATUS_LABELS[oportunidade.status]}
        </span>
        {oportunidade.valor_estimado !== null && (
          <span className="font-mono text-xs font-medium text-primary/80">
            {formatarMoeda(oportunidade.valor_estimado)}
          </span>
        )}
      </div>
      {parado && (
        <p className="mt-1.5 text-xs font-medium text-accent-alert">
          há {dias} {dias === 1 ? 'dia' : 'dias'} sem movimentação
        </p>
      )}
      {nomeUltimoResponsavel && (
        <p className="mt-1 truncate text-[11px] text-muted/80">
          Movido por {nomeUltimoResponsavel}
        </p>
      )}
    </div>
  )
}
