'use client'

import { useMemo } from 'react'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import type { ClienteInteligencia } from '@/lib/inteligencia/agregar'

// Fase 35: cards de resumo, mesmo padrão visual do Painel executivo (fase
// 14) — refletem o conjunto FILTRADO (clientesFiltrados), não a base inteira,
// pra dar feedback imediato de quantos clientes cada filtro deixa de pé.
export function CardsResumoInteligencia({ clientes }: { clientes: ClienteInteligencia[] }) {
  const resumo = useMemo(() => {
    let verde = 0
    let amarelo = 0
    let vermelho = 0
    let cinza = 0
    let valorPipeline = 0
    let somaValorAcumulado = 0
    let somaPedidosEfetuados = 0

    for (const c of clientes) {
      if (c.temperaturaAutomatica === 'verde') verde += 1
      else if (c.temperaturaAutomatica === 'amarelo') amarelo += 1
      else if (c.temperaturaAutomatica === 'vermelho') vermelho += 1
      else cinza += 1

      valorPipeline += c.valorEstimadoAberto
      somaValorAcumulado += c.valorTotalAcumulado
      somaPedidosEfetuados += c.qtdPedidosEfetuados
    }

    const ticketMedioGeral = somaPedidosEfetuados > 0 ? somaValorAcumulado / somaPedidosEfetuados : null

    return { verde, amarelo, vermelho, cinza, valorPipeline, ticketMedioGeral }
  }, [clientes])

  const cards = [
    { label: 'Ativos (verde)', valor: resumo.verde, corTexto: 'text-accent-success' },
    { label: 'Esfriando (amarelo)', valor: resumo.amarelo, corTexto: 'text-accent-alert' },
    { label: 'Frios (vermelho)', valor: resumo.vermelho, corTexto: 'text-accent-danger' },
    { label: 'Sem compra (cinza)', valor: resumo.cinza, corTexto: 'text-muted' },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-white/10 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{card.label}</p>
          <p className={`mt-2 font-mono text-2xl font-semibold ${card.corTexto}`}>{card.valor}</p>
        </div>
      ))}

      <div className="rounded-lg border border-white/10 bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Valor em pipeline</p>
        <p className="mt-2 font-mono text-2xl font-semibold text-primary">
          {formatarMoeda(resumo.valorPipeline)}
        </p>
        <p className="mt-1 text-[11px] text-muted">Soma do valor estimado das oportunidades abertas</p>
      </div>

      <div className="rounded-lg border border-white/10 bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Ticket médio geral</p>
        <p className="mt-2 font-mono text-2xl font-semibold text-primary">
          {resumo.ticketMedioGeral !== null ? formatarMoeda(resumo.ticketMedioGeral) : '—'}
        </p>
      </div>
    </div>
  )
}
