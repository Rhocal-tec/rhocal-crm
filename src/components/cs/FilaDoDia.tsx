'use client'

import { useMemo } from 'react'
import { FASES_ORDEM, FASE_BADGE, FASE_LABELS } from '@/lib/cs/constantes'
import { inicioDoDia, type ItemFila } from '@/lib/cs/fila'
import type { DadosCS } from '@/lib/cs/useDadosCS'

export function FilaDoDia({
  fila,
  dados,
  usuarioId,
  onAtender,
}: {
  fila: ItemFila[]
  dados: DadosCS
  usuarioId: string
  onAtender: (item: ItemFila) => void
}) {
  const meta = dados.config.meta_dia ?? 20
  const feitosHoje = useMemo(() => {
    const inicio = inicioDoDia(new Date()).toISOString()
    return dados.contatos.filter((c) => c.usuario_id === usuarioId && c.status !== 'em_andamento' && c.criado_em >= inicio)
      .length
  }, [dados.contatos, usuarioId])
  const pct = Math.min(100, Math.round((feitosHoje / Math.max(1, meta)) * 100))

  const porFase = useMemo(() => {
    return FASES_ORDEM.map((fase) => ({ fase, itens: fila.filter((f) => f.fase === fase) })).filter(
      (g) => g.itens.length > 0,
    )
  }, [fila])

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="rounded-lg border border-white/10 bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-primary">
            <span className="text-2xl font-semibold">{feitosHoje}</span> / {meta} contatos hoje
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted">{fila.length} na fila</span>
            {fila.length > 0 && (
              <button
                onClick={() => onAtender(fila[0])}
                className="rounded-md bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:bg-accent-primary-dark"
              >
                Começar a atender →
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {porFase.length === 0 && (
        <p className="text-sm text-muted">Nenhum cliente na fila agora. Volte mais tarde.</p>
      )}

      {porFase.map(({ fase, itens }) => (
        <section key={fase}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${FASE_BADGE[fase]}`}>
              {FASE_LABELS[fase]}
            </span>
            <span className="text-xs font-normal text-muted">{itens.length}</span>
          </h3>
          <ul className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/10 bg-surface">
            {itens.map((item) => (
              <li key={`${item.cliente.chave}-${fase}`}>
                <button
                  onClick={() => onAtender(item)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-white/5"
                >
                  <span className="text-sm font-medium text-primary">{item.cliente.nome}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {item.sugerirLigacao && <span className="text-amber-300">📞 ligar</span>}
                    {item.tentativasSemRetorno > 0 && !item.sugerirLigacao && (
                      <span>{item.tentativasSemRetorno}ª tentativa</span>
                    )}
                    {item.detalhe}
                    {!item.cliente.telefone && <span className="text-accent-danger">sem telefone</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
