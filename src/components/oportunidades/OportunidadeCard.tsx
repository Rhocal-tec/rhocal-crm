'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { diasSemMovimentacao, estaCritico, estaParado } from '@/lib/kanban/dias-parado'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import { TEMPERATURA_CARD_CORES } from '@/lib/oportunidades/temperatura-cores'
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

  // Fase 37.3: crítico (7+ dias) tem precedência sobre o alerta âmbar padrão
  // (3+ dias) — mesmo padrão de precedência já usado no card de Pedidos
  // entre "cotação atrasada" e o alerta âmbar de 3 dias.
  const critico = estaCritico(oportunidade.ultima_movimentacao)
  const parado = !critico && estaParado(oportunidade.ultima_movimentacao)
  const dias = diasSemMovimentacao(oportunidade.ultima_movimentacao)
  const nomeUltimoResponsavel = nomesPorId[oportunidade.movido_por ?? oportunidade.criado_por]
  const nomeResponsavel = nomesPorId[oportunidade.criado_por]
  const corTemperatura = oportunidade.temperatura ? TEMPERATURA_CARD_CORES[oportunidade.temperatura] : undefined
  // Fase 38: badge "Fecha DD/MM" — formata só dia/mês (sem passar por Date,
  // mesmo cuidado de fuso já usado em formatarDataSomente).
  const previsaoFechamentoLabel = (() => {
    if (!oportunidade.previsao_fechamento) return null
    const [, mes, dia] = oportunidade.previsao_fechamento.slice(0, 10).split('-')
    if (!mes || !dia) return null
    return `Fecha ${dia}/${mes}`
  })()
  const produtoServicoTruncado =
    oportunidade.produto_servico && oportunidade.produto_servico.length > 40
      ? `${oportunidade.produto_servico.slice(0, 40)}…`
      : oportunidade.produto_servico

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
        critico
          ? 'border-accent-danger/60 bg-accent-danger/10'
          : parado
            ? 'border-accent-alert/60 bg-accent-alert/10'
            : 'border-white/10 bg-surface'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-primary">
          Oportunidade #{oportunidade.numero}
        </span>
        {corTemperatura && (
          <span
            aria-hidden
            title={oportunidade.temperatura ?? undefined}
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: corTemperatura }}
          />
        )}
      </div>
      <p className="mt-1 truncate text-sm text-primary/80">{oportunidade.cliente_nome}</p>
      {produtoServicoTruncado && (
        <p className="mt-0.5 truncate text-xs text-muted">{produtoServicoTruncado}</p>
      )}
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
      {previsaoFechamentoLabel && (
        <span className="mt-1.5 inline-flex rounded-full border border-accent-compras/40 bg-accent-compras/15 px-2 py-0.5 text-xs font-medium text-accent-compras">
          {previsaoFechamentoLabel}
        </span>
      )}
      {(critico || parado) && (
        <p className={`mt-1.5 text-xs font-medium ${critico ? 'text-accent-danger' : 'text-accent-alert'}`}>
          {dias}d parado
        </p>
      )}
      {nomeResponsavel && (
        <p className="mt-1 truncate text-[11px] text-muted/80">
          Responsável: {nomeResponsavel}
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
