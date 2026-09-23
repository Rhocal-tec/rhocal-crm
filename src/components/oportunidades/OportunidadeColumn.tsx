'use client'

import { formatarMoeda } from '@/lib/kanban/formatacao'
import { OportunidadeCard } from './OportunidadeCard'
import type { Database } from '@/types/database'

type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

// Coluna única "Oportunidades" no FunilBoard — não é mais uma coluna por
// etapa do funil (fase de colapso das 4 colunas em 1). A etapa continua
// existindo no banco e é editável dentro do modal de detalhe (seletor
// "Etapa" em OportunidadeDetalheModal); aqui só lista tudo o que não é
// GANHO/PERDIDO junto, sem separar por status. Sem drag-and-drop — não há
// mais uma segunda coluna pra soltar o card em cima.
export function OportunidadeColumn({
  titulo,
  corVar,
  oportunidades,
  onAbrir,
  nomesPorId,
  ocultasComTarefa = 0,
}: {
  titulo: string
  corVar: string
  oportunidades: Oportunidade[]
  onAbrir: (id: string) => void
  nomesPorId: Record<string, string>
  // Quantas oportunidades ficaram fora da coluna por já terem tarefa aberta
  // vinculada (ver oportunidadesComTarefaAberta no FunilBoard).
  ocultasComTarefa?: number
}) {
  // Fase 37.2: soma do valor_estimado da coluna, ao lado do contador — omite
  // quando dá zero (cobre tanto "nenhuma tem valor" quanto "soma é zero").
  const valorTotalColuna = oportunidades.reduce((soma, o) => soma + (o.valor_estimado ?? 0), 0)

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-white/[0.03]">
      <div
        aria-hidden
        className="h-1 rounded-t-lg"
        style={{
          background: `repeating-linear-gradient(45deg, var(${corVar}) 0px, var(${corVar}) 3px, transparent 3px, transparent 8px)`,
        }}
      />
      <div className="flex items-center justify-between rounded-t-sm bg-surface-alt px-3 py-2.5">
        <h2 className="font-heading text-base font-semibold uppercase tracking-wider text-primary">
          {titulo}
        </h2>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-primary/70">
          {oportunidades.length}
          {valorTotalColuna > 0 && ` · ${formatarMoeda(valorTotalColuna)}`}
        </span>
      </div>
      {ocultasComTarefa > 0 && (
        <p className="bg-surface-alt px-3 pb-2 text-[11px] text-muted">
          +{ocultasComTarefa} com tarefa agendada
        </p>
      )}
      <div className="flex min-h-[200px] flex-1 flex-col gap-2 p-2">
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
