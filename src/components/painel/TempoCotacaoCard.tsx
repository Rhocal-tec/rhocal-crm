'use client'

// Tempo entre o orçamento e a cotação entregue (pedido cotado), em horas.
// Visão sintética (média, mediana, maior) e, ao clicar, a lista analítica de
// todos os pedidos com o tempo que cada um levou. Dados calculados no Painel
// (src/app/painel/page.tsx) a partir do audit_log — sem query nova aqui.
import { useMemo, useState } from 'react'

export interface LinhaCotacao {
  id: string
  numero: number
  clienteNome: string
  criadoPorNome: string
  orcamentoEm: string
  entrouCotacaoEm: string | null
  cotadoEm: string | null
}

const MS_HORA = 3_600_000

function horasEntre(deIso: string, ateIso: string): number {
  return Math.max(0, (new Date(ateIso).getTime() - new Date(deIso).getTime()) / MS_HORA)
}

export function formatarHoras(h: number): string {
  return `${h.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`
}

function dataHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

export function TempoCotacaoCard({ linhas }: { linhas: LinhaCotacao[] }) {
  const [aberto, setAberto] = useState(false)
  const [agora] = useState(() => Date.now())

  const { cotadas, aguardando, media, mediana, maior } = useMemo(() => {
    const cotadas = linhas
      .filter((l) => l.cotadoEm)
      .map((l) => ({
        ...l,
        horasTotal: horasEntre(l.orcamentoEm, l.cotadoEm as string),
        horasCotacao: l.entrouCotacaoEm ? horasEntre(l.entrouCotacaoEm, l.cotadoEm as string) : null,
      }))
      .sort((a, b) => b.horasTotal - a.horasTotal)
    const aguardando = linhas
      .filter((l) => !l.cotadoEm)
      .map((l) => ({ ...l, horas: Math.max(0, (agora - new Date(l.orcamentoEm).getTime()) / MS_HORA) }))
      .sort((a, b) => b.horas - a.horas)
    const valores = cotadas.map((c) => c.horasTotal).sort((a, b) => a - b)
    const media = valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null
    const mediana = valores.length
      ? valores.length % 2
        ? valores[(valores.length - 1) / 2]
        : (valores[valores.length / 2 - 1] + valores[valores.length / 2]) / 2
      : null
    return { cotadas, aguardando, media, mediana, maior: valores.length ? valores[valores.length - 1] : null }
  }, [linhas, agora])

  return (
    <div className="rounded-lg border border-white/10 bg-surface p-4">
      <p className="text-sm font-medium text-primary">Tempo de cotação (Compras)</p>
      <p className="mt-1 text-xs text-muted">
        Horas entre o orçamento e o pedido cotado. Clique para ver pedido a pedido.
      </p>

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="mt-3 w-full rounded-md border border-white/10 p-3 text-left transition-colors hover:bg-white/5"
      >
        {media === null ? (
          <p className="text-sm text-muted">Nenhuma cotação entregue no período.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted">Tempo médio</p>
              <p className="font-mono text-xl font-semibold text-primary">{formatarHoras(media)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Mediana</p>
              <p className="font-mono text-xl font-semibold text-primary">{mediana === null ? '—' : formatarHoras(mediana)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Maior</p>
              <p className="font-mono text-xl font-semibold text-primary">{maior === null ? '—' : formatarHoras(maior)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Cotações</p>
              <p className="font-mono text-xl font-semibold text-primary">{cotadas.length}</p>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-accent-primary">
          {aberto ? '▾ Ocultar detalhes' : '▸ Ver detalhes por pedido'}
          {aguardando.length > 0 ? ` · ${aguardando.length} aguardando cotação` : ''}
        </p>
      </button>

      {aberto && (
        <div className="mt-3 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-muted">
                  <th className="px-2 py-1.5 font-medium">Pedido</th>
                  <th className="px-2 py-1.5 font-medium">Cliente</th>
                  <th className="px-2 py-1.5 font-medium">Vendedora</th>
                  <th className="px-2 py-1.5 font-medium">Orçamento</th>
                  <th className="px-2 py-1.5 font-medium">Cotado em</th>
                  <th className="px-2 py-1.5 text-right font-medium">Tempo total</th>
                  <th className="px-2 py-1.5 text-right font-medium">Em cotação</th>
                </tr>
              </thead>
              <tbody>
                {cotadas.map((c) => (
                  <tr key={c.id} className="border-b border-white/5">
                    <td className="px-2 py-1.5 font-mono text-primary">#{c.numero}</td>
                    <td className="px-2 py-1.5 text-primary">{c.clienteNome}</td>
                    <td className="px-2 py-1.5 text-muted">{c.criadoPorNome}</td>
                    <td className="px-2 py-1.5 text-muted">{dataHora(c.orcamentoEm)}</td>
                    <td className="px-2 py-1.5 text-muted">{dataHora(c.cotadoEm)}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold text-primary">{formatarHoras(c.horasTotal)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-muted">
                      {c.horasCotacao === null ? '—' : formatarHoras(c.horasCotacao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {aguardando.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-accent-alert">Aguardando cotação ({aguardando.length})</p>
              <ul className="space-y-1 text-xs">
                {aguardando.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 text-primary">
                    <span>
                      <span className="font-mono">#{a.numero}</span> {a.clienteNome}{' '}
                      <span className="text-muted">({a.criadoPorNome})</span>
                    </span>
                    <span className="font-mono text-muted">há {formatarHoras(a.horas)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
