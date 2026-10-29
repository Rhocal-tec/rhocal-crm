'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import type { Database } from '@/types/database'

type Preco = Database['public']['Tables']['banco_precos']['Row']

// Remove caracteres que quebram o filtro .or() do PostgREST.
export function termoSeguro(texto: string): string {
  return texto.replace(/[,()%*\\]/g, ' ').trim()
}

function numeroOuNulo(valor: string): number | null {
  const v = valor.trim().replace(/\./g, '').replace(',', '.')
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const FORM_VAZIO = {
  item_descricao: '',
  ca: '',
  fornecedor: '',
  marca: '',
  unidade: '',
  preco: '',
  quantidade_minima: '',
  frete: '',
  condicao_pagamento: '',
  prazo_entrega_dias: '',
  data_preco: '',
  validade: '',
  observacao: '',
}

export function BancoPrecos() {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [busca, setBusca] = useState('')
  const [registros, setRegistros] = useState<Preco[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)
  const [formAberto, setFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    let consulta = supabase
      .from('banco_precos')
      .select('*')
      .order('data_preco', { ascending: false })
      .order('criado_em', { ascending: false })
      .limit(300)
    const termo = termoSeguro(busca)
    if (termo) {
      consulta = consulta.or(
        `ca.ilike.%${termo}%,item_descricao.ilike.%${termo}%,fornecedor.ilike.%${termo}%,marca.ilike.%${termo}%`,
      )
    }
    const { data, error } = await consulta
    if (error) setErro('Não foi possível carregar o banco de preços.')
    setRegistros(data ?? [])
    setCarregando(false)
  }, [supabase, busca])

  useEffect(() => {
    const t = setTimeout(carregar, 300)
    return () => clearTimeout(t)
  }, [carregar])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const preco = numeroOuNulo(form.preco)
    if (!form.item_descricao.trim() || !form.fornecedor.trim() || preco === null) {
      setErro('Informe item, fornecedor e preço.')
      return
    }
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.from('banco_precos').insert({
      item_descricao: form.item_descricao.trim(),
      ca: form.ca.trim() || null,
      fornecedor: form.fornecedor.trim(),
      marca: form.marca.trim() || null,
      unidade: form.unidade.trim() || null,
      preco,
      quantidade_minima: numeroOuNulo(form.quantidade_minima),
      frete: numeroOuNulo(form.frete),
      condicao_pagamento: form.condicao_pagamento.trim() || null,
      prazo_entrega_dias: numeroOuNulo(form.prazo_entrega_dias),
      data_preco: form.data_preco || new Date().toISOString().slice(0, 10),
      validade: form.validade || null,
      observacao: form.observacao.trim() || null,
      origem: 'manual',
      criado_por: user.id,
    })
    setSalvando(false)
    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`)
      return
    }
    setForm(FORM_VAZIO)
    setFormAberto(false)
    carregar()
  }

  const menor = registros.length > 0 ? registros.reduce((a, b) => (b.preco < a.preco ? b : a)) : null
  const ultimo = registros[0] ?? null

  function campo(chave: keyof typeof FORM_VAZIO, rotulo: string, extra?: { type?: string; placeholder?: string; largo?: boolean }) {
    return (
      <label className={`flex flex-col gap-1 text-xs text-muted ${extra?.largo ? 'sm:col-span-2' : ''}`}>
        {rotulo}
        <input
          type={extra?.type ?? 'text'}
          value={form[chave]}
          placeholder={extra?.placeholder}
          onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))}
          className="input-field rounded-md px-2 py-1.5 text-sm text-primary"
        />
      </label>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold text-primary">Banco de Preços</h1>
          <p className="text-xs text-muted">
            Histórico de preços de fornecedores — cadastro manual e cotações registradas no sistema.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por CA, item, fornecedor ou marca…"
            className="input-field w-72 rounded-md px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => setFormAberto((a) => !a)}
            className="rounded-md bg-accent-compras px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            {formAberto ? 'Fechar' : '+ Novo preço'}
          </button>
        </div>
      </div>

      {formAberto && (
        <form onSubmit={salvar} className="grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          {campo('item_descricao', 'Item / descrição *', { largo: true })}
          {campo('ca', 'CA')}
          {campo('fornecedor', 'Fornecedor *')}
          {campo('marca', 'Marca')}
          {campo('unidade', 'Unidade (un, cx, par…)')}
          {campo('preco', 'Preço *', { placeholder: '0,00' })}
          {campo('quantidade_minima', 'Qtd. mínima')}
          {campo('frete', 'Frete', { placeholder: '0,00' })}
          {campo('condicao_pagamento', 'Condição de pagamento')}
          {campo('prazo_entrega_dias', 'Prazo de entrega (dias)')}
          {campo('data_preco', 'Data do preço', { type: 'date' })}
          {campo('validade', 'Validade', { type: 'date' })}
          {campo('observacao', 'Observação', { largo: true })}
          <div className="flex items-end">
            <button
              type="submit"
              disabled={salvando}
              className="rounded-md bg-accent-success px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {salvando ? 'Salvando…' : 'Salvar preço'}
            </button>
          </div>
        </form>
      )}

      {erro && <p className="text-sm text-accent-danger">{erro}</p>}

      {busca.trim() && menor && ultimo && (
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="rounded-lg border border-accent-success/30 bg-accent-success/10 px-4 py-2">
            <p className="text-xs text-muted">Menor preço</p>
            <p className="font-mono font-semibold text-accent-success">{formatarMoeda(menor.preco)}</p>
            <p className="text-xs text-muted">{menor.fornecedor} · {formatarDataSomente(menor.data_preco)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-surface px-4 py-2">
            <p className="text-xs text-muted">Último preço</p>
            <p className="font-mono font-semibold text-primary">{formatarMoeda(ultimo.preco)}</p>
            <p className="text-xs text-muted">{ultimo.fornecedor} · {formatarDataSomente(ultimo.data_preco)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-surface px-4 py-2">
            <p className="text-xs text-muted">Registros</p>
            <p className="font-mono font-semibold text-primary">{registros.length}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-muted">
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">CA</th>
              <th className="px-3 py-2 font-medium">Fornecedor</th>
              <th className="px-3 py-2 font-medium">Marca</th>
              <th className="px-3 py-2 text-right font-medium">Preço</th>
              <th className="px-3 py-2 font-medium">Condições</th>
              <th className="px-3 py-2 font-medium">Validade</th>
              <th className="px-3 py-2 font-medium">Origem</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted">Carregando…</td></tr>
            ) : registros.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted">Nenhum preço encontrado.</td></tr>
            ) : (
              registros.map((r) => (
                <tr key={r.id} className="border-b border-white/5 align-top">
                  <td className="px-3 py-2 text-muted">{formatarDataSomente(r.data_preco)}</td>
                  <td className="px-3 py-2 text-primary">
                    {r.item_descricao}
                    {r.observacao && <p className="text-xs text-muted">{r.observacao}</p>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{r.ca ?? '—'}</td>
                  <td className="px-3 py-2 text-primary">{r.fornecedor}</td>
                  <td className="px-3 py-2 text-muted">{r.marca ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-primary">
                    {formatarMoeda(r.preco)}
                    {r.unidade && <span className="text-xs text-muted"> /{r.unidade}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {[
                      r.condicao_pagamento,
                      r.prazo_entrega_dias !== null ? `${r.prazo_entrega_dias}d entrega` : null,
                      r.frete !== null ? `frete ${formatarMoeda(r.frete)}` : null,
                      r.quantidade_minima !== null ? `mín. ${r.quantidade_minima}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  <td className="px-3 py-2 text-muted">{r.validade ? formatarDataSomente(r.validade) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted">{r.origem === 'cotacao' ? 'Cotação' : 'Manual'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
