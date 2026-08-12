'use client'

import { formatarCnpjInput, formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import type { ClienteInteligencia } from '@/lib/inteligencia/agregar'
import { TEMPERATURA_AUTOMATICA_BADGE_CLASSES, SCORE_PROPENSAO_LABELS } from '@/lib/inteligencia/temperatura-cores'
import { TEMPERATURA_AUTOMATICA_LABELS } from '@/lib/inteligencia/agregar'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'

export type OrdemScore = 'asc' | 'desc' | null

export function TabelaInteligencia({
  clientes,
  selecionados,
  onAlternarSelecao,
  onAlternarSelecionarTodos,
  onVerFicha,
  ordemScore,
  onAlternarOrdemScore,
}: {
  clientes: ClienteInteligencia[]
  selecionados: Set<string>
  onAlternarSelecao: (chave: string) => void
  onAlternarSelecionarTodos: () => void
  onVerFicha: (cliente: ClienteInteligencia) => void
  ordemScore: OrdemScore
  onAlternarOrdemScore: () => void
}) {
  const todosMarcados = clientes.length > 0 && clientes.every((c) => selecionados.has(c.chave))

  if (clientes.length === 0) {
    return (
      <p className="mt-8 text-center text-sm text-muted">
        Nenhum cliente encontrado para os filtros atuais.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2.5">
              <input
                type="checkbox"
                checked={todosMarcados}
                onChange={onAlternarSelecionarTodos}
                className="h-4 w-4 accent-accent-primary"
                aria-label="Selecionar todos"
              />
            </th>
            <th className="px-3 py-2.5 font-medium">Nome</th>
            <th className="px-3 py-2.5 font-medium">CNPJ</th>
            <th className="px-3 py-2.5 font-medium">Cidade/UF</th>
            <th className="px-3 py-2.5 font-medium">Temp. automática</th>
            <th className="px-3 py-2.5 font-medium">Temp. manual</th>
            <th className="px-3 py-2.5 font-medium">
              <button
                type="button"
                onClick={onAlternarOrdemScore}
                className="flex items-center gap-1 font-medium text-muted transition-colors hover:text-primary"
              >
                Score
                <span className="text-[10px]">
                  {ordemScore === 'desc' ? '▼' : ordemScore === 'asc' ? '▲' : '↕'}
                </span>
              </button>
            </th>
            <th className="px-3 py-2.5 font-medium">Última compra</th>
            <th className="px-3 py-2.5 font-medium">Qtd. pedidos</th>
            <th className="px-3 py-2.5 font-medium">Ticket médio</th>
            <th className="px-3 py-2.5 font-medium">Etapa funil</th>
            <th className="px-3 py-2.5 font-medium">Origem</th>
            <th className="px-3 py-2.5 font-medium">Vendedor</th>
            <th className="px-3 py-2.5 font-medium">Interações</th>
            <th className="px-3 py-2.5 font-medium" />
          </tr>
        </thead>
        <tbody>
          {clientes.map((cliente) => (
            <tr key={cliente.chave} className="border-t border-white/5 hover:bg-white/5">
              <td className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selecionados.has(cliente.chave)}
                  onChange={() => onAlternarSelecao(cliente.chave)}
                  className="h-4 w-4 accent-accent-primary"
                  aria-label={`Selecionar ${cliente.nome}`}
                />
              </td>
              <td className="px-3 py-2.5">
                <span className="font-medium text-primary">{cliente.nome}</span>
                {cliente.razaoSocial && cliente.razaoSocial !== cliente.nome && (
                  <span className="block text-xs text-muted">{cliente.razaoSocial}</span>
                )}
              </td>
              <td className="px-3 py-2.5 font-mono text-xs text-primary/80">
                {cliente.cnpj ? formatarCnpjInput(cliente.cnpj) : '—'}
              </td>
              <td className="px-3 py-2.5 text-primary/80">
                {cliente.cidade ? `${cliente.cidade}${cliente.estado ? `/${cliente.estado}` : ''}` : '—'}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${TEMPERATURA_AUTOMATICA_BADGE_CLASSES[cliente.temperaturaAutomatica]}`}
                >
                  {TEMPERATURA_AUTOMATICA_LABELS[cliente.temperaturaAutomatica]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-primary/80">{cliente.temperaturaManual ?? '—'}</td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TEMPERATURA_AUTOMATICA_BADGE_CLASSES[cliente.faixaScorePropensao]}`}
                  title={SCORE_PROPENSAO_LABELS[cliente.faixaScorePropensao as 'verde' | 'amarelo' | 'vermelho']}
                >
                  <span className="font-mono">{cliente.scorePropensao}</span>
                </span>
              </td>
              <td className="px-3 py-2.5 text-primary/80">
                {cliente.ultimaCompra ? formatarDataSomente(cliente.ultimaCompra) : '—'}
              </td>
              <td className="px-3 py-2.5 font-mono text-primary/80">
                {cliente.qtdPedidosEfetuados}
                {cliente.qtdPedidosTotal !== cliente.qtdPedidosEfetuados && (
                  <span className="text-muted"> /{cliente.qtdPedidosTotal}</span>
                )}
              </td>
              <td className="px-3 py-2.5 font-mono text-primary/80">
                {cliente.ticketMedio !== null ? formatarMoeda(cliente.ticketMedio) : '—'}
              </td>
              <td className="px-3 py-2.5 text-primary/80">
                {cliente.etapaFunil ? OPORTUNIDADE_STATUS_LABELS[cliente.etapaFunil] : '—'}
              </td>
              <td className="px-3 py-2.5 text-primary/80">{cliente.origem ?? '—'}</td>
              <td className="px-3 py-2.5 text-primary/80">{cliente.vendedorNome ?? '—'}</td>
              <td className="px-3 py-2.5 font-mono text-primary/80">{cliente.qtdInteracoes}</td>
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => onVerFicha(cliente)}
                  className="rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-primary/80 transition-colors hover:bg-white/10"
                >
                  Ver ficha
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
