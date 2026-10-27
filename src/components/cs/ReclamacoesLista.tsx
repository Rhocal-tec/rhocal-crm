'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarDataSomente } from '@/lib/kanban/formatacao'
import { STATUS_RECLAMACAO } from '@/lib/cs/constantes'
import type { DadosCS } from '@/lib/cs/useDadosCS'
import type { Database, SetorTipo } from '@/types/database'

type Reclamacao = Database['public']['Tables']['cs_reclamacoes']['Row']

function areasDoSetor(setor: SetorTipo): string[] | null {
  if (setor === 'comercial') return ['Comercial']
  if (setor === 'compras') return ['Compras', 'Logística']
  return null
}

function CartaoReclamacao({
  r,
  recarregar,
  alertaHoras,
}: {
  r: Reclamacao
  recarregar: () => void
  alertaHoras: number
}) {
  const [supabase] = useState(() => createClient())
  const [solucao, setSolucao] = useState(r.solucao ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const fechada = r.status === 'resolvida' || r.status === 'retorno_dado'
  const horasRestantes = (new Date(r.prazo_em).getTime() - Date.now()) / 3_600_000
  const vencida = !fechada && horasRestantes < 0
  const alerta = !fechada && !vencida && horasRestantes <= alertaHoras

  async function mudar(status: string) {
    setErro(null)
    setSalvando(true)
    const { error } = await supabase
      .from('cs_reclamacoes')
      .update({
        status,
        solucao: solucao.trim() || null,
        retorno_em: status === 'retorno_dado' ? new Date().toISOString() : r.retorno_em,
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
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${
            vencida
              ? 'border-accent-danger/40 bg-accent-danger/15 text-accent-danger'
              : alerta
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
                : 'border-white/15 text-muted'
          }`}
        >
          {fechada
            ? STATUS_RECLAMACAO.find((s) => s.valor === r.status)?.label
            : vencida
              ? `Vencida há ${Math.ceil(-horasRestantes)} h`
              : `Prazo em ${Math.ceil(horasRestantes)} h`}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {r.categoria} · área {r.area_responsavel} · aberta em {formatarDataSomente(r.aberta_em)}
      </p>
      {r.descricao && <p className="mt-2 text-sm text-primary/90">{r.descricao}</p>}
      <div className="mt-3 flex flex-col gap-2">
        <textarea
          value={solucao}
          onChange={(e) => setSolucao(e.target.value)}
          rows={2}
          placeholder="Solução / andamento"
          className="input-field w-full rounded-md px-2.5 py-1.5 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {STATUS_RECLAMACAO.filter((s) => s.valor !== r.status).map((s) => (
            <button
              key={s.valor}
              onClick={() => mudar(s.valor)}
              disabled={salvando}
              className="rounded-md border border-white/15 px-3 py-1 text-xs font-medium text-primary/80 hover:bg-white/10 disabled:opacity-50"
            >
              Marcar: {s.label}
            </button>
          ))}
        </div>
        {erro && <p className="text-xs text-accent-danger">{erro}</p>}
      </div>
    </li>
  )
}

export function ReclamacoesLista({
  setor,
  dados,
  recarregar,
}: {
  setor: SetorTipo
  dados: DadosCS
  usuarioId: string
  recarregar: () => void
}) {
  const [mostrarFechadas, setMostrarFechadas] = useState(false)
  const areas = areasDoSetor(setor)
  const lista = useMemo(
    () =>
      dados.reclamacoes
        .filter((r) => (areas ? areas.includes(r.area_responsavel) : true))
        .filter((r) => mostrarFechadas || (r.status !== 'resolvida' && r.status !== 'retorno_dado'))
        .sort((a, b) => a.prazo_em.localeCompare(b.prazo_em)),
    [dados.reclamacoes, areas, mostrarFechadas],
  )

  return (
    <div className="flex flex-col gap-3 p-6">
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={mostrarFechadas} onChange={(e) => setMostrarFechadas(e.target.checked)} />
        Mostrar resolvidas
      </label>
      {lista.length === 0 && <p className="text-sm text-muted">Nenhuma reclamação por aqui.</p>}
      <ul className="flex flex-col gap-3">
        {lista.map((r) => (
          <CartaoReclamacao
            key={r.id}
            r={r}
            recarregar={recarregar}
            alertaHoras={dados.config.alerta_reclamacao_horas ?? 12}
          />
        ))}
      </ul>
    </div>
  )
}
