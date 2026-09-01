'use client'

import { formatarDataHoraPrevista } from '@/lib/kanban/formatacao'
import { badgeSituacao, situacaoTerminal } from '@/lib/tarefas/situacao'
import { rotuloNotificarEm } from '@/lib/tarefas/opcoes'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']

export function TarefaCard({
  tarefa,
  clienteLabel,
  responsavelNome,
  atrasada,
  onConcluir,
  onIniciar,
  onCancelar,
  onReabrir,
  onExcluir,
}: {
  tarefa: Tarefa
  clienteLabel: string | null
  responsavelNome: string | null
  atrasada: boolean
  onConcluir: (tarefa: Tarefa) => void
  onIniciar: (tarefa: Tarefa) => void
  onCancelar: (tarefa: Tarefa) => void
  onReabrir: (tarefa: Tarefa) => void
  onExcluir: (tarefa: Tarefa) => void
}) {
  const terminal = situacaoTerminal(tarefa.situacao)
  const badge = badgeSituacao(tarefa.situacao)
  const notifica = tarefa.notificar_em && tarefa.notificar_em !== 'nao_notificar'

  return (
    <div
      className={`rounded-lg border p-3 shadow-sm transition-colors ${
        atrasada
          ? 'border-accent-danger/60 bg-accent-danger/10'
          : terminal
            ? 'border-white/5 bg-white/[0.02] opacity-70'
            : 'border-white/10 bg-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm text-primary ${terminal ? 'line-through' : ''}`}>
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
        <span
          className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ color: badge.cor, backgroundColor: badge.bg }}
        >
          {badge.label}
        </span>
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
        {notifica && (
          <span
            title={`Lembrete: ${rotuloNotificarEm(tarefa.notificar_em)}`}
            className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-muted"
          >
            🔔 {rotuloNotificarEm(tarefa.notificar_em)}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
        <span>{responsavelNome ?? 'Sem responsável'}</span>
        {tarefa.data_prevista && (
          <span className={atrasada ? 'font-medium text-accent-danger' : ''}>
            {formatarDataHoraPrevista(tarefa.data_prevista, tarefa.hora_prevista)}
          </span>
        )}
      </div>

      {!terminal && (
        <div className="mt-2.5 flex gap-2">
          {tarefa.situacao === 'Pendente' && (
            <button
              onClick={() => onIniciar(tarefa)}
              className="flex-1 rounded-md border border-accent-compras/40 bg-accent-compras/10 py-1.5 text-xs font-medium text-accent-compras transition-colors hover:bg-accent-compras/20"
            >
              ▶ Iniciar
            </button>
          )}
          <button
            onClick={() => onConcluir(tarefa)}
            className="flex-1 rounded-md border border-accent-success/40 bg-accent-success/10 py-1.5 text-xs font-medium text-accent-success transition-colors hover:bg-accent-success/20"
          >
            ✓ Concluir
          </button>
        </div>
      )}

      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
        {!terminal && (
          <button onClick={() => onCancelar(tarefa)} className="hover:text-accent-danger">
            Cancelar
          </button>
        )}
        {tarefa.situacao === 'Cancelada' && (
          <button onClick={() => onReabrir(tarefa)} className="hover:text-primary">
            Reabrir
          </button>
        )}
        <button onClick={() => onExcluir(tarefa)} className="ml-auto hover:text-accent-danger">
          Excluir
        </button>
      </div>
    </div>
  )
}
