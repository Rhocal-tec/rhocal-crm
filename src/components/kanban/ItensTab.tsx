'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MoedaInput } from '@/components/ui/MoedaInput'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import { corMargemPrecoVenda, estiloCorMargem } from '@/lib/kanban/margem-cor'
import type { Database, SetorTipo } from '@/types/database'

type PedidoItem = Database['public']['Tables']['pedido_itens']['Row']

type CampoTexto = 'tamanho' | 'numero' | 'cor' | 'observacao'
type StatusCodigoOmie = 'idle' | 'buscando' | 'encontrado' | 'nao_encontrado' | 'erro'

// Autocomplete de descrição (busca de produto no Omie por nome) — mesmo mínimo
// e debounce do campo Fornecedor (fase 18.1).
const MIN_CARACTERES_BUSCA_PRODUTO = 3
const DEBOUNCE_BUSCA_PRODUTO_MS = 400

interface ProdutoOmie {
  codigoProduto: number
  codigo: string
  descricao: string
}

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

interface NovoItemForm {
  descricao: string
  quantidade: string
  ca: string
  tamanho: string
  numero: string
  cor: string
  observacao: string
}

function novoItemFormVazio(): NovoItemForm {
  return { descricao: '', quantidade: '1', ca: '', tamanho: '', numero: '', cor: '', observacao: '' }
}

