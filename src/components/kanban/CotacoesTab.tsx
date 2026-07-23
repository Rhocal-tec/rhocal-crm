'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MoedaInput } from '@/components/ui/MoedaInput'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import { cotacaoVencida } from '@/lib/kanban/cotacao-vencida'
import type { Database } from '@/types/database'

type PedidoItem = Database['public']['Tables']['pedido_itens']['Row']
type Cotacao = Database['public']['Tables']['cotacoes']['Row']
type HistoricoCA = Database['public']['Views']['vw_historico_ca']['Row']

const MAX_COTACOES_POR_ITEM = 3
// Só dispara a busca de autocomplete a partir de 3 caracteres — mesmo mínimo
// exigido pela própria API do Omie (abaixo disso ela retorna erro de validação).
const MIN_CARACTERES_BUSCA_FORNECEDOR = 3
const DEBOUNCE_BUSCA_FORNECEDOR_MS = 400

interface FornecedorOmie {
  codigoClienteOmie: number
  razaoSocial: string
  nomeFantasia: string | null
  cnpjCpf: string | null
}

interface NovaCotacaoForm {
  fornecedor: string
  preco: string
  data_cotacao: string
  validade_cotacao: string
  previsao_chegada: string
  empresa_faturou: string
}

function formVazio(): NovaCotacaoForm {
  const hoje = new Date().toISOString().slice(0, 10)
  return {
    fornecedor: '',
    preco: '',
    data_cotacao: hoje,
    validade_cotacao: '',
    previsao_chegada: '',
    empresa_faturou: '',
  }
}

