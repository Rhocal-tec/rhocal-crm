'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import type { Database, SetorTipo } from '@/types/database'

type PedidoItem = Database['public']['Tables']['pedido_itens']['Row']

function calcularPrecoVenda(custoFinal: number, margemPct: number): number {
  return custoFinal * (1 + margemPct / 100)
}

export function ItensTab({
  itens,
  setor,
  onItemAtualizado,
}: {
  itens: PedidoItem[]
  setor: SetorTipo
  onItemAtualizado: (item: PedidoItem) => void
}) {
  const [supabase] = useState(() => createClient())
  // Estado local do input de margem por item — inicializado a partir do valor
  // já salvo, mas segue solto enquanto o usuário digita (só persiste no blur).
  const [margemPorItem, setMargemPorItem] = useState<Record<string, string>>(() =>
    Object.fromEntries(itens.map((item) => [item.id, item.margem_pct?.toString() ?? ''])),
  )

  // Comercial e gestor veem custo/margem/preço de venda; compras não (já vê o
  // custo real, sem margem comercial, na aba Cotações).
  const veMargem = setor !== 'compras'

  function margemAtual(itemId: string): string {
    return margemPorItem[itemId] ?? ''
  }

  async function salvarMargem(item: PedidoItem, valorStr: string) {
    if (item.custo_final === null) return
    const margem = valorStr.trim() === '' ? null : Number(valorStr)
    if (margem !== null && !Number.isFinite(margem)) return

    const precoVenda = margem === null ? null : calcularPrecoVenda(item.custo_final, margem)

    const { error } = await supabase
      .from('pedido_itens')
      .update({ margem_pct: margem, preco_venda: precoVenda })
      .eq('id', item.id)

    if (!error) {
      onItemAtualizado({ ...item, margem_pct: margem, preco_venda: precoVenda })
    }
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-muted">
            <th className="pb-2 font-medium">Descrição</th>
            <th className="pb-2 font-medium">Qtd.</th>
            <th className="pb-2 font-medium">CA</th>
            {veMargem && (
              <>
                <th className="pb-2 font-medium">Custo final</th>
                <th className="pb-2 font-medium">Margem (%)</th>
                <th className="pb-2 font-medium">Preço de venda</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => {
            const custoPreenchido = item.custo_final !== null
            const margemValor = margemAtual(item.id)
            const margemNumero = Number(margemValor)
            const precoVendaCalculado =
              custoPreenchido && margemValor.trim() !== '' && Number.isFinite(margemNumero)
                ? calcularPrecoVenda(item.custo_final as number, margemNumero)
                : null

            return (
              <tr key={item.id} className="border-b border-white/5">
                <td className="py-2 text-primary">{item.descricao}</td>
                <td className="py-2 font-mono text-primary">{item.quantidade}</td>
                <td className="py-2 font-mono text-primary">{item.ca ?? '—'}</td>
                {veMargem && (
                  <>
                    <td className="py-2 font-mono text-primary">
                      {formatarMoeda(item.custo_final)}
                    </td>
                    {custoPreenchido ? (
                      <>
                        <td className="py-2">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={margemValor}
                            onChange={(e) =>
                              setMargemPorItem((atual) => ({
                                ...atual,
                                [item.id]: e.target.value,
                              }))
                            }
                            onBlur={(e) => salvarMargem(item, e.target.value)}
                            placeholder="0"
                            className="input-field w-20 rounded-md px-2 py-1 font-mono text-sm"
                          />
                        </td>
                        <td className="py-2 font-mono font-medium text-primary">
                          {precoVendaCalculado !== null ? formatarMoeda(precoVendaCalculado) : '—'}
                        </td>
                      </>
                    ) : (
                      <td colSpan={2} className="py-2 text-muted">
                        Aguardando cotação
                      </td>
                    )}
                  </>
                )}
              </tr>
            )
          })}
          {itens.length === 0 && (
            <tr>
              <td colSpan={veMargem ? 6 : 3} className="py-4 text-center text-muted">
                Nenhum item cadastrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
