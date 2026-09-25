'use client'

// Cadastro das metas do mês (só gestor — a escrita também é barrada no banco
// pelo RLS de metas_comerciais). Meta global da empresa + ajuste de dias
// úteis (feriado municipal/emenda) + meta pessoal por vendedora. Nada é
// excluído: campo em branco grava 0 (meta) ou volta pro cálculo automático
// (dias úteis).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarMoeda, parseMoedaBR } from '@/lib/kanban/formatacao'
import { mensagemErroSalvarMetas } from '@/lib/produtividade/erros'

export interface MetaLinha {
  id: string
  funcionario_id: string | null
  valor_meta: number
  dias_uteis_ajuste: number | null
}

const CLASSE_MOEDA = 'input-field w-40 rounded-md px-2 py-1.5 font-mono text-sm'

// Valor salvo -> texto editável no formato brasileiro ("240.000,00").
function paraTexto(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Campo de moeda em texto livre com parse brasileiro. Não usa o MoedaInput
// compartilhado (input type="number"): nele, "240.000" digitado vira 240 —
// o ponto é lido como separador decimal. Aqui "240.000", "240.000,00" e
// "240000" viram todos 240 mil; fora do foco, mostra "R$ 240.000,00".
function CampoMoeda({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (valor: string) => void
  ariaLabel: string
}) {
  const [focado, setFocado] = useState(false)
  const numero = parseMoedaBR(value)
  const invalido = value.trim() !== '' && numero === null
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      aria-invalid={invalido}
      value={focado || numero === null ? value : formatarMoeda(numero)}
      onFocus={() => setFocado(true)}
      onBlur={() => {
        setFocado(false)
        if (numero !== null) onChange(paraTexto(numero))
      }}
      onChange={(e) => onChange(e.target.value)}
      placeholder="R$ 0,00"
      className={`${CLASSE_MOEDA} ${invalido ? 'ring-1 ring-accent-danger' : ''}`}
    />
  )
}

