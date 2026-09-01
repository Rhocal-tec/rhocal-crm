'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/contexts/EmpresaContext'
import {
  agregarClientesInteligencia,
  diasDesde,
  type AuditoriaPedidoBruta,
  type ClienteCadastroBruto,
  type ClienteInteligencia,
  type InteracaoBruta,
  type ItemBruto,
  type OportunidadeBruta,
  type PedidoBruto,
  type TarefaBruta,
  type TemperaturaAutomatica,
} from '@/lib/inteligencia/agregar'
import { exportarClientesCsv } from '@/lib/inteligencia/csv'
import { FiltrosInteligencia, filtrosVazios, type FiltrosState } from './FiltrosInteligencia'
import { TabelaInteligencia, type OrdemScore } from './TabelaInteligencia'
import { FichaClienteModal } from './FichaClienteModal'
import { CardsResumoInteligencia } from './CardsResumoInteligencia'
import { AlertasChurn } from './AlertasChurn'
import { CriarTarefaClienteModal } from './CriarTarefaClienteModal'
import { SalvarCampanhaModal } from './SalvarCampanhaModal'
import { CampanhasTab } from './CampanhasTab'

function aplicaFiltroFaixaUltimaCompra(valor: string | null, faixa: FiltrosState['faixaUltimaCompra']): boolean {
  if (!faixa) return true
  if (faixa === 'nunca') return valor === null
  if (valor === null) return false
  return diasDesde(valor) <= Number(faixa)
}

function aplicaFiltroFaixaFrequencia(qtd: number, faixa: FiltrosState['faixaFrequencia']): boolean {
  if (!faixa) return true
  if (faixa === '1x') return qtd === 1
  if (faixa === '2_5x') return qtd >= 2 && qtd <= 5
  return qtd >= 6
}

function aplicaFiltroFaixaTicket(ticket: number | null, faixa: FiltrosState['faixaTicket']): boolean {
  if (!faixa) return true
  if (ticket === null) return false
  if (faixa === 'ate_1k') return ticket <= 1000
  if (faixa === '1k_5k') return ticket > 1000 && ticket <= 5000
  return ticket > 5000
}

function aplicaFiltroFaixaScore(score: number, faixa: FiltrosState['faixaScore']): boolean {
  if (!faixa) return true
  if (faixa === 'alto') return score >= 70
  if (faixa === 'medio') return score >= 40 && score <= 69
  return score <= 39
}

