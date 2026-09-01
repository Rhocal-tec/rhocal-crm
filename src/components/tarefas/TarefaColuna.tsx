'use client'

import { PRAZO_LABELS, PRAZO_STRIPE_VAR, type PrazoBucket } from '@/lib/tarefas/prazo'
import { TarefaCard } from './TarefaCard'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']

export function TarefaColuna({
  bucket,
  tarefas,
  clienteLabelPorTarefa,
  responsavelPorId,
  onConcluir,
  onIniciar,
  onCancelar,
  onReabrir,
  onExcluir,
}: {
  bucket: PrazoBucket
  tarefas: Tarefa[]
  clienteLabelPorTarefa: Record<string, string | null>
  responsavelPorId: Record<string, string>
  onConcluir: (tarefa: Tarefa) => void
  onIniciar: (tarefa: Tarefa) => void
  onCancelar: (tarefa: Tarefa) => void
  onReabrir: (tarefa: Tarefa) => void
  onExcluir: (tarefa: Tarefa) => void
}) {
  const stripeVar = PRAZO_STRIPE_VAR[bucket]

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
          {PRAZO_LABELS[bucket]}
        </h2>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-primary/70">
          {tarefas.length}
        </span>
      </div>
      <div className="flex min-h-[200px] flex-1 flex-col gap-2 p-2">
        {tarefas.map((tarefa) => (
          <TarefaCard
            key={tarefa.id}
            tarefa={tarefa}
            clienteLabel={clienteLabelPorTarefa[tarefa.id] ?? null}
            responsavelNome={tarefa.responsavel ? responsavelPorId[tarefa.responsavel] ?? null : null}
            atrasada={bucket === 'ATRASADAS'}
            onConcluir={onConcluir}
            onIniciar={onIniciar}
            onCancelar={onCancelar}
            onReabrir={onReabrir}
            onExcluir={onExcluir}
          />
        ))}
        {tarefas.length === 0 && (
          <p className="mt-2 text-center text-xs text-muted/60">Nenhuma tarefa</p>
        )}
      </div>
    </div>
  )
}
