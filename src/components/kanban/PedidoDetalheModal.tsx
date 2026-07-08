'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { STATUS_LABELS } from '@/lib/kanban/status'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import { CotacoesTab } from './CotacoesTab'
import { ItensTab } from './ItensTab'
import { OmieOrcamentoSection } from './OmieOrcamentoSection'
import type { Database, SetorTipo } from '@/types/database'

type Pedido = Database['public']['Tables']['pedidos']['Row']
type PedidoItem = Database['public']['Tables']['pedido_itens']['Row']

type Aba = 'dados' | 'itens' | 'cotacoes'

export function PedidoDetalheModal({
  pedidoId,
  onClose,
  setor,
}: {
  pedidoId: string | null
  onClose: () => void
  setor: SetorTipo
}) {
  const [supabase] = useState(() => createClient())
  const [aba, setAba] = useState<Aba>('dados')
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [itens, setItens] = useState<PedidoItem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [previsaoChegada, setPrevisaoChegada] = useState('')

  const vePainelCompras = setor === 'compras' || setor === 'gestor'
  const veMargem = setor !== 'compras'
  const totalPedido = itens.reduce((soma, item) => soma + (item.preco_venda ?? 0), 0)

  function handleItemAtualizado(itemAtualizado: PedidoItem) {
    setItens((atual) =>
      atual.map((item) => (item.id === itemAtualizado.id ? itemAtualizado : item)),
    )
  }

  useEffect(() => {
    if (!pedidoId) {
      setPedido(null)
      setItens([])
      setAba('dados')
      return
    }

    let ativo = true
    setCarregando(true)

    async function carregar() {
      const [{ data: pedidoData }, { data: itensData }] = await Promise.all([
        supabase.from('pedidos').select('*').eq('id', pedidoId as string).single(),
        supabase
          .from('pedido_itens')
          .select('*')
          .eq('pedido_id', pedidoId as string)
          .order('criado_em', { ascending: true }),
      ])

      if (!ativo) return
      setPedido(pedidoData ?? null)
      setItens(itensData ?? [])
      setPrevisaoChegada(pedidoData?.previsao_chegada?.slice(0, 10) ?? '')
      setCarregando(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [pedidoId, supabase])

  async function salvarPrevisaoChegada(valor: string) {
    if (!pedido) return
    const novoValor = valor || null

    const { error } = await supabase
      .from('pedidos')
      .update({ previsao_chegada: novoValor })
      .eq('id', pedido.id)

    if (!error) {
      setPedido((atual) => (atual ? { ...atual, previsao_chegada: novoValor } : atual))
    }
  }

  return (
    <Modal
      open={pedidoId !== null}
      onClose={onClose}
      title={pedido ? `Pedido #${pedido.numero}` : 'Pedido'}
      widthClassName="max-w-3xl"
    >
      {carregando || !pedido ? (
        <div className="py-8 text-center text-sm text-muted">Carregando…</div>
      ) : (
        <div>
          {veMargem && (
            <div className="mb-3 flex items-center justify-between rounded-md bg-surface-alt px-3 py-2 text-sm">
              <span className="text-muted">Total do pedido (preço de venda)</span>
              <span className="font-mono font-semibold text-primary">
                {formatarMoeda(totalPedido)}
              </span>
            </div>
          )}

          <div className="flex gap-5 border-b border-white/10">
            <button
              onClick={() => setAba('dados')}
              className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                aba === 'dados'
                  ? 'border-accent-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary/80'
              }`}
            >
              Dados
            </button>
            <button
              onClick={() => setAba('itens')}
              className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                aba === 'itens'
                  ? 'border-accent-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary/80'
              }`}
            >
              Itens ({itens.length})
            </button>
            {vePainelCompras && (
              <button
                onClick={() => setAba('cotacoes')}
                className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                  aba === 'cotacoes'
                    ? 'border-accent-primary text-primary'
                    : 'border-transparent text-muted hover:text-primary/80'
                }`}
              >
                Cotações
              </button>
            )}
          </div>

          {aba === 'dados' && (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted">Cliente</dt>
                <dd className="font-medium text-primary">{pedido.cliente_nome}</dd>
              </div>
              <div>
                <dt className="text-muted">Número do pedido</dt>
                <dd className="font-mono font-medium text-primary">#{pedido.numero}</dd>
              </div>
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="font-medium text-primary">{STATUS_LABELS[pedido.status]}</dd>
              </div>
              <div>
                <dt className="text-muted">Última movimentação</dt>
                <dd className="font-medium text-primary">
                  {new Date(pedido.ultima_movimentacao).toLocaleDateString('pt-BR')}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Previsão de chegada</dt>
                {vePainelCompras ? (
                  <input
                    type="date"
                    value={previsaoChegada}
                    onChange={(e) => setPrevisaoChegada(e.target.value)}
                    onBlur={(e) => salvarPrevisaoChegada(e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1 text-sm"
                  />
                ) : (
                  <dd className="font-medium text-primary">
                    {formatarDataSomente(pedido.previsao_chegada)}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-muted">Entrega ao cliente</dt>
                <dd className="font-medium text-primary">
                  {formatarDataSomente(pedido.data_entrega_cliente)}
                </dd>
              </div>
            </dl>
          )}

          {aba === 'dados' && (
            <OmieOrcamentoSection
              pedido={pedido}
              itens={itens}
              setor={setor}
              onPedidoAtualizado={setPedido}
            />
          )}

          {aba === 'itens' && (
            <ItensTab itens={itens} setor={setor} onItemAtualizado={handleItemAtualizado} />
          )}

          {aba === 'cotacoes' && vePainelCompras && <CotacoesTab itens={itens} />}
        </div>
      )}
    </Modal>
  )
}