export function InteligenciaComercial() {
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [clientes, setClientes] = useState<ClienteInteligencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<FiltrosState>(filtrosVazios())
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [fichaAberta, setFichaAberta] = useState<ClienteInteligencia | null>(null)
  const [aba, setAba] = useState<'segmentacao' | 'campanhas'>('segmentacao')
  const [ordemScore, setOrdemScore] = useState<OrdemScore>(null)
  const [clienteParaTarefa, setClienteParaTarefa] = useState<ClienteInteligencia | null>(null)
  const [modalCampanhaAberto, setModalCampanhaAberto] = useState(false)

  useEffect(() => {
    if (!empresaAtiva) return
    let ativo = true
    setCarregando(true)
    setErro(null)

    async function carregar() {
      try {
        const { data: pedidosData, error: erroPedidos } = await supabase
          .from('pedidos')
          .select('id, numero, cliente_nome, cliente_cnpj, cliente_omie_id, status, criado_em, criado_por, valor_frete')
          .eq('empresa_id', empresaAtiva!.id)
        if (erroPedidos) throw erroPedidos
        const pedidos = (pedidosData ?? []) as PedidoBruto[]
        const idsPedidos = pedidos.map((p) => p.id)

        const [itensResp, auditoriaResp, oportunidadesResp, clientesResp, profilesResp] = await Promise.all([
          idsPedidos.length > 0
            ? supabase
                .from('pedido_itens')
                .select('pedido_id, descricao, preco_venda, quantidade')
                .in('pedido_id', idsPedidos)
            : Promise.resolve({ data: [], error: null }),
          idsPedidos.length > 0
            ? supabase
                .from('audit_log')
                .select('registro_id, data_hora, dados_depois')
                .eq('tabela', 'pedidos')
                .in('registro_id', idsPedidos)
                .order('data_hora', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('oportunidades')
            .select('id, numero, cliente_nome, cliente_cnpj, status, origem, temperatura, valor_estimado, criado_em, criado_por')
            .eq('empresa_id', empresaAtiva!.id),
          // `clientes` não é escopada por empresa (cadastro compartilhado
          // RHOCAL/MATSEG no Omie — fase 30/34): traz todo mundo, o
          // cruzamento com pedidos/oportunidades da empresa ativa é quem
          // decide quais aparecem de fato na tela.
          supabase
            .from('clientes')
            .select('id, razao_social, nome_fantasia, cnpj, email, telefone, contato, cidade, estado, cep, observacoes, omie_cliente_id'),
          supabase.from('profiles').select('id, nome'),
        ])

        if (itensResp.error) throw itensResp.error
        if (auditoriaResp.error) throw auditoriaResp.error
        if (oportunidadesResp.error) throw oportunidadesResp.error
        if (clientesResp.error) throw clientesResp.error
        if (profilesResp.error) throw profilesResp.error

        const oportunidades = (oportunidadesResp.data ?? []) as OportunidadeBruta[]
        const idsOportunidades = oportunidades.map((o) => o.id)

        const [tarefasResp, interacoesResp] =
          idsPedidos.length > 0 || idsOportunidades.length > 0
            ? await Promise.all([
                supabase
                  .from('tarefas')
                  .select('id, oportunidade_id, pedido_id, descricao, data_prevista, situacao, responsavel')
                  .eq('excluida', false)
                  .neq('situacao', 'Realizada')
                  .neq('situacao', 'Cancelada'),
                supabase
                  .from('interacoes')
                  .select('id, oportunidade_id, pedido_id, tipo, resultado, criado_em'),
              ])
            : [
                { data: [], error: null },
                { data: [], error: null },
              ]
        if (tarefasResp.error) throw tarefasResp.error
        if (interacoesResp.error) throw interacoesResp.error

        const auditoriaPedidos: AuditoriaPedidoBruta[] = (auditoriaResp.data ?? []).map((log) => ({
          registro_id: log.registro_id,
          data_hora: log.data_hora,
          status_depois: (log.dados_depois as Record<string, unknown> | null)?.status as string | null,
        }))

        const nomesPorProfileId = Object.fromEntries(
          (profilesResp.data ?? []).map((p) => [p.id, p.nome]),
        )

        const agregados = agregarClientesInteligencia({
          pedidos,
          itens: (itensResp.data ?? []) as ItemBruto[],
          auditoriaPedidos,
          oportunidades,
          tarefas: (tarefasResp.data ?? []) as TarefaBruta[],
          interacoes: (interacoesResp.data ?? []) as InteracaoBruta[],
          clientesCadastro: (clientesResp.data ?? []) as ClienteCadastroBruto[],
          nomesPorProfileId,
        })

        if (!ativo) return
        setClientes(agregados)
        setSelecionados(new Set())
      } catch (err) {
        console.error('Erro ao carregar Inteligência Comercial:', err)
        if (ativo) setErro('Não foi possível carregar os dados. Tente novamente.')
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [supabase, empresaAtiva])

  const opcoes = useMemo(() => {
    const temperaturasManuais = new Set<string>()
    const origens = new Set<string>()
    const ufs = new Set<string>()
    const vendedores = new Map<string, string>()

    for (const c of clientes) {
      if (c.temperaturaManual) temperaturasManuais.add(c.temperaturaManual)
      if (c.origem) origens.add(c.origem)
      if (c.estado) ufs.add(c.estado)
      if (c.vendedorId && c.vendedorNome) vendedores.set(c.vendedorId, c.vendedorNome)
    }

    return {
      temperaturasManuais: Array.from(temperaturasManuais).sort(),
      origens: Array.from(origens).sort(),
      ufs: Array.from(ufs).sort(),
      vendedores: Array.from(vendedores.entries())
        .map(([id, nome]) => ({ id, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    }
  }, [clientes])

  const clientesFiltrados = useMemo(() => {
    return clientes.filter((c) => {
      if (
        filtros.temperaturasAutomaticas.size > 0 &&
        !filtros.temperaturasAutomaticas.has(c.temperaturaAutomatica as TemperaturaAutomatica)
      ) {
        return false
      }
      if (filtros.temperaturaManual && c.temperaturaManual !== filtros.temperaturaManual) return false
      if (filtros.etapaFunil && c.etapaFunil !== filtros.etapaFunil) return false
      if (filtros.origem && c.origem !== filtros.origem) return false
      if (!aplicaFiltroFaixaUltimaCompra(c.ultimaCompra, filtros.faixaUltimaCompra)) return false
      if (!aplicaFiltroFaixaFrequencia(c.qtdPedidosEfetuados, filtros.faixaFrequencia)) return false
      if (!aplicaFiltroFaixaTicket(c.ticketMedio, filtros.faixaTicket)) return false
      if (filtros.cidade && !(c.cidade ?? '').toLowerCase().includes(filtros.cidade.trim().toLowerCase())) {
        return false
      }
      if (filtros.uf && c.estado !== filtros.uf) return false
      if (filtros.vendedorId && c.vendedorId !== filtros.vendedorId) return false
      if (!aplicaFiltroFaixaScore(c.scorePropensao, filtros.faixaScore)) return false
      return true
    })
  }, [clientes, filtros])

  const clientesOrdenados = useMemo(() => {
    if (!ordemScore) return clientesFiltrados
    const copia = [...clientesFiltrados]
    copia.sort((a, b) =>
      ordemScore === 'asc' ? a.scorePropensao - b.scorePropensao : b.scorePropensao - a.scorePropensao,
    )
    return copia
  }, [clientesFiltrados, ordemScore])

  function alternarOrdemScore() {
    setOrdemScore((atual) => (atual === 'desc' ? 'asc' : atual === 'asc' ? null : 'desc'))
  }

  function alternarSelecao(chave: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(chave)) novo.delete(chave)
      else novo.add(chave)
      return novo
    })
  }

  function alternarSelecionarTodos() {
    setSelecionados((atual) => {
      const todosMarcados = clientesFiltrados.length > 0 && clientesFiltrados.every((c) => atual.has(c.chave))
      if (todosMarcados) return new Set()
      return new Set(clientesFiltrados.map((c) => c.chave))
    })
  }

  // Base de clientes usada tanto pelo Exportar CSV quanto por "Salvar como
  // campanha": selecionados na tabela, ou todos os filtrados se nada
  // estiver selecionado.
  function baseParaAcao(): ClienteInteligencia[] {
    return selecionados.size > 0 ? clientesFiltrados.filter((c) => selecionados.has(c.chave)) : clientesFiltrados
  }

  function handleExportar() {
    const base = baseParaAcao()
    if (base.length === 0) return
    const hoje = new Date().toISOString().slice(0, 10)
    exportarClientesCsv(base, `inteligencia-comercial-${empresaAtiva?.slug ?? 'rhocal'}-${hoje}.csv`)
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <h1 className="font-heading text-2xl font-semibold tracking-wide text-primary">
        Inteligência Comercial
      </h1>
      <p className="mt-1 text-sm text-muted">
        Segmentação RFM da base de clientes — combine filtros e exporte pra campanhas de marketing.
        {empresaAtiva && <span className="text-primary/70"> Empresa ativa: {empresaAtiva.nome_fantasia}.</span>}
      </p>

      {erro && <p className="mt-4 text-sm text-accent-danger">{erro}</p>}

      {!carregando && (
        <div className="mt-6">
          <AlertasChurn clientes={clientes} onCriarTarefa={setClienteParaTarefa} />
        </div>
      )}

      <div className="mt-6 flex gap-2 border-b border-white/10">
        <button
          type="button"
          onClick={() => setAba('segmentacao')}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            aba === 'segmentacao'
              ? 'border-b-2 border-accent-primary text-primary'
              : 'text-muted hover:text-primary'
          }`}
        >
          Segmentação
        </button>
        <button
          type="button"
          onClick={() => setAba('campanhas')}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            aba === 'campanhas' ? 'border-b-2 border-accent-primary text-primary' : 'text-muted hover:text-primary'
          }`}
        >
          Campanhas
        </button>
      </div>

      {aba === 'campanhas' ? (
        <CampanhasTab />
      ) : (
        <>
          {!carregando && (
            <div className="mt-6">
              <CardsResumoInteligencia clientes={clientesFiltrados} />
            </div>
          )}

          <div className="mt-6">
            <FiltrosInteligencia filtros={filtros} onChange={setFiltros} opcoes={opcoes} />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {clientesFiltrados.length} cliente(s) encontrado(s)
              {selecionados.size > 0 ? ` · ${selecionados.size} selecionado(s)` : ''}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setModalCampanhaAberto(true)}
                disabled={clientesFiltrados.length === 0}
                className="rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-primary/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Salvar como campanha
              </button>
              <button
                onClick={handleExportar}
                disabled={clientesFiltrados.length === 0}
                className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Exportar CSV{selecionados.size > 0 ? ` (${selecionados.size})` : ''}
              </button>
            </div>
          </div>

          {carregando ? (
            <p className="mt-8 text-center text-sm text-muted">Carregando…</p>
          ) : (
            <div className="mt-4">
              <TabelaInteligencia
                clientes={clientesOrdenados}
                selecionados={selecionados}
                onAlternarSelecao={alternarSelecao}
                onAlternarSelecionarTodos={alternarSelecionarTodos}
                onVerFicha={setFichaAberta}
                ordemScore={ordemScore}
                onAlternarOrdemScore={alternarOrdemScore}
              />
            </div>
          )}
        </>
      )}

      <FichaClienteModal cliente={fichaAberta} onClose={() => setFichaAberta(null)} />
      <CriarTarefaClienteModal
        cliente={clienteParaTarefa}
        empresaId={empresaAtiva?.id ?? null}
        onClose={() => setClienteParaTarefa(null)}
      />
      <SalvarCampanhaModal
        aberto={modalCampanhaAberto}
        clientes={baseParaAcao()}
        filtros={filtros}
        empresaId={empresaAtiva?.id ?? null}
        onClose={() => setModalCampanhaAberto(false)}
        onSalva={() => setAba('campanhas')}
      />
    </main>
  )
}
