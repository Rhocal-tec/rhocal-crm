'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MoedaInput } from '@/components/ui/MoedaInput'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import { corMargemPrecoVenda, estiloCorMargem } from '@/lib/kanban/margem-cor'
import type { Database, SetorTipo } from '@/types/database'

type PedidoItem = Database['public']['Tables']['pedido_itens']['Row']

type CampoTexto = 'tamanho' | 'numero' | 'cor' | 'observacao'
type StatusCodigoOmie = 'idle' | 'buscando' | 'encontrado' | 'nao_encontrado' | 'erro'

interface SpecForm {
  descricao: string
  tamanho: string
  numero: string
  cor: string
  observacao: string
}

function specVazio(item: PedidoItem): SpecForm {
  return {
    descricao: item.descricao,
    tamanho: item.tamanho ?? '',
    numero: item.numero ?? '',
    cor: item.cor ?? '',
    observacao: item.observacao ?? '',
  }
}

export function ItensTab({
  itens,
  setor,
  orcamentoDireto,
  somenteLeitura = false,
  onItemAtualizado,
}: {
  itens: PedidoItem[]
  setor: SetorTipo
  orcamentoDireto: boolean
  somenteLeitura?: boolean
  onItemAtualizado: (item: PedidoItem) => void
}) {
  const [supabase] = useState(() => createClient())
  // Estado local dos inputs de preço de venda, das especificações (descrição/
  // tamanho/número/cor/observação) e do campo de busca de código Omie por
  // item — inicializado a partir do valor já salvo, mas segue solto enquanto
  // o usuário digita (só persiste no blur).
  const [precoVendaPorItem, setPrecoVendaPorItem] = useState<Record<string, string>>(() =>
    Object.fromEntries(itens.map((item) => [item.id, item.preco_venda?.toString() ?? ''])),
  )
  const [specPorItem, setSpecPorItem] = useState<Record<string, SpecForm>>(() =>
    Object.fromEntries(itens.map((item) => [item.id, specVazio(item)])),
  )
  const [codigoPorItem, setCodigoPorItem] = useState<Record<string, string>>({})
  // O código digitado não é persistido por si só — só o codigo_produto_omie
  // resultante da busca. Itens que já chegam com codigo_produto_omie
  // preenchido (por qualquer via) começam com o indicador de sucesso.
  const [statusCodigoPorItem, setStatusCodigoPorItem] = useState<Record<string, StatusCodigoOmie>>(
    () =>
      Object.fromEntries(
        itens.map((item) => [item.id, item.codigo_produto_omie !== null ? 'encontrado' : 'idle']),
      ),
  )

  // Comercial e gestor veem custo final e editam o preço de venda; compras
  // não (já vê o custo real na aba Cotações). Fase 29: durante EM_COTACAO o
  // comercial fica sem acesso a nada disso também (somenteLeitura).
  const veMargem = setor !== 'compras' && !somenteLeitura
  // Fase 28.3: itens em estoque são um assunto exclusivo do comercial — compras
  // não os enxerga em lugar nenhum do sistema, nem edita a marcação.
  const podeMarcarEmEstoque = setor !== 'compras' && !somenteLeitura
  const itensVisiveis = setor === 'compras' ? itens.filter((item) => !item.em_estoque) : itens

  // Preço de venda só é preenchível sem custo_final quando o item está em
  // estoque (não passa por cotação) ou o pedido inteiro é orçamento direto
  // (fase 19). Fora isso, o item ainda depende do custo liberado por Compras.
  function podeEditarPrecoVenda(item: PedidoItem): boolean {
    return orcamentoDireto || item.em_estoque || item.custo_final !== null
  }

  function precoVendaAtual(itemId: string): string {
    return precoVendaPorItem[itemId] ?? ''
  }

  function spec(itemId: string): SpecForm {
    return (
      specPorItem[itemId] ?? { descricao: '', tamanho: '', numero: '', cor: '', observacao: '' }
    )
  }

  function atualizarSpecCampo(itemId: string, campo: keyof SpecForm, valor: string) {
    setSpecPorItem((atual) => ({
      ...atual,
      [itemId]: { ...spec(itemId), [campo]: valor },
    }))
  }

  async function salvarPrecoVenda(item: PedidoItem, valorStr: string) {
    const precoVenda = valorStr.trim() === '' ? null : Number(valorStr)
    if (precoVenda !== null && !Number.isFinite(precoVenda)) return

    const { error } = await supabase
      .from('pedido_itens')
      .update({ preco_venda: precoVenda })
      .eq('id', item.id)

    if (!error) {
      onItemAtualizado({ ...item, preco_venda: precoVenda })
    }
  }

  async function salvarDescricao(item: PedidoItem, valorStr: string) {
    const valor = valorStr.trim()
    if (!valor || valor === item.descricao) return

    const { error } = await supabase
      .from('pedido_itens')
      .update({ descricao: valor })
      .eq('id', item.id)

    if (!error) onItemAtualizado({ ...item, descricao: valor })
  }

  async function alternarEmEstoque(item: PedidoItem, valor: boolean) {
    const { error } = await supabase
      .from('pedido_itens')
      .update({ em_estoque: valor })
      .eq('id', item.id)

    if (!error) onItemAtualizado({ ...item, em_estoque: valor })
  }

  async function salvarSpecCampo(item: PedidoItem, campo: CampoTexto, valorStr: string) {
    const valor = valorStr.trim() === '' ? null : valorStr.trim()
    if (valor === (item[campo] ?? null)) return

    const atualizacao =
      campo === 'tamanho'
        ? { tamanho: valor }
        : campo === 'numero'
          ? { numero: valor }
          : campo === 'cor'
            ? { cor: valor }
            : { observacao: valor }

    const { error } = await supabase.from('pedido_itens').update(atualizacao).eq('id', item.id)

    if (!error) onItemAtualizado({ ...item, [campo]: valor })
  }

  function atualizarCodigoInput(itemId: string, valor: string) {
    setCodigoPorItem((atual) => ({ ...atual, [itemId]: valor }))
    setStatusCodigoPorItem((atual) => ({ ...atual, [itemId]: 'idle' }))
  }

  async function handleBlurCodigo(item: PedidoItem) {
    const codigo = (codigoPorItem[item.id] ?? '').trim()
    if (!codigo) {
      // Campo esvaziado sem buscar de novo: volta ao indicador de vínculo já
      // existente (se houver), sem disparar nova consulta.
      setStatusCodigoPorItem((atual) => ({
        ...atual,
        [item.id]: item.codigo_produto_omie !== null ? 'encontrado' : 'idle',
      }))
      return
    }

    setStatusCodigoPorItem((atual) => ({ ...atual, [item.id]: 'buscando' }))

    try {
      const resposta = await fetch('/api/omie/buscar-produto-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, pedidoId: item.pedido_id }),
      })
      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok || !dados || dados.erro) {
        setStatusCodigoPorItem((atual) => ({ ...atual, [item.id]: 'erro' }))
        return
      }

      if (dados.encontrado && dados.produto) {
        const { error } = await supabase
          .from('pedido_itens')
          .update({
            codigo_produto_omie: dados.produto.codigoProduto,
            descricao: dados.produto.descricao,
          })
          .eq('id', item.id)

        if (error) {
          setStatusCodigoPorItem((atual) => ({ ...atual, [item.id]: 'erro' }))
          return
        }

        onItemAtualizado({
          ...item,
          codigo_produto_omie: dados.produto.codigoProduto,
          descricao: dados.produto.descricao,
        })
        setSpecPorItem((atual) => ({
          ...atual,
          [item.id]: { ...spec(item.id), descricao: dados.produto.descricao },
        }))
        setStatusCodigoPorItem((atual) => ({ ...atual, [item.id]: 'encontrado' }))
      } else {
        setStatusCodigoPorItem((atual) => ({ ...atual, [item.id]: 'nao_encontrado' }))
      }
    } catch {
      setStatusCodigoPorItem((atual) => ({ ...atual, [item.id]: 'erro' }))
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {itensVisiveis.map((item) => {
        const itemSpec = spec(item.id)
        const statusCodigo = statusCodigoPorItem[item.id] ?? 'idle'
        const corMargem = corMargemPrecoVenda(item.custo_final, Number(precoVendaAtual(item.id)))

        const detalhes = [
          item.tamanho?.trim() ? `Tam. ${item.tamanho.trim()}` : null,
          item.numero?.trim() ? `Nº ${item.numero.trim()}` : null,
          item.cor?.trim() ? `Cor ${item.cor.trim()}` : null,
        ].filter((detalhe): detalhe is string => detalhe !== null)

        return (
          <div key={item.id} className="rounded-lg border border-white/10 bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-1 flex-wrap gap-2">
                {!somenteLeitura && (
                  <div className="min-w-[130px] flex-1">
                    <label className="block text-xs text-muted">Código Omie</label>
                    <div className="relative mt-1">
                      <input
                        type="text"
                        value={codigoPorItem[item.id] ?? ''}
                        onChange={(e) => atualizarCodigoInput(item.id, e.target.value)}
                        onBlur={() => handleBlurCodigo(item)}
                        placeholder={
                          item.codigo_produto_omie !== null ? `#${item.codigo_produto_omie}` : '—'
                        }
                        className="input-field w-full rounded-md px-2 py-1.5 pr-7 font-mono text-sm"
                      />
                      {statusCodigo === 'buscando' && (
                        <span
                          aria-hidden="true"
                          className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-accent-primary"
                        />
                      )}
                      {statusCodigo === 'encontrado' && (
                        <span
                          aria-hidden="true"
                          title="Produto vinculado ao Omie"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold text-accent-success"
                        >
                          ✓
                        </span>
                      )}
                    </div>
                    {statusCodigo === 'encontrado' && (
                      <p className="mt-1 text-[11px] text-accent-success">Vinculado ao Omie</p>
                    )}
                    {statusCodigo === 'nao_encontrado' && (
                      <p className="mt-1 text-[11px] text-muted">Código não encontrado no Omie.</p>
                    )}
                    {statusCodigo === 'erro' && (
                      <p className="mt-1 text-[11px] text-accent-danger">
                        Não foi possível consultar o Omie agora.
                      </p>
                    )}
                  </div>
                )}
                <div className="min-w-[220px] flex-[2]">
                  <label className="block text-xs text-muted">Descrição</label>
                  {somenteLeitura ? (
                    <p className="mt-1 text-sm text-primary">{itemSpec.descricao}</p>
                  ) : (
                    <input
                      type="text"
                      value={itemSpec.descricao}
                      onChange={(e) => atualizarSpecCampo(item.id, 'descricao', e.target.value)}
                      onBlur={(e) => salvarDescricao(item, e.target.value)}
                      className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                    />
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 pt-5 font-mono text-xs text-muted">
                <span>Qtd. {item.quantidade}</span>
                {item.ca && <span>CA {item.ca}</span>}
                {item.em_estoque && (
                  <span className="inline-flex items-center rounded-full border border-accent-compras/40 bg-accent-compras/15 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-accent-compras">
                    Em estoque
                  </span>
                )}
              </div>
            </div>

            {detalhes.length > 0 && (
              <p className="mt-2 text-xs text-primary/70">{detalhes.join(' · ')}</p>
            )}

            {item.observacao && (
              <p className="mt-2 whitespace-pre-wrap rounded-md bg-surface-alt px-3 py-2 text-xs text-primary/80">
                {item.observacao}
              </p>
            )}

            {!somenteLeitura && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-muted">Tamanho</label>
                  <input
                    type="text"
                    value={itemSpec.tamanho}
                    onChange={(e) => atualizarSpecCampo(item.id, 'tamanho', e.target.value)}
                    onBlur={(e) => salvarSpecCampo(item, 'tamanho', e.target.value)}
                    placeholder="—"
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Número</label>
                  <input
                    type="text"
                    value={itemSpec.numero}
                    onChange={(e) => atualizarSpecCampo(item.id, 'numero', e.target.value)}
                    onBlur={(e) => salvarSpecCampo(item, 'numero', e.target.value)}
                    placeholder="—"
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Cor</label>
                  <input
                    type="text"
                    value={itemSpec.cor}
                    onChange={(e) => atualizarSpecCampo(item.id, 'cor', e.target.value)}
                    onBlur={(e) => salvarSpecCampo(item, 'cor', e.target.value)}
                    placeholder="—"
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            )}

            {!somenteLeitura && (
              <div className="mt-2">
                <label className="block text-xs text-muted">Observação</label>
                <textarea
                  value={itemSpec.observacao}
                  onChange={(e) => atualizarSpecCampo(item.id, 'observacao', e.target.value)}
                  onBlur={(e) => salvarSpecCampo(item, 'observacao', e.target.value)}
                  rows={2}
                  placeholder="—"
                  className="input-field mt-1 w-full resize-none rounded-md px-2 py-1.5 text-sm"
                />
              </div>
            )}

            {podeMarcarEmEstoque && (
              <label className="mt-3 flex w-fit cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.em_estoque}
                  onChange={(e) => alternarEmEstoque(item, e.target.checked)}
                  className="h-4 w-4 accent-accent-compras"
                />
                <span className="text-xs text-muted">Já em estoque (não precisa cotar)</span>
              </label>
            )}

            {veMargem && (
              <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-white/5 pt-3 text-sm">
                <div>
                  <span className="text-xs text-muted">Custo final: </span>
                  <span className="font-mono text-primary">
                    {formatarMoeda(item.custo_final)}
                  </span>
                </div>
                {podeEditarPrecoVenda(item) ? (
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-muted">Preço de venda:</span>
                    <MoedaInput
                      value={precoVendaAtual(item.id)}
                      onChange={(valor) =>
                        setPrecoVendaPorItem((atual) => ({ ...atual, [item.id]: valor }))
                      }
                      onBlurSalvar={(valor) => salvarPrecoVenda(item, valor)}
                      className="input-field w-28 rounded-md px-2 py-1 font-mono text-sm font-medium"
                      style={estiloCorMargem(corMargem)}
                    />
                    {corMargem && (
                      <span
                        aria-hidden="true"
                        title="Indicador de margem"
                        className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/40"
                        style={{ backgroundColor: corMargem }}
                      />
                    )}
                  </label>
                ) : (
                  <span className="text-xs text-muted">Aguardando cotação</span>
                )}
              </div>
            )}
          </div>
        )
      })}
      {itensVisiveis.length === 0 && (
        <p className="py-4 text-center text-sm text-muted">Nenhum item cadastrado.</p>
      )}
    </div>
  )
}