export function ItensTab({
  itens,
  setor,
  somenteLeitura = false,
  pedidoId,
  omieOrcamentoId,
  onItemAtualizado,
  onItemAdicionado,
  onItemRemovido,
}: {
  itens: PedidoItem[]
  setor: SetorTipo
  somenteLeitura?: boolean
  pedidoId: string
  omieOrcamentoId: number | null
  onItemAtualizado: (item: PedidoItem) => void
  onItemAdicionado: (item: PedidoItem) => void
  onItemRemovido: (itemId: string) => void
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

  // Autocomplete de descrição — estado por item, mesmo padrão do "Fornecedor"
  // na aba Cotações (fase 18.1).
  const [sugestoesProdutoPorItem, setSugestoesProdutoPorItem] = useState<
    Record<string, ProdutoOmie[]>
  >({})
  const [buscandoProdutoPorItem, setBuscandoProdutoPorItem] = useState<Record<string, boolean>>({})
  const [dropdownProdutoAbertoPorItem, setDropdownProdutoAbertoPorItem] = useState<
    Record<string, boolean>
  >({})
  const debounceProdutoRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Marca que a descrição acabou de ser preenchida por uma seleção do dropdown
  // — o onBlur que dispara logo em seguida não deve refazer nada (e ainda
  // viria com o texto digitado antigo em e.target.value).
  const selecaoProdutoRef = useRef<Record<string, boolean>>({})

  // Comercial e gestor veem custo final e editam o preço de venda; compras
  // não (já vê o custo real na aba Cotações). Fase 29: durante EM_COTACAO o
  // comercial fica sem acesso a nada disso também (somenteLeitura).
  const veMargem = setor !== 'compras' && !somenteLeitura
  // Fase 28.3: itens em estoque são um assunto exclusivo do comercial — compras
  // não os enxerga em lugar nenhum do sistema, nem edita a marcação.
  const podeMarcarEmEstoque = setor !== 'compras' && !somenteLeitura
  const itensVisiveis = setor === 'compras' ? itens.filter((item) => !item.em_estoque) : itens

  // Adicionar/remover item só é permitido enquanto o pedido nunca foi mandado
  // pro Omie (omie_orcamento_id nulo) — depois disso o Omie tem sua própria
  // cópia do det do pedido, e mudar itens só aqui deixaria as duas pontas
  // dessincronizadas silenciosamente. "Remover" é soft-delete (excluido=true):
  // não existe policy de delete físico em pedido_itens (regra de ouro).
  const podeGerenciarItens = omieOrcamentoId === null && !somenteLeitura

  const [mostrarNovoItem, setMostrarNovoItem] = useState(false)
  const [novoItem, setNovoItem] = useState<NovoItemForm>(novoItemFormVazio)
  const [salvandoNovoItem, setSalvandoNovoItem] = useState(false)
  const [erroNovoItem, setErroNovoItem] = useState<string | null>(null)
  const [removendoItemId, setRemovendoItemId] = useState<string | null>(null)

  function atualizarNovoItemCampo(campo: keyof NovoItemForm, valor: string) {
    setNovoItem((atual) => ({ ...atual, [campo]: valor }))
  }

  async function adicionarItem() {
    const descricao = novoItem.descricao.trim()
    if (!descricao) {
      setErroNovoItem('Informe a descrição do item.')
      return
    }
    const quantidade = Number(novoItem.quantidade)
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      setErroNovoItem('Informe uma quantidade válida.')
      return
    }

    setSalvandoNovoItem(true)
    setErroNovoItem(null)

    const { data, error } = await supabase
      .from('pedido_itens')
      .insert({
        pedido_id: pedidoId,
        descricao,
        quantidade,
        ca: novoItem.ca.trim() || null,
        tamanho: novoItem.tamanho.trim() || null,
        numero: novoItem.numero.trim() || null,
        cor: novoItem.cor.trim() || null,
        observacao: novoItem.observacao.trim() || null,
      })
      .select()
      .single()

    setSalvandoNovoItem(false)

    if (error || !data) {
      setErroNovoItem('Não foi possível adicionar o item. Tente novamente.')
      return
    }

    onItemAdicionado(data)
    setNovoItem(novoItemFormVazio())
    setMostrarNovoItem(false)
  }

  async function removerItem(item: PedidoItem) {
    const confirmado = window.confirm(`Remover o item "${item.descricao}" deste pedido?`)
    if (!confirmado) return

    setRemovendoItemId(item.id)
    const { error } = await supabase
      .from('pedido_itens')
      .update({ excluido: true })
      .eq('id', item.id)
    setRemovendoItemId(null)

    if (!error) onItemRemovido(item.id)
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
    // A seleção pelo dropdown já persistiu descrição + vínculo; o onBlur que
    // dispara em seguida não deve refazer nada.
    if (selecaoProdutoRef.current[item.id]) {
      selecaoProdutoRef.current[item.id] = false
      return
    }

    const valor = valorStr.trim()
    if (!valor || valor === item.descricao) return

    // Descrição editada à mão desvincula do produto Omie anterior — o vínculo
    // volta só ao escolher algo do autocomplete ou digitar o código certo de
    // novo ("último que tocou vence", fase 18.2).
    const desvincular = item.codigo_produto_omie !== null

    const { error } = await supabase
      .from('pedido_itens')
      .update(desvincular ? { descricao: valor, codigo_produto_omie: null } : { descricao: valor })
      .eq('id', item.id)

    if (error) return

    onItemAtualizado(
      desvincular
        ? { ...item, descricao: valor, codigo_produto_omie: null }
        : { ...item, descricao: valor },
    )
    if (desvincular) {
      setStatusCodigoPorItem((atual) => ({ ...atual, [item.id]: 'idle' }))
      setCodigoPorItem((atual) => ({ ...atual, [item.id]: '' }))
    }
  }

  async function buscarProdutos(item: PedidoItem, termo: string) {
    setBuscandoProdutoPorItem((atual) => ({ ...atual, [item.id]: true }))
    try {
      const resposta = await fetch('/api/omie/buscar-produtos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: termo, pedidoId: item.pedido_id }),
      })
      const dados = await resposta.json().catch(() => null)
      const produtos: ProdutoOmie[] =
        resposta.ok && dados && Array.isArray(dados.produtos) ? dados.produtos : []
      setSugestoesProdutoPorItem((atual) => ({ ...atual, [item.id]: produtos }))
    } finally {
      setBuscandoProdutoPorItem((atual) => ({ ...atual, [item.id]: false }))
    }
  }

  // onChange da descrição: atualiza o texto, abre o dropdown e reagenda a busca
  // (debounce) — não chama a API a cada tecla.
  function atualizarDescricao(item: PedidoItem, valor: string) {
    atualizarSpecCampo(item.id, 'descricao', valor)
    setDropdownProdutoAbertoPorItem((atual) => ({ ...atual, [item.id]: true }))

    if (debounceProdutoRef.current[item.id]) clearTimeout(debounceProdutoRef.current[item.id])

    const termo = valor.trim()
    if (termo.length < MIN_CARACTERES_BUSCA_PRODUTO) {
      setSugestoesProdutoPorItem((atual) => ({ ...atual, [item.id]: [] }))
      return
    }

    debounceProdutoRef.current[item.id] = setTimeout(
      () => buscarProdutos(item, termo),
      DEBOUNCE_BUSCA_PRODUTO_MS,
    )
  }

  async function selecionarProduto(item: PedidoItem, produto: ProdutoOmie) {
    selecaoProdutoRef.current[item.id] = true
    if (debounceProdutoRef.current[item.id]) clearTimeout(debounceProdutoRef.current[item.id])

    const { error } = await supabase
      .from('pedido_itens')
      .update({ descricao: produto.descricao, codigo_produto_omie: produto.codigoProduto })
      .eq('id', item.id)

    if (error) {
      setStatusCodigoPorItem((atual) => ({ ...atual, [item.id]: 'erro' }))
      return
    }

    onItemAtualizado({
      ...item,
      descricao: produto.descricao,
      codigo_produto_omie: produto.codigoProduto,
    })
    setSpecPorItem((atual) => ({
      ...atual,
      [item.id]: { ...spec(item.id), descricao: produto.descricao },
    }))
    setCodigoPorItem((atual) => ({ ...atual, [item.id]: produto.codigo }))
    setStatusCodigoPorItem((atual) => ({ ...atual, [item.id]: 'encontrado' }))
    setSugestoesProdutoPorItem((atual) => ({ ...atual, [item.id]: [] }))
    setDropdownProdutoAbertoPorItem((atual) => ({ ...atual, [item.id]: false }))
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
                    <div className="relative mt-1">
                      <input
                        type="text"
                        value={itemSpec.descricao}
                        onChange={(e) => atualizarDescricao(item, e.target.value)}
                        onFocus={() =>
                          setDropdownProdutoAbertoPorItem((atual) => ({ ...atual, [item.id]: true }))
                        }
                        onBlur={(e) => {
                          salvarDescricao(item, e.target.value)
                          setTimeout(
                            () =>
                              setDropdownProdutoAbertoPorItem((atual) => ({
                                ...atual,
                                [item.id]: false,
                              })),
                            150,
                          )
                        }}
                        autoComplete="off"
                        className="input-field w-full rounded-md px-2 py-1.5 pr-7 text-sm"
                      />
                      {buscandoProdutoPorItem[item.id] && (
                        <span
                          aria-hidden="true"
                          className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-accent-primary"
                        />
                      )}
                      {dropdownProdutoAbertoPorItem[item.id] &&
                        (sugestoesProdutoPorItem[item.id]?.length ?? 0) > 0 && (
                          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-white/10 bg-surface-alt py-1 shadow-lg">
                            {sugestoesProdutoPorItem[item.id].map((produto) => (
                              <li key={produto.codigoProduto}>
                                <button
                                  type="button"
                                  onMouseDown={() => selecionarProduto(item, produto)}
                                  className="block w-full truncate px-3 py-1.5 text-left text-sm text-primary hover:bg-white/10"
                                >
                                  {produto.descricao}
                                  <span className="ml-1.5 font-mono text-xs text-muted">
                                    ({produto.codigo})
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
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
                {podeGerenciarItens && (
                  <button
                    type="button"
                    onClick={() => removerItem(item)}
                    disabled={removendoItemId === item.id}
                    className="font-sans text-xs font-medium text-accent-danger hover:underline disabled:opacity-50"
                  >
                    {removendoItemId === item.id ? 'Removendo…' : 'Remover'}
                  </button>
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
              </div>
            )}
          </div>
        )
      })}
      {itensVisiveis.length === 0 && (
        <p className="py-4 text-center text-sm text-muted">Nenhum item cadastrado.</p>
      )}

      {podeGerenciarItens && !mostrarNovoItem && (
        <button
          type="button"
          onClick={() => setMostrarNovoItem(true)}
          className="w-fit rounded-md border border-dashed border-white/20 px-3 py-1.5 text-xs font-medium text-primary hover:border-accent-primary hover:text-accent-primary"
        >
          + Adicionar item
        </button>
      )}

      {podeGerenciarItens && mostrarNovoItem && (
        <div className="rounded-lg border border-white/10 bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Novo item</p>
          {erroNovoItem && <p className="mt-2 text-xs text-accent-danger">{erroNovoItem}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <div className="min-w-[220px] flex-[2]">
              <label className="block text-xs text-muted">Descrição</label>
              <input
                type="text"
                value={novoItem.descricao}
                onChange={(e) => atualizarNovoItemCampo('descricao', e.target.value)}
                className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs text-muted">Quantidade</label>
              <input
                type="number"
                min="0"
                step="any"
                value={novoItem.quantidade}
                onChange={(e) => atualizarNovoItemCampo('quantidade', e.target.value)}
                className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs text-muted">CA</label>
              <input
                type="text"
                value={novoItem.ca}
                onChange={(e) => atualizarNovoItemCampo('ca', e.target.value)}
                placeholder="—"
                className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-muted">Tamanho</label>
              <input
                type="text"
                value={novoItem.tamanho}
                onChange={(e) => atualizarNovoItemCampo('tamanho', e.target.value)}
                placeholder="—"
                className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted">Número</label>
              <input
                type="text"
                value={novoItem.numero}
                onChange={(e) => atualizarNovoItemCampo('numero', e.target.value)}
                placeholder="—"
                className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-muted">Cor</label>
              <input
                type="text"
                value={novoItem.cor}
                onChange={(e) => atualizarNovoItemCampo('cor', e.target.value)}
                placeholder="—"
                className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="block text-xs text-muted">Observação</label>
            <textarea
              value={novoItem.observacao}
              onChange={(e) => atualizarNovoItemCampo('observacao', e.target.value)}
              rows={2}
              placeholder="—"
              className="input-field mt-1 w-full resize-none rounded-md px-2 py-1.5 text-sm"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={adicionarItem}
              disabled={salvandoNovoItem}
              className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {salvandoNovoItem ? 'Salvando…' : 'Adicionar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarNovoItem(false)
                setNovoItem(novoItemFormVazio())
                setErroNovoItem(null)
              }}
              className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-white/5"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