export function MetasEditor({
  empresaId,
  ano,
  mes,
  rotuloMes,
  usuarioId,
  vendedoras,
  metas,
  diasUteisCalendario,
  onSalvo,
}: {
  empresaId: string
  ano: number
  mes: number
  rotuloMes: string
  usuarioId: string
  vendedoras: { id: string; nome: string }[]
  metas: MetaLinha[]
  diasUteisCalendario: number
  onSalvo: () => void
}) {
  const [supabase] = useState(() => createClient())
  const [global, setGlobal] = useState('')
  const [diasAjuste, setDiasAjuste] = useState('')
  const [pessoais, setPessoais] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  // Recarrega o formulário quando muda o mês ou chegam as metas salvas.
  useEffect(() => {
    const linhaGlobal = metas.find((m) => m.funcionario_id === null)
    setGlobal(linhaGlobal && linhaGlobal.valor_meta > 0 ? paraTexto(linhaGlobal.valor_meta) : '')
    setDiasAjuste(linhaGlobal?.dias_uteis_ajuste != null ? String(linhaGlobal.dias_uteis_ajuste) : '')
    const mapa: Record<string, string> = {}
    for (const m of metas) {
      if (m.funcionario_id && m.valor_meta > 0) mapa[m.funcionario_id] = paraTexto(m.valor_meta)
    }
    setPessoais(mapa)
  }, [metas])

  useEffect(() => {
    setSucesso(false)
    setErro(null)
  }, [ano, mes])

  function paraNumero(valor: string): number | null {
    if (valor.trim() === '') return 0
    return parseMoedaBR(valor)
  }

  // Grava uma linha (update se já existe, insert se não) — sem upsert, pra
  // não depender de ON CONFLICT com funcionario_id nulo.
  async function gravar(funcionarioId: string | null, campos: { valor_meta: number; dias_uteis_ajuste?: number | null }) {
    const existente = metas.find((m) => m.funcionario_id === funcionarioId)
    if (existente) {
      const mudou =
        existente.valor_meta !== campos.valor_meta ||
        (campos.dias_uteis_ajuste !== undefined && existente.dias_uteis_ajuste !== campos.dias_uteis_ajuste)
      if (!mudou) return
      const { error } = await supabase.from('metas_comerciais').update(campos).eq('id', existente.id)
      if (error) throw error
      return
    }
    // Não cria linha nova só pra gravar "nada".
    if (campos.valor_meta === 0 && (campos.dias_uteis_ajuste ?? null) === null) return
    const { error } = await supabase.from('metas_comerciais').insert({
      empresa_id: empresaId,
      funcionario_id: funcionarioId,
      ano,
      mes,
      criado_por: usuarioId,
      ...campos,
    })
    if (error) throw error
  }

  async function salvar() {
    setErro(null)
    setSucesso(false)

    const valorGlobal = paraNumero(global)
    if (valorGlobal === null) {
      setErro('Meta da empresa inválida.')
      return
    }
    let ajuste: number | null = null
    if (diasAjuste.trim() !== '') {
      const n = Number(diasAjuste)
      if (!Number.isInteger(n) || n < 0 || n > 31) {
        setErro('Dias úteis: informe um número inteiro entre 0 e 31, ou deixe em branco.')
        return
      }
      ajuste = n
    }
    const valoresPessoais: [string, number][] = []
    for (const v of vendedoras) {
      const n = paraNumero(pessoais[v.id] ?? '')
      if (n === null) {
        setErro(`Meta de ${v.nome} inválida.`)
        return
      }
      valoresPessoais.push([v.id, n])
    }

    setSalvando(true)
    try {
      await gravar(null, { valor_meta: valorGlobal, dias_uteis_ajuste: ajuste })
      for (const [id, valor] of valoresPessoais) await gravar(id, { valor_meta: valor })
      setSucesso(true)
      onSalvo()
    } catch (err) {
      console.error('Erro ao salvar metas:', err)
      setErro(mensagemErroSalvarMetas(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="rounded-lg border border-accent-primary/40 bg-surface p-5">
      <h2 className="font-heading text-lg font-semibold tracking-wide text-primary">Metas de {rotuloMes}</h2>
      <p className="mt-1 text-xs text-muted">Só o gestor edita. Campo em branco = sem meta.</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Meta da empresa (global)</span>
          <CampoMoeda value={global} onChange={setGlobal} ariaLabel="Meta da empresa (global)" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Dias úteis do mês (ajuste)</span>
          <input
            type="number"
            min={0}
            max={31}
            step={1}
            value={diasAjuste}
            onChange={(e) => setDiasAjuste(e.target.value)}
            placeholder={`${diasUteisCalendario} (automático)`}
            className="input-field w-40 rounded-md px-2 py-1.5 font-mono text-sm"
          />
          <span className="text-xs text-muted">
            Em branco usa o cálculo automático (seg–sex, sem feriados nacionais). Preencha pra descontar feriado
            municipal ou emenda.
          </span>
        </label>
      </div>

      <h3 className="mt-5 text-sm font-medium text-primary">Meta pessoal por vendedora</h3>
      {vendedoras.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nenhum perfil comercial ativo.</p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vendedoras.map((v) => (
            <label key={v.id} className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{v.nome}</span>
              <CampoMoeda
                value={pessoais[v.id] ?? ''}
                onChange={(valor) => setPessoais((atual) => ({ ...atual, [v.id]: valor }))}
                ariaLabel={`Meta pessoal de ${v.nome}`}
              />
            </label>
          ))}
        </div>
      )}

      {erro && (
        <p className="mt-4 rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erro}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="rounded-md bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:bg-accent-primary-dark disabled:opacity-60"
        >
          {salvando ? 'Salvando…' : 'Salvar metas'}
        </button>
        {sucesso && <span className="text-sm text-accent-success">Metas salvas.</span>}
      </div>
    </section>
  )
}
