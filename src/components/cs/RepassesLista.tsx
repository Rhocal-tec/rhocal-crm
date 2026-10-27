'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import { DESTINOS_REPASSE, RESULTADOS_REPASSE } from '@/lib/cs/constantes'
import type { DadosCS } from '@/lib/cs/useDadosCS'
import type { Database, SetorTipo } from '@/types/database'

type Repasse = Database['public']['Tables']['cs_repasses']['Row']

function destinosDoSetor(setor: SetorTipo): string[] | null {
  if (setor === 'comercial') return ['closer', 'vendedora']
  if (setor === 'compras') return ['compras', 'logistica']
  return null
}

function CartaoRepasse({ r, usuarioId, recarregar }: { r: Repasse; usuarioId: string; recarregar: () => void }) {
  const [supabase] = useState(() => createClient())
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function definir(resultado: string) {
    setErro(null)
    setSalvando(true)
    const pendente = resultado === 'pendente'
    const { error } = await supabase
      .from('cs_repasses')
      .update({
        resultado,
        resolvido_por: pendente ? null : usuarioId,
        resolvido_em: pendente ? null : new Date().toISOString(),
      })
      .eq('id', r.id)
    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    recarregar()
  }

  return (
    <li className="rounded-lg border border-white/10 bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-primary">{r.cliente_nome}</p>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-muted">
          {DESTINOS_REPASSE.find((d) => d.valor === r.destino)?.label ?? r.destino}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {formatarDataSomente(r.criado_em)}
        {r.valor !== null && ` · ${formatarMoeda(r.valor)}`}
      </p>
      <p className="mt-2 text-sm text-primary/90">{r.resumo}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Resultado:</span>
        {RESULTADOS_REPASSE.map((res) => (
          <button
            key={res.valor}
            onClick={() => definir(res.valor)}
            disabled={salvando || r.resultado === res.valor}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              r.resultado === res.valor
                ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
                : 'border-white/15 text-primary/80 hover:bg-white/10'
            }`}
          >
            {res.label}
          </button>
        ))}
      </div>
      {erro && <p className="mt-1 text-xs text-accent-danger">{erro}</p>}
    </li>
  )
}

export function RepassesLista({
  setor,
  dados,
  usuarioId,
  recarregar,
}: {
  setor: SetorTipo
  dados: DadosCS
  usuarioId: string
  recarregar: () => void
}) {
  const [mostrarResolvidos, setMostrarResolvidos] = useState(false)
  const destinos = destinosDoSetor(setor)
  const lista = useMemo(
    () =>
      dados.repasses
        .filter((r) => (destinos ? destinos.includes(r.destino) : true))
        .filter((r) => mostrarResolvidos || r.resultado === 'pendente')
        .sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
    [dados.repasses, destinos, mostrarResolvidos],
  )

  return (
    <div className="flex flex-col gap-3 p-6">
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={mostrarResolvidos} onChange={(e) => setMostrarResolvidos(e.target.checked)} />
        Mostrar já resolvidos
      </label>
      {lista.length === 0 && <p className="text-sm text-muted">Nenhum repasse por aqui.</p>}
      <ul className="flex flex-col gap-3">
        {lista.map((r) => (
          <CartaoRepasse key={r.id} r={r} usuarioId={usuarioId} recarregar={recarregar} />
        ))}
      </ul>
    </div>
  )
}
