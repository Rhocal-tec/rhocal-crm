'use client'

import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { AppHeader } from '@/components/layout/AppHeader'
import { FiltroData } from '@/components/busca/FiltroData'
import { PedidoDetalheModal } from '@/components/kanban/PedidoDetalheModal'
import { STATUS_LABELS } from '@/lib/kanban/status'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import { cotacaoVencida } from '@/lib/kanban/cotacao-vencida'
import { proximoDia, type ModoFiltroData } from '@/lib/kanban/filtro-data'
import type { Database, PedidoStatus } from '@/types/database'

type HistoricoCA = Database['public']['Views']['vw_historico_ca']['Row']

interface PedidoResumo {
  id: string
  numero: number
  cliente_nome: string
  status: PedidoStatus
  criado_em: string
}

type AbaBusca = 'pedido' | 'ca'

export default function BuscaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-base text-muted">
          Carregando…
        </div>
      }
    >
      <BuscaPageConteudo />
    </Suspense>
  )
}

function BuscaPageConteudo() {
  const { profile, loading } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const searchParams = useSearchParams()
  const [supabase] = useState(() => createClient())
  const [aba, setAba] = useState<AbaBusca>('pedido')
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null)

  // Filtro de data — compartilhado pelas duas abas; cada busca aplica sobre o
  // campo relevante (criado_em do pedido ou data_cotacao da cotação).
  const [modoData, setModoData] = useState<ModoFiltroData>('nenhum')
  const [dataEspecifica, setDataEspecifica] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')

  const [numeroInput, setNumeroInput] = useState('')
  const [buscandoPedido, setBuscandoPedido] = useState(false)
  const [erroPedido, setErroPedido] = useState<string | null>(null)
  const [resultadosPedido, setResultadosPedido] = useState<PedidoResumo[] | null>(null)

  const [caInput, setCaInput] = useState('')
  const [buscandoCa, setBuscandoCa] = useState(false)
  const [erroCa, setErroCa] = useState<string | null>(null)
  const [resultadosCa, setResultadosCa] = useState<HistoricoCA[] | null>(null)

  const veBuscaCa = profile?.setor === 'compras' || profile?.setor === 'gestor'

  // Valida o filtro de data e retorna null se inválido (já seta a mensagem de erro).
  function validarFiltroData(setErro: (msg: string | null) => void): boolean {
    if (modoData === 'especifica' && !dataEspecifica) {
      setErro('Selecione a data do filtro.')
      return false
    }
    if (modoData === 'intervalo' && !dataDe && !dataAte) {
      setErro('Selecione ao menos uma data no intervalo.')
      return false
    }
    return true
  }

  async function buscarPedido(e: FormEvent) {
    e.preventDefault()
    setErroPedido(null)
    setResultadosPedido(null)

    if (!empresaAtiva) return
    if (!validarFiltroData(setErroPedido)) return

    const termo = numeroInput.trim()
    if (!termo && modoData === 'nenhum') {
      setErroPedido('Informe um número de pedido ou um filtro de data.')
      return
    }

    let numero: number | null = null
    if (termo) {
      numero = Number(termo)
      if (!Number.isFinite(numero)) {
        setErroPedido('Número de pedido inválido.')
        return
      }
    }

    setBuscandoPedido(true)
    let query = supabase
      .from('pedidos')
      .select('id, numero, cliente_nome, status, criado_em')
      .eq('empresa_id', empresaAtiva.id)
      .order('criado_em', { ascending: false })

    if (numero !== null) query = query.eq('numero', numero)

    if (modoData === 'especifica' && dataEspecifica) {
      query = query
        .gte('criado_em', `${dataEspecifica}T00:00:00`)
        .lt('criado_em', `${proximoDia(dataEspecifica)}T00:00:00`)
    } else if (modoData === 'intervalo') {
      if (dataDe) query = query.gte('criado_em', `${dataDe}T00:00:00`)
      if (dataAte) query = query.lt('criado_em', `${proximoDia(dataAte)}T00:00:00`)
    }

    const { data, error } = await query
    setBuscandoPedido(false)

    if (error) {
      setErroPedido('Não foi possível buscar. Tente novamente.')
      return
    }
    if (!data || data.length === 0) {
      setErroPedido('Nenhum pedido encontrado com esses critérios.')
      return
    }

    // Busca por número exato com resultado único: abre o pedido direto.
    if (numero !== null && data.length === 1) {
      setPedidoAbertoId(data[0].id)
      return
    }
    setResultadosPedido(data)
  }

  async function executarBuscaCa(termo: string) {
    setErroCa(null)
    setResultadosCa(null)

    if (!empresaAtiva) return
    if (!validarFiltroData(setErroCa)) return

    if (!termo && modoData === 'nenhum') {
      setErroCa('Informe um CA ou um filtro de data.')
      return
    }

    setBuscandoCa(true)

    // vw_historico_ca não guarda empresa_id (é uma view sobre pedido_itens
    // join pedidos) — escopamos por empresa buscando primeiro os números de
    // pedido daquela empresa e filtrando o histórico por eles.
    const { data: pedidosEmpresa, error: erroPedidosEmpresa } = await supabase
      .from('pedidos')
      .select('numero')
      .eq('empresa_id', empresaAtiva.id)

    if (erroPedidosEmpresa) {
      setBuscandoCa(false)
      setErroCa('Não foi possível buscar. Tente novamente.')
      return
    }

    const numerosEmpresa = (pedidosEmpresa ?? []).map((p) => p.numero)
    if (numerosEmpresa.length === 0) {
      setBuscandoCa(false)
      setErroCa('Nenhum histórico encontrado com esses critérios.')
      return
    }

    let query = supabase
      .from('vw_historico_ca')
      .select('*')
      .in('pedido_numero', numerosEmpresa)
      .order('data_cotacao', { ascending: false })

    if (termo) query = query.eq('ca', termo)

    if (modoData === 'especifica' && dataEspecifica) {
      query = query.eq('data_cotacao', dataEspecifica)
    } else if (modoData === 'intervalo') {
      if (dataDe) query = query.gte('data_cotacao', dataDe)
      if (dataAte) query = query.lte('data_cotacao', dataAte)
    }

    const { data, error } = await query
    setBuscandoCa(false)

    if (error) {
      setErroCa('Não foi possível buscar. Tente novamente.')
      return
    }
    if (!data || data.length === 0) {
      setErroCa('Nenhum histórico encontrado com esses critérios.')
      return
    }
    setResultadosCa(data)
  }

  async function buscarCa(e: FormEvent) {
    e.preventDefault()
    await executarBuscaCa(caInput.trim())
  }

  async function abrirPedidoPorNumero(numero: number | null) {
    if (numero === null || !empresaAtiva) return
    const { data } = await supabase
      .from('pedidos')
      .select('id')
      .eq('numero', numero)
      .eq('empresa_id', empresaAtiva.id)
      .maybeSingle()
    if (data) setPedidoAbertoId(data.id)
  }

  // Troca de empresa no seletor do header: descarta resultados da empresa
  // anterior em vez de deixá-los na tela indevidamente.
  useEffect(() => {
    setResultadosPedido(null)
    setResultadosCa(null)
    setErroPedido(null)
    setErroCa(null)
  }, [empresaAtiva?.id])

  // Chegando de um link "ver histórico completo" (aba Cotações do modal do
  // pedido): pré-preenche o CA, troca para a aba certa e já dispara a busca.
  useEffect(() => {
    if (!veBuscaCa) return
    const caParam = searchParams.get('ca')
    if (!caParam) return
    setAba('ca')
    setCaInput(caParam)
    executarBuscaCa(caParam.trim())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veBuscaCa, searchParams])

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base text-muted">
        Carregando…
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <AppHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <h1 className="font-heading text-2xl font-semibold tracking-wide text-primary">
          Busca
        </h1>

        <div className="mt-4 flex gap-5 border-b border-white/10">
          <button
            onClick={() => setAba('pedido')}
            className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
              aba === 'pedido'
                ? 'border-accent-primary text-primary'
                : 'border-transparent text-muted hover:text-primary/80'
            }`}
          >
            Buscar por Pedido
          </button>
          {veBuscaCa && (
            <button
              onClick={() => setAba('ca')}
              className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                aba === 'ca'
                  ? 'border-accent-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary/80'
              }`}
            >
              Buscar por CA
            </button>
          )}
        </div>

        {aba === 'pedido' && (
          <div className="mt-6">
            <form onSubmit={buscarPedido} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={numeroInput}
                  onChange={(e) => setNumeroInput(e.target.value)}
                  placeholder="Número do pedido (opcional)"
                  className="input-field w-64 rounded-md px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={buscandoPedido}
                  className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
                >
                  {buscandoPedido ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
              <FiltroData
                modo={modoData}
                onModoChange={setModoData}
                dataEspecifica={dataEspecifica}
                onDataEspecificaChange={setDataEspecifica}
                dataDe={dataDe}
                onDataDeChange={setDataDe}
                dataAte={dataAte}
                onDataAteChange={setDataAte}
              />
            </form>
            {erroPedido && <p className="mt-3 text-sm text-accent-danger">{erroPedido}</p>}

            {resultadosPedido && resultadosPedido.length > 0 && (
              <div className="mt-6 overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-surface-alt text-muted">
                      <th className="px-3 pb-2 pt-2.5 font-medium">Pedido</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Cliente</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Status</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Criado em</th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface">
                    {resultadosPedido.map((p) => (
                      <tr key={p.id} className="border-b border-white/5 last:border-0">
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setPedidoAbertoId(p.id)}
                            className="font-mono font-medium text-accent-compras hover:text-primary"
                          >
                            #{p.numero}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-primary">{p.cliente_nome}</td>
                        <td className="px-3 py-2 text-primary">{STATUS_LABELS[p.status]}</td>
                        <td className="px-3 py-2 text-primary">
                          {new Date(p.criado_em).toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {aba === 'ca' && veBuscaCa && (
          <div className="mt-6">
            <form onSubmit={buscarCa} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={caInput}
                  onChange={(e) => setCaInput(e.target.value)}
                  placeholder="Número do CA (opcional)"
                  className="input-field w-64 rounded-md px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={buscandoCa}
                  className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
                >
                  {buscandoCa ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
              <FiltroData
                modo={modoData}
                onModoChange={setModoData}
                dataEspecifica={dataEspecifica}
                onDataEspecificaChange={setDataEspecifica}
                dataDe={dataDe}
                onDataDeChange={setDataDe}
                dataAte={dataAte}
                onDataAteChange={setDataAte}
              />
            </form>
            {erroCa && <p className="mt-3 text-sm text-accent-danger">{erroCa}</p>}

            {resultadosCa && resultadosCa.length > 0 && (
              <div className="mt-6 overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-surface-alt text-muted">
                      <th className="px-3 pb-2 pt-2.5 font-medium">Descrição</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Pedido</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Cliente</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Fornecedor</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Preço</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Cotado em</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Validade</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Vencedora</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Empresa fatura</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Custo final</th>
                      <th className="px-3 pb-2 pt-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface">
                    {resultadosCa.map((linha, index) => (
                      <tr key={index} className="border-b border-white/5 last:border-0">
                        <td className="px-3 py-2 text-primary">{linha.descricao ?? '—'}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => abrirPedidoPorNumero(linha.pedido_numero)}
                            className="font-mono font-medium text-accent-compras hover:text-primary"
                          >
                            #{linha.pedido_numero ?? '—'}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-primary">{linha.cliente_nome ?? '—'}</td>
                        <td className="px-3 py-2 text-primary">{linha.fornecedor ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-primary">
                          {formatarMoeda(linha.preco)}
                        </td>
                        <td className="px-3 py-2 text-primary">
                          {formatarDataSomente(linha.data_cotacao)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              cotacaoVencida(linha.validade_cotacao)
                                ? 'text-accent-danger'
                                : 'text-primary'
                            }
                          >
                            {formatarDataSomente(linha.validade_cotacao)}
                          </span>
                          {cotacaoVencida(linha.validade_cotacao) && (
                            <span className="ml-1.5 inline-flex items-center rounded-full border border-accent-danger/40 bg-accent-danger/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-danger">
                              Vencida
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {linha.vencedora ? (
                            <span className="rounded-full bg-accent-success/15 px-2 py-0.5 text-xs font-medium text-accent-success">
                              Sim
                            </span>
                          ) : (
                            <span className="text-muted">Não</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-primary">
                          {linha.empresa_faturou ?? '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-primary">
                          {formatarMoeda(linha.custo_final)}
                        </td>
                        <td className="px-3 py-2 text-primary">
                          {linha.status ? STATUS_LABELS[linha.status] : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      <PedidoDetalheModal
        pedidoId={pedidoAbertoId}
        onClose={() => setPedidoAbertoId(null)}
        onDuplicado={setPedidoAbertoId}
        setor={profile.setor}
      />
    </div>
  )
}
