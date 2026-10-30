'use client'

import { useMemo } from 'react'
import { destinadoA } from '@/lib/newsroom/regras'
import { tipoDe, type Comunicado, type Destino, type Leitura } from '@/lib/newsroom/tipos'
import type { PessoaOpcao } from './ComunicadoForm'
import type { SetorTipo } from '@/types/database'

function fmtDur(min: number): string {
  if (min < 60) return `${Math.round(min)} min`
  if (min < 60 * 24) return `${(min / 60).toFixed(1).replace('.', ',')} h`
  return `${(min / 60 / 24).toFixed(1).replace('.', ',')} dias`
}

// Relatório de engajamento: avisos mais lidos e velocidade de leitura por pessoa.
export function Engajamento({
  comunicados,
  destinos,
  leituras,
  pessoas,
}: {
  comunicados: Comunicado[]
  destinos: Destino[]
  leituras: Leitura[]
  pessoas: PessoaOpcao[]
}) {
  const { avisos, porPessoa } = useMemo(() => {
    const publicados = comunicados.filter((c) => c.status !== 'rascunho')
    const tempos = new Map<string, number[]>()
    const lidos = new Map<string, number>()
    const recebidos = new Map<string, number>()

    const avisos = publicados.map((c) => {
      const d = destinos.filter((x) => x.comunicado_id === c.id)
      const dest = pessoas.filter((p) => destinadoA(d, p.id, p.setor as SetorTipo))
      const ls = leituras.filter((l) => l.comunicado_id === c.id && l.versao === c.versao)
      const ids = new Set(dest.map((p) => p.id))
      const validas = ls.filter((l) => ids.has(l.usuario_id))
      const minutos = validas
        .map((l) => (new Date(l.lido_em).getTime() - new Date(c.inicio_em).getTime()) / 60000)
        .filter((m) => m >= 0)
      for (const p of dest) recebidos.set(p.id, (recebidos.get(p.id) ?? 0) + 1)
      for (const l of validas) {
        lidos.set(l.usuario_id, (lidos.get(l.usuario_id) ?? 0) + 1)
        const m = (new Date(l.lido_em).getTime() - new Date(c.inicio_em).getTime()) / 60000
        if (m >= 0) tempos.set(l.usuario_id, [...(tempos.get(l.usuario_id) ?? []), m])
      }
      return {
        c,
        total: dest.length,
        lidos: validas.length,
        pct: dest.length ? Math.round((validas.length / dest.length) * 100) : 0,
        medio: minutos.length ? minutos.reduce((a, b) => a + b, 0) / minutos.length : null,
      }
    })

    const porPessoa = pessoas
      .map((p) => {
        const t = tempos.get(p.id) ?? []
        return {
          p,
          recebidos: recebidos.get(p.id) ?? 0,
          lidos: lidos.get(p.id) ?? 0,
          medio: t.length ? t.reduce((a, b) => a + b, 0) / t.length : null,
        }
      })
      .filter((x) => x.recebidos > 0)
      .sort((a, b) => (a.medio ?? Infinity) - (b.medio ?? Infinity))

    return { avisos: avisos.sort((a, b) => b.pct - a.pct), porPessoa }
  }, [comunicados, destinos, leituras, pessoas])

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-white/10 bg-surface p-4">
        <h2 className="mb-2 font-heading text-lg font-semibold text-primary">Avisos mais lidos</h2>
        {avisos.length === 0 ? (
          <p className="text-sm text-muted">Nenhum comunicado publicado ainda.</p>
        ) : (
          <ul className="space-y-3">
            {avisos.map(({ c, total, lidos, pct, medio }) => (
              <li key={c.id}>
                <p className="text-sm text-primary">
                  {tipoDe(c).icone} {c.titulo}
                </p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-accent-primary" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-muted">
                  {lidos}/{total} ({pct}%){medio !== null ? ` · leitura em média ${fmtDur(medio)} após publicar` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-surface p-4">
        <h2 className="mb-2 font-heading text-lg font-semibold text-primary">Quem lê mais rápido</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 font-medium">Pessoa</th>
              <th className="py-1 font-medium">Leu</th>
              <th className="py-1 font-medium">Tempo médio</th>
            </tr>
          </thead>
          <tbody>
            {porPessoa.map(({ p, recebidos, lidos, medio }) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="py-1 text-primary">
                  {p.nome} <span className="text-xs text-muted">({p.setor})</span>
                </td>
                <td className="py-1 text-muted">{lidos}/{recebidos}</td>
                <td className="py-1 text-muted">{medio !== null ? fmtDur(medio) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
