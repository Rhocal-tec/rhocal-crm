'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import type { Database } from '@/types/database'

type PedidoItem = Database['public']['Tables']['pedido_itens']['Row']
type Cotacao = Database['public']['Tables']['cotacoes']['Row']

const MAX_COTACOES_POR_ITEM = 3

interface NovaCotacaoForm {
  fornecedor: string
  preco: string
  data_cotacao: string
  validade_cotacao: string
  empresa_faturou: string
}

function formVazio(): NovaCotacaoForm {
  const hoje = new Date().toISOString().slice(0, 10)
  return {
    fornecedor: '',
    preco: '',
    data_cotacao: hoje,
    validade_cotacao: '',
    empresa_faturou: '',
  }
}

export function CotacoesTab({ itens }: { itens: PedidoItem[] }) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [cotacoesPorItem, setCotacoesPorItem] = useState<Record<string, Cotacao[]>>({})
  const [custoFinalPorItem, setCustoFinalPorItem] = useState<Record<string, string>>({})
  const [formularios, setFormularios] = useState<Record<string, NovaCotacaoForm>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

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
      setCarregando(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [itens, supabase])

  function form(itemId: string): NovaCotacaoForm {
    return formularios[itemId] ?? formVazio()
  }

  function atualizarForm(itemId: string, campo: keyof NovaCotacaoForm, valor: string) {
    setFormularios((atual) => ({
      ...atual,
      [itemId]: { ...form(itemId), [campo]: valor },
    }))
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
    setFormularios((atual) => ({ ...atual, [itemId]: formVazio() }))
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

        return (
          <div key={item.id} className="rounded-lg border border-white/10 bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-primary">{item.descricao}</h3>
              <span className="font-mono text-xs text-muted">Qtd. {item.quantidade}</span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <label className="text-sm text-muted">Custo final:</label>
              <input
                type="number"
                step="any"
                min="0"
                value={custoFinalPorItem[item.id] ?? ''}
                onChange={(e) =>
                  setCustoFinalPorItem((atual) => ({ ...atual, [item.id]: e.target.value }))
                }
                onBlur={(e) => salvarCustoFinal(item.id, e.target.value)}
                placeholder="—"
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
                    <th className="pb-1 font-medium">Vencedora</th>
                  </tr>
                </thead>
                <tbody>
                  {cotacoes.map((cotacao) => (
                    <tr
                      key={cotacao.id}
                      className={`border-b border-white/5 ${
                        cotacao.vencedora ? 'bg-accent-success/10' : ''
                      }`}
                    >
                      <td
                        className={`py-1.5 pr-2 text-primary ${
                          cotacao.vencedora
                            ? 'border-l-4 border-accent-success pl-2 font-semibold'
                            : 'pl-3'
                        }`}
                      >
                        {cotacao.fornecedor}
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-primary">
                        {formatarMoeda(cotacao.preco)}
                      </td>
                      <td className="py-1.5 pr-2 text-primary">
                        {formatarDataSomente(cotacao.data_cotacao)}
                      </td>
                      <td className="py-1.5 pr-2 text-primary">
                        {formatarDataSomente(cotacao.validade_cotacao)}
                      </td>
                      <td className="py-1.5 pr-2 text-primary">
                        {cotacao.empresa_faturou ?? '—'}
                      </td>
                      <td className="py-1.5">
                        {cotacao.vencedora ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-accent-success/40 bg-accent-success/15 px-2 py-0.5 text-xs font-semibold text-accent-success">
                            ✓ Vencedora
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
                  ))}
                  {cotacoes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-3 text-center text-muted">
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
              <div className="mt-3 grid grid-cols-6 gap-2 rounded-md bg-surface-alt p-3">
                <div className="col-span-2">
                  <label className="block text-xs text-muted">Fornecedor *</label>
                  <input
                    type="text"
                    value={f.fornecedor}
                    onChange={(e) => atualizarForm(item.id, 'fornecedor', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1 text-sm"
                  />
                </div>
                <div>
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
                <div>
                  <label className="block text-xs text-muted">Cotado em</label>
                  <input
                    type="date"
                    value={f.data_cotacao}
                    onChange={(e) => atualizarForm(item.id, 'data_cotacao', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Validade *</label>
                  <input
                    type="date"
                    value={f.validade_cotacao}
                    onChange={(e) => atualizarForm(item.id, 'validade_cotacao', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Empresa que fatura</label>
                  <input
                    type="text"
                    value={f.empresa_faturou}
                    onChange={(e) => atualizarForm(item.id, 'empresa_faturou', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1 text-sm"
                  />
                </div>
                <div className="col-span-6 flex justify-end">
                  <button
                    onClick={() => adicionarCotacao(item.id)}
                    className="mt-1 rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary-dark"
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
