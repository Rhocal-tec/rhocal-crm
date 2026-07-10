'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database, PedidoStatus, SetorTipo } from '@/types/database'

type Pedido = Database['public']['Tables']['pedidos']['Row']
type PedidoItem = Database['public']['Tables']['pedido_itens']['Row']

// Qualquer etapa a partir da cotação — não precisa mais ser exatamente
// PEDIDO_COTADO, já que o pedido pode ter avançado no fluxo.
const STATUS_PERMITIDOS_OMIE: PedidoStatus[] = [
  'PEDIDO_COTADO',
  'APROVADO_CLIENTE',
  'PEDIDO_EFETUADO',
]

interface ClienteOmie {
  codigoClienteOmie: number
  razaoSocial: string
  nomeFantasia: string | null
  cnpjCpf: string | null
}

interface ProdutoOmie {
  codigoProduto: number
  codigo: string
  descricao: string
}

type Etapa =
  | 'idle'
  | 'buscando_produtos'
  | 'selecionar_produtos'
  | 'salvando_produtos'
  | 'buscando'
  | 'selecionar_cliente'
  | 'criando'
  | 'sucesso'

async function chamarApiOmie(payload: Record<string, unknown>) {
  const resposta = await fetch('/api/omie/orcamento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok || !dados || dados.erro) {
    throw new Error(dados?.erro ?? 'Erro inesperado ao falar com o Omie.')
  }
  return dados
}

async function chamarApiOmieProdutos(payload: Record<string, unknown>) {
  const resposta = await fetch('/api/omie/buscar-produtos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok || !dados || dados.erro) {
    throw new Error(dados?.erro ?? 'Erro inesperado ao buscar produtos no Omie.')
  }
  return dados
}