export function CotacoesTab({
  itens: todosItens,
  pedidoNumero,
}: {
  itens: PedidoItem[]
  pedidoNumero: number
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  // Itens já em estoque (fase 26) não precisam de cotação — ficam 100% fora
  // desta aba, sem exceção. Memoizado para não recriar a referência do array
  // (e disparar o efeito de carregamento abaixo) a cada re-render local.
  const itens = useMemo(
    () => todosItens.filter((item) => !item.em_estoque),
    [todosItens],
  )
  const [cotacoesPorItem, setCotacoesPorItem] = useState<Record<string, Cotacao[]>>({})
  const [historicoPorCa, setHistoricoPorCa] = useState<Record<string, HistoricoCA[]>>({})
  const [custoFinalPorItem, setCustoFinalPorItem] = useState<Record<string, string>>({})
  // Preço de cada cotação já cadastrada, editável a qualquer momento (fase
  // 22.2) — mesmo padrão de moeda usado no custo final, mantido em um estado
  // à parte por cotação (chave = id da cotação, não do item).
  const [precoCotacaoInput, setPrecoCotacaoInput] = useState<Record<string, string>>({})
  const [formularios, setFormularios] = useState<Record<string, NovaCotacaoForm>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Autocomplete de fornecedor (busca no Omie) — estado por item, já que cada
  // item tem seu próprio formulário de nova cotação.
  const [sugestoesFornecedor, setSugestoesFornecedor] = useState<Record<string, FornecedorOmie[]>>(
    {},
  )
  const [buscandoFornecedor, setBuscandoFornecedor] = useState<Record<string, boolean>>({})
  const [dropdownFornecedorAberto, setDropdownFornecedorAberto] = useState<Record<string, boolean>>(
    {},
  )
  // Timers de debounce não entram no estado — não devem disparar re-render.
  const debounceFornecedorRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    let ativo = true

    async function carregar() {
      const itemIds = itens.map((item) => item.id)
      setCustoFinalPorItem(
        Object.fromEntries(itens.map((item) => [item.id, item.custo_final?.toString() ?? ''])),
      )

      if (itemIds.length === 0) {
        setCarregando(false)
        return
      }

      const { data, error } = await supabase
        .from('cotacoes')
        .select('*')
        .in('item_id', itemIds)
        .order('criado_em', { ascending: true })

      if (!ativo) return

      const agrupado: Record<string, Cotacao[]> = {}
      for (const item of itens) agrupado[item.id] = []
      for (const cotacao of data ?? []) {
        agrupado[cotacao.item_id] = [...(agrupado[cotacao.item_id] ?? []), cotacao]
      }

      if (error) console.error('Erro ao carregar cotações:', error.message)
      setCotacoesPorItem(agrupado)
      setPrecoCotacaoInput(
        Object.fromEntries((data ?? []).map((cotacao) => [cotacao.id, cotacao.preco.toString()])),
      )

      // Sugestão automática por CA: busca o histórico de compras/cotações
      // anteriores para os CAs presentes neste pedido, excluindo o próprio
      // pedido (mesmo CA em outro item deste ciclo não conta como "anterior").
      const casUnicos = Array.from(
        new Set(itens.map((item) => item.ca?.trim()).filter((ca): ca is string => !!ca)),
      )
      if (casUnicos.length > 0) {
        const { data: historico, error: erroHistorico } = await supabase
          .from('vw_historico_ca')
          .select('*')
          .in('ca', casUnicos)
          .neq('pedido_numero', pedidoNumero)
          .order('data_cotacao', { ascending: false })

        if (ativo && !erroHistorico && historico) {
          const agrupadoHistorico: Record<string, HistoricoCA[]> = {}
          for (const registro of historico) {
            // Item sem cotação registrada ainda (join da view fica com preço
            // nulo) não é uma "compra/cotação anterior" de verdade — ignora.
            if (!registro.ca || registro.preco === null) continue
            agrupadoHistorico[registro.ca] = [...(agrupadoHistorico[registro.ca] ?? []), registro]
          }
          setHistoricoPorCa(agrupadoHistorico)
        }
      }

      setCarregando(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [itens, pedidoNumero, supabase])

  function form(itemId: string): NovaCotacaoForm {
    return formularios[itemId] ?? formVazio()
  }

  function atualizarForm(itemId: string, campo: keyof NovaCotacaoForm, valor: string) {
    setFormularios((atual) => ({
      ...atual,
      [itemId]: { ...form(itemId), [campo]: valor },
    }))
  }

  async function buscarFornecedores(itemId: string, termo: string) {
    setBuscandoFornecedor((atual) => ({ ...atual, [itemId]: true }))
    try {
      const resposta = await fetch('/api/omie/buscar-clientes-nome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: termo, apenasFornecedor: true }),
      })
      const dados = await resposta.json().catch(() => null)
      if (resposta.ok && dados && Array.isArray(dados.clientes)) {
        setSugestoesFornecedor((atual) => ({ ...atual, [itemId]: dados.clientes }))
      }
    } finally {
      setBuscandoFornecedor((atual) => ({ ...atual, [itemId]: false }))
    }
  }

  // Digitar de novo abre o dropdown e reagenda a busca (debounce) — não
  // dispara uma chamada à API a cada tecla.
  function atualizarFornecedor(itemId: string, valor: string) {
    atualizarForm(itemId, 'fornecedor', valor)
    setDropdownFornecedorAberto((atual) => ({ ...atual, [itemId]: true }))

    if (debounceFornecedorRef.current[itemId]) {
      clearTimeout(debounceFornecedorRef.current[itemId])
    }

    const termo = valor.trim()
    if (termo.length < MIN_CARACTERES_BUSCA_FORNECEDOR) {
      setSugestoesFornecedor((atual) => ({ ...atual, [itemId]: [] }))
      return
    }

    debounceFornecedorRef.current[itemId] = setTimeout(
      () => buscarFornecedores(itemId, termo),
      DEBOUNCE_BUSCA_FORNECEDOR_MS,
    )
  }

  function selecionarFornecedor(itemId: string, fornecedor: FornecedorOmie) {
    atualizarForm(itemId, 'fornecedor', fornecedor.razaoSocial)
    setSugestoesFornecedor((atual) => ({ ...atual, [itemId]: [] }))
    setDropdownFornecedorAberto((atual) => ({ ...atual, [itemId]: false }))
  }

  async function adicionarCotacao(itemId: string) {
    if (!user) return
    setErro(null)

    const atuais = cotacoesPorItem[itemId] ?? []
    if (atuais.length >= MAX_COTACOES_POR_ITEM) {
      setErro('Este item já tem 3 cotações — o limite máximo por item.')
      return
    }

    const f = form(itemId)
    if (!f.fornecedor.trim() || !f.preco || !f.validade_cotacao) {
      setErro('Preencha fornecedor, preço e validade da cotação.')
      return
    }
    const preco = Number(f.preco)
    if (!Number.isFinite(preco) || preco <= 0) {
      setErro('Preço inválido.')
      return
    }

    const { data, error } = await supabase
      .from('cotacoes')
      .insert({
        item_id: itemId,
        fornecedor: f.fornecedor.trim(),
        preco,
        data_cotacao: f.data_cotacao,
        validade_cotacao: f.validade_cotacao,
        previsao_chegada: f.previsao_chegada || null,
        empresa_faturou: f.empresa_faturou.trim() || null,
        criado_por: user.id,
      })
      .select()
      .single()

    if (error || !data) {
      setErro('Não foi possível salvar a cotação.')
      return
    }

    setCotacoesPorItem((atual) => ({
      ...atual,
      [itemId]: [...(atual[itemId] ?? []), data],
    }))
    setPrecoCotacaoInput((atual) => ({ ...atual, [data.id]: data.preco.toString() }))
    setFormularios((atual) => ({ ...atual, [itemId]: formVazio() }))
  }

  // Atualiza a cotação já salva na tela (otimista) enquanto o usuário digita.
  function atualizarCotacaoLocal(itemId: string, cotacaoId: string, patch: Partial<Cotacao>) {
    setCotacoesPorItem((atual) => ({
      ...atual,
      [itemId]: (atual[itemId] ?? []).map((c) => (c.id === cotacaoId ? { ...c, ...patch } : c)),
    }))
  }

  // Cotações continuam totalmente editáveis por compras/gestor a qualquer
  // momento, independente do status atual do pedido (fase 22.2) — nenhuma
  // condição de status bloqueia esta função.
  async function salvarCotacao(itemId: string, cotacaoId: string, patch: Partial<Cotacao>) {
    setErro(null)
    const { error } = await supabase.from('cotacoes').update(patch).eq('id', cotacaoId)
    if (error) {
      setErro('Não foi possível salvar a alteração da cotação.')
      return
    }

    // Se o preço editado é o da cotação vencedora, mantém o custo final do
    // item sincronizado com o novo valor.
    if (patch.preco !== undefined) {
      const cotacaoAtual = (cotacoesPorItem[itemId] ?? []).find((c) => c.id === cotacaoId)
      if (cotacaoAtual?.vencedora) {
        const { error: erroCusto } = await supabase
          .from('pedido_itens')
          .update({ custo_final: patch.preco })
          .eq('id', itemId)
        if (erroCusto) {
          setErro('Preço da cotação salvo, mas houve erro ao atualizar o custo final.')
          return
        }
        setCustoFinalPorItem((atual) => ({ ...atual, [itemId]: String(patch.preco) }))
      }
    }
  }

  async function marcarVencedora(itemId: string, cotacaoId: string, preco: number) {
    setErro(null)

    const outrasIds = (cotacoesPorItem[itemId] ?? [])
      .filter((c) => c.id !== cotacaoId)
      .map((c) => c.id)

    if (outrasIds.length > 0) {
      const { error: erroDesmarcar } = await supabase
        .from('cotacoes')
        .update({ vencedora: false })
        .in('id', outrasIds)
      if (erroDesmarcar) {
        setErro('Não foi possível atualizar as demais cotações.')
        return
      }
    }

    const { error: erroMarcar } = await supabase
      .from('cotacoes')
      .update({ vencedora: true })
      .eq('id', cotacaoId)
    if (erroMarcar) {
      setErro('Não foi possível marcar a cotação como vencedora.')
      return
    }

    const { error: erroCusto } = await supabase
      .from('pedido_itens')
      .update({ custo_final: preco })
      .eq('id', itemId)
    if (erroCusto) {
      setErro('Cotação marcada como vencedora, mas houve erro ao atualizar o custo final.')
    }

    setCotacoesPorItem((atual) => ({
      ...atual,
      [itemId]: (atual[itemId] ?? []).map((c) => ({ ...c, vencedora: c.id === cotacaoId })),
    }))
    setCustoFinalPorItem((atual) => ({ ...atual, [itemId]: preco.toString() }))
  }

  async function salvarCustoFinal(itemId: string, valor: string) {
    const numero = valor.trim() === '' ? null : Number(valor)
    if (numero !== null && !Number.isFinite(numero)) return

    const { error } = await supabase
      .from('pedido_itens')
      .update({ custo_final: numero })
      .eq('id', itemId)

    if (error) setErro('Não foi possível salvar o custo final.')
  }

  if (carregando) {
    return <div className="py-8 text-center text-sm text-muted">Carregando cotações…</div>
  }

  return (
    <div className="mt-4 flex flex-col gap-6">
      {erro && (
        <div className="rounded-md border border-accent-danger/30 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erro}
        </div>
      )}

      {itens.map((item) => {
        const cotacoes = cotacoesPorItem[item.id] ?? []
        const atingiuLimite = cotacoes.length >= MAX_COTACOES_POR_ITEM
        const f = form(item.id)
        const ca = item.ca?.trim()
        const historico = ca ? (historicoPorCa[ca] ?? []) : []
        const destaque = historico.find((registro) => registro.vencedora) ?? historico[0]

        return (
          <div key={item.id} className="rounded-lg border border-white/10 bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-primary">{item.descricao}</h3>
              <span className="font-mono text-xs text-muted">Qtd. {item.quantidade}</span>
            </div>

            {destaque && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent-compras/25 bg-accent-compras/10 px-3 py-2 text-xs text-primary">
                <span>
                  📌 Histórico deste CA: {destaque.vencedora ? 'última cotação vencedora' : 'última cotação'}{' '}
                  <span className="font-mono font-semibold">{formatarMoeda(destaque.preco)}</span>
                  {destaque.fornecedor && (
                    <>
                      {' '}
                      — fornecedor <span className="font-medium">{destaque.fornecedor}</span>
                    </>
                  )}
                  {' '}em {formatarDataSomente(destaque.data_cotacao)}
                  {destaque.pedido_numero !== null && ` (pedido #${destaque.pedido_numero})`}
                </span>
                {historico.length > 1 && (
                  <Link
                    href={`/busca?aba=ca&ca=${encodeURIComponent(ca as string)}`}
                    className="shrink-0 font-medium text-accent-compras hover:text-primary"
                  >
                    Ver histórico completo →
                  </Link>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <label className="text-sm text-muted">Custo final:</label>
              <MoedaInput
                value={custoFinalPorItem[item.id] ?? ''}
                onChange={(valor) =>
                  setCustoFinalPorItem((atual) => ({ ...atual, [item.id]: valor }))
                }
                onBlurSalvar={(valor) => salvarCustoFinal(item.id, valor)}
                className="input-field w-32 rounded-md px-2 py-1 font-mono text-sm"
              />
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-muted">
                    <th className="pb-1 pl-3 pr-2 font-medium">Fornecedor</th>
                    <th className="pb-1 pr-2 font-medium">Preço</th>
                    <th className="pb-1 pr-2 font-medium">Cotado em</th>
                    <th className="pb-1 pr-2 font-medium">Validade</th>
                    <th className="pb-1 pr-2 font-medium">Empresa fatura</th>
                    <th className="pb-1 pr-2 font-medium">Previsão de chegada</th>
                    <th className="pb-1 font-medium">Vencedora</th>
                  </tr>
                </thead>
                <tbody>
                  {cotacoes.map((cotacao) => {
                    const vencida = cotacaoVencida(cotacao.validade_cotacao)
                    return (
                    <tr
                      key={cotacao.id}
                      className={`border-b border-white/5 ${
                        cotacao.vencedora ? 'bg-accent-success/10' : ''
                      }`}
                    >
                      <td
                        className={`py-1.5 pr-2 ${
                          cotacao.vencedora
                            ? 'border-l-4 border-accent-success pl-2'
                            : 'pl-3'
                        }`}
                      >
                        <input
                          type="text"
                          value={cotacao.fornecedor}
                          onChange={(e) =>
                            atualizarCotacaoLocal(item.id, cotacao.id, {
                              fornecedor: e.target.value,
                            })
                          }
                          onBlur={(e) =>
                            salvarCotacao(item.id, cotacao.id, {
                              fornecedor: e.target.value.trim(),
                            })
                          }
                          className={`input-field w-full rounded-md px-1.5 py-1 text-sm ${
                            cotacao.vencedora ? 'font-semibold' : ''
                          }`}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <MoedaInput
                          value={precoCotacaoInput[cotacao.id] ?? cotacao.preco.toString()}
                          onChange={(valor) =>
                            setPrecoCotacaoInput((atual) => ({ ...atual, [cotacao.id]: valor }))
                          }
                          onBlurSalvar={(valor) => {
                            const numero = Number(valor)
                            if (!Number.isFinite(numero) || numero <= 0) return
                            atualizarCotacaoLocal(item.id, cotacao.id, { preco: numero })
                            salvarCotacao(item.id, cotacao.id, { preco: numero })
                          }}
                          className="input-field w-24 rounded-md px-1.5 py-1 font-mono text-sm"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="date"
                          value={cotacao.data_cotacao}
                          onChange={(e) =>
                            atualizarCotacaoLocal(item.id, cotacao.id, {
                              data_cotacao: e.target.value,
                            })
                          }
                          onBlur={(e) =>
                            salvarCotacao(item.id, cotacao.id, { data_cotacao: e.target.value })
                          }
                          className="input-field w-full min-w-[130px] rounded-md px-1.5 py-1 text-sm"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="date"
                          value={cotacao.validade_cotacao}
                          onChange={(e) =>
                            atualizarCotacaoLocal(item.id, cotacao.id, {
                              validade_cotacao: e.target.value,
                            })
                          }
                          onBlur={(e) =>
                            salvarCotacao(item.id, cotacao.id, {
                              validade_cotacao: e.target.value,
                            })
                          }
                          className={`input-field w-full min-w-[130px] rounded-md px-1.5 py-1 text-sm ${
                            vencida ? 'border-accent-danger/50 text-accent-danger' : ''
                          }`}
                        />
                        {vencida && (
                          <span className="ml-1.5 inline-flex items-center rounded-full border border-accent-danger/40 bg-accent-danger/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-danger">
                            Vencida
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={cotacao.empresa_faturou ?? ''}
                          onChange={(e) =>
                            atualizarCotacaoLocal(item.id, cotacao.id, {
                              empresa_faturou: e.target.value,
                            })
                          }
                          onBlur={(e) =>
                            salvarCotacao(item.id, cotacao.id, {
                              empresa_faturou: e.target.value.trim() || null,
                            })
                          }
                          placeholder="—"
                          className="input-field w-full rounded-md px-1.5 py-1 text-sm"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="date"
                          value={cotacao.previsao_chegada ?? ''}
                          onChange={(e) =>
                            atualizarCotacaoLocal(item.id, cotacao.id, {
                              previsao_chegada: e.target.value || null,
                            })
                          }
                          onBlur={(e) =>
                            salvarCotacao(item.id, cotacao.id, {
                              previsao_chegada: e.target.value || null,
                            })
                          }
                          className="input-field w-full min-w-[130px] rounded-md px-1.5 py-1 text-sm"
                        />
                      </td>
                      <td className="py-1.5">
                        {cotacao.vencedora ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-accent-success/40 bg-accent-success/15 px-2 py-0.5 text-xs font-semibold text-accent-success">
                            ✓ Vencedora
                            {cotacao.previsao_chegada
                              ? ` — chega ${formatarDataSomente(cotacao.previsao_chegada)}`
                              : ''}
                          </span>
                        ) : (
                          <button
                            onClick={() => marcarVencedora(item.id, cotacao.id, cotacao.preco)}
                            className="text-xs font-medium text-accent-compras hover:text-primary"
                          >
                            Marcar vencedora
                          </button>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                  {cotacoes.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-3 text-center text-muted">
                        Nenhuma cotação cadastrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {atingiuLimite ? (
              <p className="mt-3 text-xs text-accent-alert">
                Limite de 3 cotações atingido para este item.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-3 rounded-md bg-surface-alt p-3">
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-[180px] flex-[2]">
                    <label className="block text-xs text-muted">Fornecedor *</label>
                    <div className="relative mt-1">
                      <input
                        type="text"
                        value={f.fornecedor}
                        onChange={(e) => atualizarFornecedor(item.id, e.target.value)}
                        onFocus={() =>
                          setDropdownFornecedorAberto((atual) => ({ ...atual, [item.id]: true }))
                        }
                        onBlur={() =>
                          setTimeout(
                            () =>
                              setDropdownFornecedorAberto((atual) => ({
                                ...atual,
                                [item.id]: false,
                              })),
                            150,
                          )
                        }
                        autoComplete="off"
                        className="input-field w-full rounded-md px-2 py-1 pr-7 text-sm"
                      />
                      {buscandoFornecedor[item.id] && (
                        <span
                          aria-hidden="true"
                          className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-accent-primary"
                        />
                      )}
                    </div>
                    {dropdownFornecedorAberto[item.id] &&
                      (sugestoesFornecedor[item.id]?.length ?? 0) > 0 && (
                        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-white/10 bg-surface-alt py-1 shadow-lg">
                          {sugestoesFornecedor[item.id].map((fornecedor) => (
                            <li key={fornecedor.codigoClienteOmie}>
                              <button
                                type="button"
                                onMouseDown={() => selecionarFornecedor(item.id, fornecedor)}
                                className="block w-full truncate px-3 py-1.5 text-left text-sm text-primary hover:bg-white/10"
                              >
                                {fornecedor.razaoSocial}
                                {fornecedor.cnpjCpf && (
                                  <span className="ml-1.5 text-xs text-muted">
                                    — {fornecedor.cnpjCpf}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                  </div>
                  <div className="min-w-[110px] flex-1">
                    <label className="block text-xs text-muted">Preço *</label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={f.preco}
                      onChange={(e) => atualizarForm(item.id, 'preco', e.target.value)}
                      className="input-field mt-1 w-full rounded-md px-2 py-1 font-mono text-sm"
                    />
                  </div>
                  <div className="min-w-[140px] flex-1">
                    <label className="block text-xs text-muted">Cotado em</label>
                    <input
                      type="date"
                      value={f.data_cotacao}
                      onChange={(e) => atualizarForm(item.id, 'data_cotacao', e.target.value)}
                      className="input-field mt-1 w-full min-w-[140px] rounded-md px-2 py-1 text-sm"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="min-w-[140px] flex-1">
                    <label className="block text-xs text-muted">Validade *</label>
                    <input
                      type="date"
                      value={f.validade_cotacao}
                      onChange={(e) => atualizarForm(item.id, 'validade_cotacao', e.target.value)}
                      className="input-field mt-1 w-full min-w-[140px] rounded-md px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="min-w-[180px] flex-[2]">
                    <label className="block text-xs text-muted">Empresa que fatura</label>
                    <input
                      type="text"
                      value={f.empresa_faturou}
                      onChange={(e) => atualizarForm(item.id, 'empresa_faturou', e.target.value)}
                      className="input-field mt-1 w-full rounded-md px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="min-w-[140px] flex-1">
                    <label className="block text-xs text-muted">Previsão de chegada</label>
                    <input
                      type="date"
                      value={f.previsao_chegada}
                      onChange={(e) => atualizarForm(item.id, 'previsao_chegada', e.target.value)}
                      className="input-field mt-1 w-full min-w-[140px] rounded-md px-2 py-1 text-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => adicionarCotacao(item.id)}
                    className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary-dark"
                  >
                    + Adicionar cotação
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
