'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarDataSomente } from '@/lib/kanban/formatacao'
import type { ClienteInteligencia } from '@/lib/inteligencia/agregar'

// Fase 36.2: painel fixo no topo da página, INDEPENDENTE dos filtros de
// segmentação aplicados mais abaixo — por isso recebe a lista completa de
// clientes (já escopada pela empresa ativa), não a filtrada.
export function AlertasChurn({
  clientes,
  onCriarTarefa,
  onCriarTarefaSemTelefone,
  chavesComTarefa,
}: {
  clientes: ClienteInteligencia[]
  onCriarTarefa: (cliente: ClienteInteligencia) => void
  onCriarTarefaSemTelefone: (cliente: ClienteInteligencia) => void
  chavesComTarefa: Set<string>
}) {
  const [supabase] = useState(() => createClient())
  // Vínculos (oportunidade/pedido) que já têm tarefa de churn em aberto — o cliente
  // some do card enquanto a tarefa existir, inclusive depois de recarregar a página.
  const [vinculosComTarefa, setVinculosComTarefa] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase
      .from('tarefas')
      .select('oportunidade_id, pedido_id')
      .ilike('descricao', '%risco de churn%')
      .eq('concluida', false)
      .eq('excluida', false)
      .then(({ data }) => {
        const ids = new Set<string>()
        for (const t of data ?? []) {
          if (t.oportunidade_id) ids.add(t.oportunidade_id)
          if (t.pedido_id) ids.add(t.pedido_id)
        }
        setVinculosComTarefa(ids)
      })
  }, [supabase, chavesComTarefa])

  const emRisco = clientes.filter(
    (c) =>
      c.emRiscoChurn &&
      !chavesComTarefa.has(c.chave) &&
      !(c.vinculoTarefaId && vinculosComTarefa.has(c.vinculoTarefaId)),
  )

  if (emRisco.length === 0) return null

  return (
    <div className="rounded-lg border border-accent-danger/30 bg-accent-danger/10 p-4">
      <p className="text-sm font-semibold text-accent-danger">
        ⚠️ Clientes em risco de churn ({emRisco.length})
      </p>
      <p className="mt-1 text-xs text-accent-danger/80">
        Última compra bem depois do intervalo médio de recompra desse cliente — provável sinal de
        que ele parou de comprar.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {emRisco.map((cliente) => (
          <div
            key={cliente.chave}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent-danger/20 bg-surface px-3 py-2"
          >
            <div>
              <span className="text-sm font-medium text-primary">{cliente.nome}</span>
              <p className="mt-0.5 text-xs text-muted">
                Última compra: {cliente.ultimaCompra ? formatarDataSomente(cliente.ultimaCompra) : '—'}
                {cliente.diasDesdeUltimaCompra !== null && ` (${cliente.diasDesdeUltimaCompra} dias atrás)`}
                {cliente.intervaloMedioDiasCompra !== null &&
                  ` · intervalo médio: ${cliente.intervaloMedioDiasCompra} dias`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!cliente.telefone && (
                <button
                  type="button"
                  onClick={() => onCriarTarefaSemTelefone(cliente)}
                  title="Cliente sem telefone cadastrado — cria uma tarefa para conseguir o número"
                  className="rounded-md border border-amber-400/40 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-400/10"
                >
                  📵 Sem telefone — criar tarefa
                </button>
              )}
            <button
              type="button"
              onClick={() => onCriarTarefa(cliente)}
              className="rounded-md border border-accent-danger/40 px-2.5 py-1 text-xs font-medium text-accent-danger transition-colors hover:bg-accent-danger/15"
            >
              Criar tarefa
            </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