export function OmieOrcamentoSection({
  pedido,
  itens,
  setor,
  onPedidoAtualizado,
  onItemAtualizado,
}: {
  pedido: Pedido
  itens: PedidoItem[]
  setor: SetorTipo
  onPedidoAtualizado: (pedido: Pedido) => void
  onItemAtualizado: (item: PedidoItem) => void
}) {
  const [supabase] = useState(() => createClient())
  const [etapa, setEtapa] = useState<Etapa>('idle')
  const [clientes, setClientes] = useState<ClienteOmie[]>([])
  const [buscaSemResultado, setBuscaSemResultado] = useState(false)
  const [clienteEscolhido, setClienteEscolhido] = useState<number | null>(null)
  const [itensParaVincular, setItensParaVincular] = useState<PedidoItem[]>([])
  const [candidatosPorItem, setCandidatosPorItem] = useState<Record<string, ProdutoOmie[]>>({})
  const [produtoEscolhidoPorItem, setProdutoEscolhidoPorItem] = useState<Record<string, number>>(
    {},
  )
  const [erro, setErro] = useState<string | null>(null)

  const podeGerar = setor === 'comercial' || setor === 'gestor'
  // Number(...) normaliza o caso do Postgres devolver `numeric` como string
  // (ex: "150.00" em vez de 150) e também descarta preco_venda === 0 como
  // "não preenchido de verdade".
  const itensSemPreco = itens.filter(
    (item) => item.preco_venda === null || !(Number(item.preco_venda) > 0),
  )
  const itensCompletos = itens.length > 0 && itensSemPreco.length === 0
  const statusCorreto = STATUS_PERMITIDOS_OMIE.includes(pedido.status)
  const pedidoPronto = statusCorreto && itensCompletos

  // DEBUG TEMPORÁRIO — remover depois de confirmar por que o botão está
  // desabilitado/oculto para um pedido específico. Abra o DevTools (F12) e
  // veja esse log ao abrir a aba Dados do pedido.
  if (podeGerar && !pedidoPronto) {
    console.log('[Omie] botão desabilitado para o pedido #' + pedido.numero, {
      statusAtual: pedido.status,
      statusCorreto,
      totalItens: itens.length,
      itensSemPrecoDeVenda: itensSemPreco.map((item) => ({
        descricao: item.descricao,
        preco_venda: item.preco_venda,
        tipo: typeof item.preco_venda,
      })),
    })
  }

  if (!podeGerar) return null

  // Já gerado: mostra o número em vez do botão, independente do status atual.
  if (pedido.omie_orcamento_id !== null) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-md border border-accent-success/30 bg-accent-success/10 px-3 py-2 text-sm text-accent-success">
        <span>✓</span>
        <span>
          Orçamento Omie: <span className="font-mono font-semibold">#{pedido.omie_orcamento_id}</span>
        </span>
      </div>
    )
  }

  // Ponto de entrada do botão principal: primeiro garante que todo item está
  // vinculado a um produto do Omie, só então segue pro fluxo de cliente.
  async function iniciarFluxo() {
    setErro(null)
    const pendentes = itens.filter((item) => item.codigo_produto_omie === null)
    if (pendentes.length > 0) {
      await buscarProdutosPendentes(pendentes)
      return
    }
    prosseguirParaCliente()
  }

  function prosseguirParaCliente() {
    if (pedido.cliente_omie_id !== null) {
      confirmarCriacao(pedido.cliente_omie_id)
    } else {
      iniciarBusca()
    }
  }

  async function buscarProdutosPendentes(pendentes: PedidoItem[]) {
    setItensParaVincular(pendentes)
    setEtapa('buscando_produtos')

    const resultados: Record<string, ProdutoOmie[]> = {}
    try {
      for (const item of pendentes) {
        const dados = await chamarApiOmieProdutos({ descricao: item.descricao })
        resultados[item.id] = dados.produtos ?? []
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao buscar produtos no Omie.')
      setEtapa('idle')
      return
    }

    setCandidatosPorItem(resultados)
    setProdutoEscolhidoPorItem({})
    setEtapa('selecionar_produtos')
  }

  async function confirmarVinculoProdutos() {
    setErro(null)
    setEtapa('salvando_produtos')

    for (const item of itensParaVincular) {
      const codigoProduto = produtoEscolhidoPorItem[item.id]
      const { error } = await supabase
        .from('pedido_itens')
        .update({ codigo_produto_omie: codigoProduto })
        .eq('id', item.id)

      if (error) {
        setErro(`Não foi possível salvar o produto vinculado ao item "${item.descricao}".`)
        setEtapa('idle')
        return
      }
      onItemAtualizado({ ...item, codigo_produto_omie: codigoProduto })
    }

    prosseguirParaCliente()
  }

  async function iniciarBusca() {
    setErro(null)
    setBuscaSemResultado(false)
    setEtapa('buscando')

    try {
      const dados = await chamarApiOmie({ acao: 'buscar_cliente', clienteNome: pedido.cliente_nome })
      const encontrados: ClienteOmie[] = dados.clientes ?? []
      setClientes(encontrados)
      setBuscaSemResultado(encontrados.length === 0)
      setEtapa('selecionar_cliente')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao buscar cliente no Omie.')
      setEtapa('idle')
    }
  }

  async function confirmarCriacao(codigoClienteOmie: number | null) {
    setErro(null)
    setEtapa('criando')

    try {
      const dados = await chamarApiOmie({
        acao: 'criar_orcamento',
        pedidoId: pedido.id,
        codigoClienteOmie,
      })
      const codigoPedido = dados.codigoPedido as number

      const { error } = await supabase
        .from('pedidos')
        .update({ omie_orcamento_id: codigoPedido, cliente_omie_id: codigoClienteOmie })
        .eq('id', pedido.id)

      if (error) {
        setErro('Orçamento criado no Omie, mas houve um erro ao salvar o número no pedido. Anote o número e contate o suporte: #' + codigoPedido)
        setEtapa('selecionar_cliente')
        return
      }

      onPedidoAtualizado({
        ...pedido,
        omie_orcamento_id: codigoPedido,
        cliente_omie_id: codigoClienteOmie,
      })
      setEtapa('sucesso')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar orçamento no Omie.')
      setEtapa('selecionar_cliente')
    }
  }

  const todosItensVinculados = itensParaVincular.every((item) => {
    const candidatos = candidatosPorItem[item.id] ?? []
    return candidatos.length > 0 && produtoEscolhidoPorItem[item.id] !== undefined
  })

  return (
    <div className="mt-4 rounded-md border border-white/10 bg-surface-alt p-3">
      {erro && (
        <div className="mb-3 rounded-md border border-accent-danger/30 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erro}
        </div>
      )}

      {etapa === 'sucesso' ? (
        <div className="flex items-center gap-2 rounded-md border border-accent-success/30 bg-accent-success/10 px-3 py-2 text-sm text-accent-success">
          <span>✓</span>
          <span>Orçamento criado no Omie com sucesso.</span>
        </div>
      ) : etapa === 'idle' ? (
        <div>
          <button
            onClick={iniciarFluxo}
            disabled={!pedidoPronto}
            title={
              !pedidoPronto
                ? 'Disponível a partir de ORÇAMENTO COTADO, com preço de venda em todos os itens.'
                : undefined
            }
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            Gerar orçamento no Omie
          </button>
          {!pedidoPronto && (
            <div className="mt-2 rounded-md border border-accent-alert/30 bg-accent-alert/10 px-3 py-2 text-xs text-accent-alert">
              <p className="font-medium">Ainda não é possível gerar o orçamento:</p>
              <ul className="mt-1 list-disc pl-4">
                {!statusCorreto && (
                  <li>
                    O pedido precisa ter passado pela cotação antes de gerar o orçamento no Omie.
                  </li>
                )}
                {itens.length === 0 && <li>O pedido não tem itens cadastrados.</li>}
                {itens.length > 0 && itensSemPreco.length > 0 && (
                  <li>
                    Falta preço de venda em: {itensSemPreco.map((item) => item.descricao).join(', ')}
                    .
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      ) : etapa === 'buscando_produtos' ? (
        <p className="text-sm text-muted">Buscando produtos correspondentes no Omie…</p>
      ) : etapa === 'salvando_produtos' ? (
        <p className="text-sm text-muted">Salvando produtos vinculados…</p>
      ) : etapa === 'selecionar_produtos' ? (
        <div>
          <p className="text-sm font-medium text-primary">Vincule cada item a um produto do Omie</p>
          <p className="mt-1 text-xs text-muted">
            Nenhum desses itens tem produto vinculado ainda. Escolha o produto correspondente no
            Omie para cada um antes de continuar.
          </p>

          <div className="mt-3 flex flex-col gap-3">
            {itensParaVincular.map((item) => {
              const candidatos = candidatosPorItem[item.id] ?? []
              return (
                <div key={item.id} className="rounded-md border border-white/10 bg-base p-3">
                  <p className="text-sm font-medium text-primary">{item.descricao}</p>

                  {candidatos.length === 0 ? (
                    <p className="mt-1 text-sm text-accent-danger" role="alert">
                      Nenhum produto encontrado no Omie para este item. Cadastre o produto no
                      Omie antes de continuar.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {candidatos.map((produto) => (
                        <label
                          key={produto.codigoProduto}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-surface-alt px-3 py-2 text-sm text-primary hover:border-accent-primary/50"
                        >
                          <input
                            type="radio"
                            name={`produto-${item.id}`}
                            checked={produtoEscolhidoPorItem[item.id] === produto.codigoProduto}
                            onChange={() =>
                              setProdutoEscolhidoPorItem((atual) => ({
                                ...atual,
                                [item.id]: produto.codigoProduto,
                              }))
                            }
                            className="accent-accent-primary"
                          />
                          <span>
                            {produto.descricao}{' '}
                            <span className="font-mono text-xs text-muted">
                              ({produto.codigo})
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={confirmarVinculoProdutos}
              disabled={!todosItensVinculados}
              className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirmar produtos e continuar
            </button>
            <button
              onClick={() => setEtapa('idle')}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : etapa === 'buscando' ? (
        <p className="text-sm text-muted">Buscando cliente no Omie…</p>
      ) : etapa === 'criando' ? (
        <p className="text-sm text-muted">Criando orçamento no Omie…</p>
      ) : (
        <div>
          <p className="text-sm font-medium text-primary">Confirme o cliente no Omie</p>

          {buscaSemResultado ? (
            <p className="mt-1 text-sm text-muted">
              Cliente &apos;{pedido.cliente_nome}&apos; não encontrado no Omie. Você pode
              cadastrá-lo no Omie antes de continuar, ou gerar o orçamento sem vincular a um
              cliente (não recomendado, pois dificulta o controle financeiro depois).
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              {clientes.map((cliente) => (
                <label
                  key={cliente.codigoClienteOmie}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-base px-3 py-2 text-sm text-primary hover:border-accent-primary/50"
                >
                  <input
                    type="radio"
                    name="cliente-omie"
                    checked={clienteEscolhido === cliente.codigoClienteOmie}
                    onChange={() => setClienteEscolhido(cliente.codigoClienteOmie)}
                    className="accent-accent-primary"
                  />
                  <span>
                    {cliente.razaoSocial}
                    {cliente.nomeFantasia ? ` (${cliente.nomeFantasia})` : ''}
                    {cliente.cnpjCpf ? ` — ${cliente.cnpjCpf}` : ''}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {!buscaSemResultado && (
              <button
                onClick={() => confirmarCriacao(clienteEscolhido)}
                disabled={clienteEscolhido === null}
                className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirmar cliente e gerar
              </button>
            )}
            <button
              onClick={() => confirmarCriacao(null)}
              className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-primary/80 hover:bg-white/5"
            >
              {buscaSemResultado ? 'Gerar mesmo assim, sem vincular cliente' : 'Gerar sem vincular cliente'}
            </button>
            <button
              onClick={() => setEtapa('idle')}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
