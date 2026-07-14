'use client'

import type { PeriodoPreset } from '@/lib/kanban/periodo'

const OPCOES: { valor: PeriodoPreset; label: string }[] = [
  { valor: 'mes_atual', label: 'Mês atual' },
  { valor: '30d', label: 'Últimos 30 dias' },
  { valor: '90d', label: 'Últimos 90 dias' },
  { valor: 'personalizado', label: 'Personalizado' },
]

export function FiltroPeriodo({
  preset,
  onPresetChange,
  personalizadoDe,
  onPersonalizadoDeChange,
  personalizadoAte,
  onPersonalizadoAteChange,
  onAplicarPersonalizado,
}: {
  preset: PeriodoPreset
  onPresetChange: (preset: PeriodoPreset) => void
  personalizadoDe: string
  onPersonalizadoDeChange: (valor: string) => void
  personalizadoAte: string
  onPersonalizadoAteChange: (valor: string) => void
  onAplicarPersonalizado: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-2">
        {OPCOES.map((opcao) => (
          <button
            key={opcao.valor}
            onClick={() => onPresetChange(opcao.valor)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              preset === opcao.valor
                ? 'bg-accent-primary text-white'
                : 'bg-white/5 text-muted hover:bg-white/10 hover:text-primary'
            }`}
          >
            {opcao.label}
          </button>
        ))}
      </div>

      {preset === 'personalizado' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={personalizadoDe}
            onChange={(e) => onPersonalizadoDeChange(e.target.value)}
            className="input-field rounded-md px-2 py-1 text-xs"
          />
          <span className="text-xs text-muted">até</span>
          <input
            type="date"
            value={personalizadoAte}
            onChange={(e) => onPersonalizadoAteChange(e.target.value)}
            className="input-field rounded-md px-2 py-1 text-xs"
          />
          <button
            onClick={onAplicarPersonalizado}
            disabled={!personalizadoDe && !personalizadoAte}
            className="rounded-md bg-accent-primary px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
