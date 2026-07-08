'use client'

import type { ModoFiltroData } from '@/lib/kanban/filtro-data'

export function FiltroData({
  modo,
  onModoChange,
  dataEspecifica,
  onDataEspecificaChange,
  dataDe,
  onDataDeChange,
  dataAte,
  onDataAteChange,
}: {
  modo: ModoFiltroData
  onModoChange: (modo: ModoFiltroData) => void
  dataEspecifica: string
  onDataEspecificaChange: (valor: string) => void
  dataDe: string
  onDataDeChange: (valor: string) => void
  dataAte: string
  onDataAteChange: (valor: string) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-white/10 bg-surface p-3">
      <div>
        <label className="block text-xs text-muted">Filtro de data</label>
        <select
          value={modo}
          onChange={(e) => onModoChange(e.target.value as ModoFiltroData)}
          className="input-field mt-1 rounded-md px-2 py-1.5 text-sm"
        >
          <option value="nenhum">Sem filtro</option>
          <option value="especifica">Data específica</option>
          <option value="intervalo">Intervalo (de/até)</option>
        </select>
      </div>

      {modo === 'especifica' && (
        <div>
          <label className="block text-xs text-muted">Data</label>
          <input
            type="date"
            value={dataEspecifica}
            onChange={(e) => onDataEspecificaChange(e.target.value)}
            className="input-field mt-1 rounded-md px-2 py-1.5 text-sm"
          />
        </div>
      )}

      {modo === 'intervalo' && (
        <>
          <div>
            <label className="block text-xs text-muted">De</label>
            <input
              type="date"
              value={dataDe}
              onChange={(e) => onDataDeChange(e.target.value)}
              className="input-field mt-1 rounded-md px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted">Até</label>
            <input
              type="date"
              value={dataAte}
              onChange={(e) => onDataAteChange(e.target.value)}
              className="input-field mt-1 rounded-md px-2 py-1.5 text-sm"
            />
          </div>
        </>
      )}
    </div>
  )
}
