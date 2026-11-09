'use client'

// Pop-up imediato para quem recebe um repasse da CS: assim que a Laís repassa
// o cliente, a pessoa do setor responsável vê a janela com o que foi relatado.
// Consulta a cada 15s (e ao voltar para a aba). "Visto" fica guardado no
// navegador, para não repetir o aviso.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { DESTINOS_REPASSE } from '@/lib/cs/constantes'
import type { Database } from '@/types/database'

type Repasse = Database['public']['Tables']['cs_repasses']['Row']

const INTERVALO_MS = 15_000
const JANELA_MS = 3 * 86_400_000

function chaveVistos(usuarioId: string): string {
  return `cs-repasses-vistos-${usuarioId}`
}

function lerVistos(usuarioId: string): string[] {
  try {
    const bruto = window.localStorage.getItem(chaveVistos(usuarioId))
    const lista = bruto ? (JSON.parse(bruto) as unknown) : []
    return Array.isArray(lista) ? (lista as string[]) : []
  } catch {
    return []
  }
}

function gravarVistos(usuarioId: string, ids: string[]) {
  try {
    window.localStorage.setItem(chaveVistos(usuarioId), JSON.stringify(ids.slice(-300)))
  } catch {
    // sem localStorage: segue sem lembrar
  }
}

export function RepasseAlerta() {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [fila, setFila] = useState<Repasse[]>([])
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const usuarioId = user?.id ?? null

  const buscar = useCallback(async () => {
    if (!usuarioId) return
    const desde = new Date(Date.now() - JANELA_MS).toISOString()
    const { data, error } = await supabase
      .from('cs_repasses')
      .select('*')
      .eq('destinatario_id', usuarioId)
      .eq('resultado', 'pendente')
      .gte('criado_em', desde)
      .order('criado_em', { ascending: true })
    if (error || !data) return
    const vistos = new Set(lerVistos(usuarioId))
    const novos = data.filter((r) => !vistos.has(r.id))
    setFila((atual) => {
      const idsAtuais = new Set(atual.map((r) => r.id))
      const mesclado = [...atual, ...novos.filter((r) => !idsAtuais.has(r.id))]
      return mesclado.length === atual.length ? atual : mesclado
    })
    const faltantes = Array.from(new Set(novos.map((r) => r.criado_por).filter((x): x is string => !!x)))
    if (faltantes.length > 0) {
      const { data: perfis } = await supabase.from('profiles').select('id, nome').in('id', faltantes)
      setNomes((n) => ({ ...n, ...Object.fromEntries((perfis ?? []).map((p) => [p.id, p.nome])) }))
    }
  }, [supabase, usuarioId])

  useEffect(() => {
    if (!usuarioId) return
    void buscar()
    const t = setInterval(() => void buscar(), INTERVALO_MS)
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void buscar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [usuarioId, buscar])

  const atual = fila[0]
  if (!usuarioId || !atual) return null

  function entendi() {
    if (!usuarioId || !atual) return
    gravarVistos(usuarioId, [...lerVistos(usuarioId), atual.id])
    setFila((f) => f.slice(1))
  }

  const destino = DESTINOS_REPASSE.find((d) => d.valor === atual.destino)?.label ?? atual.destino
  const quem = atual.criado_por ? (nomes[atual.criado_por] ?? 'CS') : 'CS'

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Repasse da CS"
        style={{ backgroundColor: 'var(--bg-surface)' }}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-accent-alert/50 shadow-2xl"
      >
        <div className="flex items-center justify-between bg-accent-alert/15 px-5 py-3">
          <h2 className="font-heading text-lg font-semibold tracking-wide text-primary">📨 Repasse da CS para você</h2>
          {fila.length > 1 && <span className="text-xs text-muted">+{fila.length - 1} na fila</span>}
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted">Cliente</p>
            <p className="font-medium text-primary">{atual.cliente_nome}</p>
            {atual.cliente_cnpj && <p className="text-xs text-muted">CNPJ {atual.cliente_cnpj}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Repassado por</p>
              <p className="text-primary">{quem}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Destino</p>
              <p className="text-primary">{destino}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted">O que foi relatado</p>
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-white/5 p-3 text-primary">{atual.resumo}</p>
          </div>
          <p className="text-xs text-muted">
            Enviado em {new Date(atual.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Uma tarefa
            com este resumo também foi criada para você.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          <Link
            href="/tarefas"
            onClick={entendi}
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-primary hover:bg-white/10"
          >
            Ver minhas tarefas
          </Link>
          <button onClick={entendi} className="rounded-md bg-accent-primary px-4 py-1.5 text-sm font-semibold text-white">
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
