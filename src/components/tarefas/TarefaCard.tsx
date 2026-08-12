'use client'

import { formatarDataSomente } from '@/lib/kanban/formatacao'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']

export function TarefaCard({
  tarefa,
  clienteLabel,
  responsavelNome,
  atrasada,
  onConcluir,
}: {
  tarefa: Tarefa
  clienteLabel: string | null
  responsavelNome: string | null
  atrasada: boolean
  onConcluir: (tarefa: Tarefa) => void
}) {
  const concluida = tarefa.situacao === 'Realizada'

  return (
    <div
      className={`rounded-lg border p-3 shadow-sm transition-colors ${
        atrasada
          ? 'border-accent-danger/60 bg-accent-danger/10'
          : concluida
            ? 'border-white/5 bg-white/[0.02] opacity-70'
            : 'border-white/10 bg-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm text-primary ${concluida ? 'line-through' : ''}`}>
          {tarefa.descricao}
        </p>
        {tarefa.urgente && (
          <span
            title="Urgente"
            className="inline-flex shrink-0 rounded-full border border-accent-danger/40 bg-accent-danger/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-danger"
          >
            Urgente
          </span>
        )}
      </div>

      {clienteLabel && (
        <p className="mt-1 truncate text-xs text-primary/70">{clienteLabel}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {tarefa.tipo && (
          <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-muted">
            {tarefa.tipo}
          </span>
        )}
        {tarefa.importante && (
          <span
            title="Importante"
            className="inline-flex rounded-full border border-accent-primary/40 bg-accent-primary/15 px-2 py-0.5 text-[11px] font-semibold text-accent-primary"
          >
            ★ Importante
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
        <span>{responsavelNome ?? 'Sem responsável'}</span>
        {tarefa.data_prevista && (
          <span className={atrasada ? 'font-medium text-accent-danger' : ''}>
            {formatarDataSomente(tarefa.data_prevista)}
          </span>
        )}
      </div>

      {!concluida && (
        <button
          onClick={() => onConcluir(tarefa)}
          className="mt-2.5 w-full rounded-md border border-accent-success/40 bg-accent-success/10 py-1.5 text-xs font-medium text-accent-success transition-colors hover:bg-accent-success/20"
        >
          ✓ Concluir
        </button>
      )}
    </div>
  )
}
