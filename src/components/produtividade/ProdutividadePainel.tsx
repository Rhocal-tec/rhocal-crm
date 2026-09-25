'use client'

// Aba Produtividade — substitui o painel externo de metas do comercial, que
// dependia de digitação manual. Tudo aqui é calculado a partir dos pedidos
// do CRM (critérios em src/lib/produtividade/calculo.ts); só as metas são
// cadastradas, pelo gestor, na própria tela (MetasEditor).
//
// Escopo: empresa ativa (EmpresaContext) + mês selecionado. Gestor vê a
// equipe inteira, o comparativo e edita metas; comercial vê só o próprio
// resultado e o resultado da empresa (recorte de interface — o RLS de
// `pedidos` libera leitura pra todos, como no resto do CRM).

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import {
  agregarProdutividade,
  agregarTarefasOportunidades,
  cancelados,
  dataISO,
  limitesDoMes,
  novasMetricas,
  novasMetricasTarefas,
  taxaConversao,
  temMarcoNoMes,
  type MarcosPedido,
  type MetricasProdutividade,
  type MetricasTarefas,
  type OportunidadeProdutividade,
  type PedidoProdutividade,
  type TarefaProdutividade,
} from '@/lib/produtividade/calculo'
import { faltaMigracao, MENSAGEM_FALTA_MIGRACAO } from '@/lib/produtividade/erros'
import { calcularDiasUteisMes, type DiasUteisMes } from '@/lib/produtividade/dias-uteis'
import { GraficoBarras, type BarraDado } from '@/components/painel/GraficoBarras'
import { MetasEditor, type MetaLinha } from './MetasEditor'
import type { Database } from '@/types/database'

type Profile = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'nome' | 'setor' | 'ativo'>

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

// PostgREST devolve no máximo 1000 linhas por chamada — pagina até acabar.
const TAMANHO_PAGINA = 1000
// Lotes de ids no `.in(...)`, pra URL da requisição não estourar.
const TAMANHO_LOTE_IDS = 150

async function paginar<T>(
  buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const todos: T[] = []
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await buscar(de, de + TAMANHO_PAGINA - 1)
    if (error) throw error
    todos.push(...(data ?? []))
    if (!data || data.length < TAMANHO_PAGINA) return todos
  }
}

function emLotes<T>(lista: T[]): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += TAMANHO_LOTE_IDS) lotes.push(lista.slice(i, i + TAMANHO_LOTE_IDS))
  return lotes
}

// Marcos do funil por pedido (fn_pedidos_marcos, migração 0033). Enquanto a
// 0033 não roda, cai pra fn_pedidos_efetuados (0032) — Faturado e Efetuados
// continuam certos, só Cotados/Aprovados/Entregues ficam "—".
async function buscarMarcos(
  supabase: ReturnType<typeof createClient>,
  empresaId: string,
): Promise<{ mapa: Map<string, MarcosPedido>; completos: boolean }> {
  try {
    const linhas = await paginar<{ pedido_id: string } & MarcosPedido>((de, ate) =>
      supabase.rpc('fn_pedidos_marcos', { p_empresa_id: empresaId }).range(de, ate),
    )
    return { mapa: new Map(linhas.map(({ pedido_id, ...m }) => [pedido_id, m])), completos: true }
  } catch (err) {
    if (!faltaMigracao(err)) throw err
    const linhas = await paginar<{ pedido_id: string; efetuado_em: string }>((de, ate) =>
      supabase.rpc('fn_pedidos_efetuados', { p_empresa_id: empresaId }).range(de, ate),
    )
    return {
      mapa: new Map(
        linhas.map((l) => [
          l.pedido_id,
          { cotado_em: null, aprovado_em: null, efetuado_em: l.efetuado_em, entregue_em: null },
        ]),
      ),
      completos: false,
    }
  }
}

function pct(valor: number, meta: number): number | null {
  if (meta <= 0) return null
  return Math.round((valor / meta) * 100)
}

function formatarPct(valor: number | null): string {
  return valor === null ? '—' : `${valor}%`
}

function mediaDiaria(valor: number, dias: DiasUteisMes): number | null {
  return dias.decorridos > 0 ? valor / dias.decorridos : null
}

function necessarioPorDia(valor: number, meta: number, dias: DiasUteisMes): number | null {
  if (meta <= 0 || dias.restantes === 0) return null
  return Math.max(meta - valor, 0) / dias.restantes
}

function BarraProgresso({ faturado, naoFaturado, meta }: { faturado: number; naoFaturado: number; meta: number }) {
  if (meta <= 0) {
    return <p className="mt-3 text-xs text-muted">Meta não definida para este mês.</p>
  }
  const larguraFaturado = Math.min((faturado / meta) * 100, 100)
  const larguraNaoFaturado = Math.min((naoFaturado / meta) * 100, 100 - larguraFaturado)
  return (
    <div
      className="mt-3 flex h-3 overflow-hidden rounded-full bg-white/5"
      role="img"
      aria-label={`Faturado ${formatarMoeda(faturado)} e não faturado ${formatarMoeda(naoFaturado)} de uma meta de ${formatarMoeda(meta)}`}
    >
      <div className="h-full bg-accent-success" style={{ width: `${larguraFaturado}%` }} />
      <div className="h-full bg-accent-alert/70" style={{ width: `${larguraNaoFaturado}%` }} />
    </div>
  )
}

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{rotulo}</p>
      <p className="mt-2 font-mono text-xl font-semibold text-primary">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-muted">{detalhe}</p>}
    </div>
  )
}

function Somatoria({ m }: { m: MetricasProdutividade }) {
  const itens: { rotulo: string; qtd: number; detalhe: string }[] = [
    { rotulo: 'Propostas montadas', qtd: m.propostas, detalhe: formatarMoeda(m.propostasValor) },
    { rotulo: 'Pedidos faturados', qtd: m.faturados, detalhe: formatarMoeda(m.faturadoValor) },
    { rotulo: 'Não faturados', qtd: m.naoFaturados, detalhe: formatarMoeda(m.naoFaturadoValor) },
    { rotulo: 'Pendentes', qtd: m.pendentes, detalhe: formatarMoeda(m.pendentesValor) },
    {
      rotulo: 'Cancelados',
      qtd: cancelados(m),
      detalhe: `${m.perdidos} perdidos · ${m.arquivadosSemEfetuar} arquivados`,
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {itens.map((i) => (
        <div key={i.rotulo} className="rounded-md bg-surface-alt px-3 py-2.5">
          <p className="text-xs text-muted">{i.rotulo}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-primary">{i.qtd}</p>
          <p className="text-xs text-muted">{i.detalhe}</p>
        </div>
      ))}
    </div>
  )
}

function Contadores({
  itens,
}: {
  itens: { rotulo: string; valor: number | null; destaque?: boolean; dica?: string }[]
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {itens.map((i) => (
        <div
          key={i.rotulo}
          title={i.dica}
          className={`rounded-md px-3 py-2.5 ${
            i.destaque ? 'bg-accent-danger/15 ring-1 ring-inset ring-accent-danger/40' : 'bg-surface-alt'
          }`}
        >
          <p className="text-xs text-muted">{i.rotulo}</p>
          <p className={`mt-1 font-mono text-lg font-semibold ${i.destaque ? 'text-accent-danger' : 'text-primary'}`}>
            {i.valor === null ? '—' : i.valor}
          </p>
        </div>
      ))}
    </div>
  )
}

// Grupo 1 — Tarefas e Oportunidades (critérios em calculo.ts).
function GrupoTarefas({ t }: { t: MetricasTarefas }) {
  return (
    <div>
      <Contadores
        itens={[
          { rotulo: 'Nova Tarefa', valor: t.novaTarefa, dica: 'Tarefas criadas no mês' },
          { rotulo: 'Hoje', valor: t.hoje },
          { rotulo: 'Tarefas Futuras', valor: t.futuras },
          { rotulo: 'Concluídas', valor: t.concluidas, dica: 'Só Realizada — Cancelada não conta' },
          { rotulo: 'Atrasadas', valor: t.atrasadas, destaque: t.atrasadas > 0 },
          { rotulo: 'Oportunidades', valor: t.oportunidades, dica: 'Oportunidades com atividade no mês' },
          {
            rotulo: 'Oport. Concluídas',
            valor: t.oportunidadesConcluidas,
            dica: 'Viraram GANHO (Convertida em Orçamento) no mês',
          },
        ]}
      />
      {t.atrasadasLista.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs text-muted hover:text-primary">
            Ver tarefas atrasadas ({t.atrasadasLista.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {t.atrasadasLista.map((a) => (
              <li key={a.id} className="text-xs text-primary/80">
                <span className="font-mono text-accent-danger">{formatarDataSomente(a.dataPrevista)}</span>
                {a.cliente && <> — {a.cliente}</>} · {a.descricao || '(sem descrição)'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

// Grupo 2 — Orçamentos e Pedidos. Sem os marcos completos (migração 0033
// ainda não rodada), Cotados/Aprovados/Entregues ficam "—" em vez de zero.
function GrupoPedidos({ m, marcosCompletos }: { m: MetricasProdutividade; marcosCompletos: boolean }) {
  return (
    <Contadores
      itens={[
        { rotulo: 'Orçamentos', valor: m.propostas, dica: 'Criados no mês (diretos + normais)' },
        { rotulo: 'Orçamentos Cotados', valor: marcosCompletos ? m.cotados : null },
        { rotulo: 'Pedidos Aprovados', valor: marcosCompletos ? m.aprovados : null },
        { rotulo: 'Pedidos Efetuados', valor: m.faturados },
        { rotulo: 'Pedidos Entregues', valor: marcosCompletos ? m.entregues : null },
      ]}
    />
  )
}

function CardVendedora({
  nome,
  m,
  metaPessoal,
  metaGlobal,
  dias,
  t,
  marcosCompletos,
}: {
  nome: string
  m: MetricasProdutividade
  metaPessoal: number
  metaGlobal: number
  dias: DiasUteisMes
  t: MetricasTarefas
  marcosCompletos: boolean
}) {
  const media = mediaDiaria(m.faturadoValor, dias)
  const necessario = necessarioPorDia(m.faturadoValor, metaPessoal, dias)
  return (
    <div className="rounded-lg border border-white/10 bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-lg font-semibold tracking-wide text-primary">{nome}</h3>
        <span className="text-xs text-muted">Meta pessoal: {metaPessoal > 0 ? formatarMoeda(metaPessoal) : '—'}</span>
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold text-primary">{formatarMoeda(m.faturadoValor)}</p>
      <p className="text-xs text-muted">faturado no mês</p>
      <BarraProgresso faturado={m.faturadoValor} naoFaturado={m.naoFaturadoValor} meta={metaPessoal} />
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">% meta pessoal</dt>
          <dd className="font-mono font-semibold text-primary">{formatarPct(pct(m.faturadoValor, metaPessoal))}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">% meta global</dt>
          <dd className="font-mono font-semibold text-primary">{formatarPct(pct(m.faturadoValor, metaGlobal))}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Conversão</dt>
          <dd className="font-mono font-semibold text-primary">{formatarPct(taxaConversao(m))}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Média diária</dt>
          <dd className="font-mono font-semibold text-primary">{media === null ? '—' : formatarMoeda(media)}</dd>
        </div>
      </dl>
      {necessario !== null && (
        <p className="mt-2 text-xs text-muted">
          Necessário por dia útil restante para a meta pessoal:{' '}
          <span className="font-mono text-primary">{formatarMoeda(necessario)}</span>
        </p>
      )}
      <div className="mt-4">
        <Somatoria m={m} />
      </div>
      <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Tarefas e Oportunidades</h4>
      <div className="mt-2">
        <GrupoTarefas t={t} />
      </div>
      <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Orçamentos e Pedidos</h4>
      <div className="mt-2">
        <GrupoPedidos m={m} marcosCompletos={marcosCompletos} />
      </div>
    </div>
  )
}

export function ProdutividadePainel() {
  const { profile } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const ehGestor = profile?.setor === 'gestor'

  const [periodo, setPeriodo] = useState(() => {
    const hoje = new Date()
    return { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 }
  })
  const { ano, mes } = periodo

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pedidos, setPedidos] = useState<PedidoProdutividade[]>([])
  const [marcos, setMarcos] = useState<Map<string, MarcosPedido>>(new Map())
  // false = fn_pedidos_marcos ainda não existe (migração 0033 pendente) e os
  // marcos vieram só de fn_pedidos_efetuados — sem cotado/aprovado/entregue.
  const [marcosCompletos, setMarcosCompletos] = useState(true)
  const [valorPorPedido, setValorPorPedido] = useState<Map<string, number>>(new Map())
  const [tarefasPeriodo, setTarefasPeriodo] = useState<TarefaProdutividade[]>([])
  const [tarefasDeOportunidade, setTarefasDeOportunidade] = useState<TarefaProdutividade[]>([])
  const [oportunidadesEmpresa, setOportunidadesEmpresa] = useState<OportunidadeProdutividade[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [metas, setMetas] = useState<MetaLinha[]>([])
  const [versaoMetas, setVersaoMetas] = useState(0)
  const [erroMetas, setErroMetas] = useState<string | null>(null)
  const [editandoMetas, setEditandoMetas] = useState(false)

  function mudarMes(delta: number) {
    setPeriodo(({ ano: a, mes: m }) => {
      const d = new Date(a, m - 1 + delta, 1)
      return { ano: d.getFullYear(), mes: d.getMonth() + 1 }
    })
  }

  // Vendas do mês: pedidos criados no mês + pedidos que atingiram algum marco
  // no mês (podem ter sido criados antes), valores dos itens e marcos.
  useEffect(() => {
    if (!empresaAtiva) return
    const empresaId = empresaAtiva.id
    let ativo = true

    async function carregar() {
      setCarregando(true)
      setErro(null)
      try {
        const { inicio, fim } = limitesDoMes(ano, mes)
        const colunas = 'id, criado_por, criado_em, status'

        const [criadosNoMes, { mapa: mapaMarcos, completos }] = await Promise.all([
          paginar<PedidoProdutividade>((de, ate) =>
            supabase
              .from('pedidos')
              .select(colunas)
              .eq('empresa_id', empresaId)
              .gte('criado_em', inicio.toISOString())
              .lt('criado_em', fim.toISOString())
              .order('id')
              .range(de, ate),
          ),
          buscarMarcos(supabase, empresaId),
        ])

        // Pedidos criados em outro mês que atingiram algum marco neste — busca à parte.
        const idsCriados = new Set(criadosNoMes.map((p) => p.id))
        const idsFaltantes = Array.from(mapaMarcos.entries())
          .filter(([id, m]) => !idsCriados.has(id) && temMarcoNoMes(m, inicio, fim))
          .map(([id]) => id)
        const extras: PedidoProdutividade[] = []
        for (const lote of emLotes(idsFaltantes)) {
          const { data, error } = await supabase.from('pedidos').select(colunas).in('id', lote)
          if (error) throw error
          extras.push(...((data ?? []) as PedidoProdutividade[]))
        }
        const todos = [...criadosNoMes, ...extras]

        const valores = new Map<string, number>()
        for (const lote of emLotes(todos.map((p) => p.id))) {
          const itens = await paginar<{ pedido_id: string; preco_venda: number | null; quantidade: number }>(
            (de, ate) =>
              supabase
                .from('pedido_itens')
                .select('pedido_id, preco_venda, quantidade')
                .in('pedido_id', lote)
                .eq('excluido', false)
                .order('id')
                .range(de, ate),
          )
          // preco_venda é unitário — multiplica pela quantidade (sem frete).
          for (const item of itens) {
            valores.set(
              item.pedido_id,
              (valores.get(item.pedido_id) ?? 0) + Number(item.preco_venda ?? 0) * Number(item.quantidade),
            )
          }
        }

        if (!ativo) return
        setPedidos(todos)
        setMarcos(mapaMarcos)
        setMarcosCompletos(completos)
        setValorPorPedido(valores)
      } catch (err) {
        console.error('Erro ao carregar produtividade:', err)
        if (ativo) {
          setErro(
            faltaMigracao(err)
              ? MENSAGEM_FALTA_MIGRACAO
              : 'Não foi possível carregar os dados de produtividade. Tente novamente.',
          )
        }
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [supabase, empresaAtiva, ano, mes])

  // Perfis carregados à parte: os nomes aparecem mesmo se a carga de vendas
  // falhar (ex: migração 0032 ainda não rodada).
  useEffect(() => {
    let ativo = true
    supabase
      .from('profiles')
      .select('id, nome, setor, ativo')
      .then(({ data, error }) => {
        if (error) console.error('Erro ao carregar perfis:', error)
        if (ativo) setProfiles((data ?? []) as Profile[])
      })
    return () => {
      ativo = false
    }
  }, [supabase])

  // Grupo "Tarefas e Oportunidades": carga separada das vendas, pra não
  // depender das migrações. Três conjuntos da empresa ativa:
  //   - tarefas do período: data prevista no mês OU criadas no mês
  //     (data_prevista é `date` — compara como texto 'YYYY-MM-DD');
  //   - todas as tarefas de oportunidade, sem recorte (base da atribuição
  //     de responsável, mesma consulta do "Oport. em Andamento");
  //   - todas as oportunidades (a atividade no mês é decidida em JS).
  const [erroOportunidades, setErroOportunidades] = useState<string | null>(null)
  useEffect(() => {
    if (!empresaAtiva) return
    const empresaId = empresaAtiva.id
    let ativo = true

    async function carregar() {
      setErroOportunidades(null)
      try {
        const { inicio, fim } = limitesDoMes(ano, mes)
        const colunasTarefa = 'id, oportunidade_id, responsavel, situacao, data_prevista, criado_em, descricao, cliente_nome'
        const [periodoMes, deOportunidade, oportunidadesLista] = await Promise.all([
          paginar<TarefaProdutividade>((de, ate) =>
            supabase
              .from('tarefas')
              .select(colunasTarefa)
              .eq('empresa_id', empresaId)
              .eq('excluida', false)
              .or(
                `and(data_prevista.gte.${dataISO(inicio)},data_prevista.lt.${dataISO(fim)}),` +
                  `and(criado_em.gte.${inicio.toISOString()},criado_em.lt.${fim.toISOString()})`,
              )
              .order('id')
              .range(de, ate),
          ),
          paginar<TarefaProdutividade>((de, ate) =>
            supabase
              .from('tarefas')
              .select(colunasTarefa)
              .eq('empresa_id', empresaId)
              .eq('excluida', false)
              .not('oportunidade_id', 'is', null)
              .order('id')
              .range(de, ate),
          ),
          paginar<OportunidadeProdutividade>((de, ate) =>
            supabase
              .from('oportunidades')
              .select('id, criado_por, criado_em, status, ultima_movimentacao, cliente_nome')
              .eq('empresa_id', empresaId)
              .order('id')
              .range(de, ate),
          ),
        ])
        if (!ativo) return
        setTarefasPeriodo(periodoMes)
        setTarefasDeOportunidade(deOportunidade)
        setOportunidadesEmpresa(oportunidadesLista)
      } catch (err) {
        console.error('Erro ao carregar oportunidades da produtividade:', err)
        if (ativo) setErroOportunidades('Não foi possível carregar as tarefas e oportunidades do mês.')
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [supabase, empresaAtiva, ano, mes])

  useEffect(() => {
    if (!empresaAtiva) return
    let ativo = true
    setErroMetas(null)
    supabase
      .from('metas_comerciais')
      .select('id, funcionario_id, valor_meta, dias_uteis_ajuste')
      .eq('empresa_id', empresaAtiva.id)
      .eq('ano', ano)
      .eq('mes', mes)
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) {
          console.error('Erro ao carregar metas:', error)
          // Falta de migração já aparece no banner principal — não duplica.
          setErroMetas(faltaMigracao(error) ? null : 'Não foi possível carregar as metas do mês.')
          setMetas([])
          return
        }
        setMetas(
          (data ?? []).map((m) => ({
            id: m.id,
            funcionario_id: m.funcionario_id,
            valor_meta: Number(m.valor_meta),
            dias_uteis_ajuste: m.dias_uteis_ajuste,
          })),
        )
      })
    return () => {
      ativo = false
    }
  }, [supabase, empresaAtiva, ano, mes, versaoMetas])

  const { porFuncionario, equipe } = useMemo(() => {
    const { inicio, fim } = limitesDoMes(ano, mes)
    return agregarProdutividade({ pedidos, marcos, valorPorPedido, inicio, fim })
  }, [pedidos, marcos, valorPorPedido, ano, mes])

  const tarefas = useMemo(() => {
    const { inicio, fim } = limitesDoMes(ano, mes)
    return agregarTarefasOportunidades({
      tarefasPeriodo,
      tarefasDeOportunidade,
      oportunidades: oportunidadesEmpresa,
      inicio,
      fim,
    })
  }, [tarefasPeriodo, tarefasDeOportunidade, oportunidadesEmpresa, ano, mes])

  const metaGlobalLinha = metas.find((m) => m.funcionario_id === null) ?? null
  const metaGlobal = metaGlobalLinha?.valor_meta ?? 0
  const metaPessoalPorId = useMemo(
    () => new Map(metas.filter((m) => m.funcionario_id).map((m) => [m.funcionario_id as string, m.valor_meta])),
    [metas],
  )
  const dias = calcularDiasUteisMes(ano, mes, metaGlobalLinha?.dias_uteis_ajuste ?? null)

  // Vendedoras: só perfis do setor comercial e ativos — nunca gestor, compras
  // ou desativados, mesmo que tenham criado pedido/tarefa no mês (esses
  // continuam somando no total da equipe/resultado da empresa, só não ganham
  // card, meta pessoal nem barra no comparativo). Nada fixo no código.
  const vendedoras = useMemo(
    () =>
      profiles
        .filter((p) => p.setor === 'comercial' && p.ativo)
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          m: porFuncionario.get(p.id) ?? novasMetricas(),
          t: tarefas.porFuncionario.get(p.id) ?? novasMetricasTarefas(),
        }))
        .sort((a, b) => b.m.faturadoValor - a.m.faturadoValor || a.nome.localeCompare(b.nome)),
    [profiles, porFuncionario, tarefas],
  )

  const visiveis = ehGestor ? vendedoras : vendedoras.filter((v) => v.id === profile?.id)
  const minhaLinha =
    !ehGestor && profile && visiveis.length === 0
      ? [{ id: profile.id, nome: profile.nome, m: novasMetricas(), t: novasMetricasTarefas() }]
      : []

  const comparativo: BarraDado[] = vendedoras.map((v) => ({
    chave: v.id,
    rotulo: v.nome,
    valor: v.m.faturadoValor,
    rotuloValor: formatarMoeda(v.m.faturadoValor),
  }))

  const mediaEquipe = mediaDiaria(equipe.faturadoValor, dias)
  const necessarioEquipe = necessarioPorDia(equipe.faturadoValor, metaGlobal, dias)

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-wide text-primary">Produtividade</h1>
          <p className="mt-1 text-sm text-muted">
            Calculado automaticamente a partir dos pedidos de {empresaAtiva?.nome_fantasia ?? '—'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => mudarMes(-1)}
            className="rounded-md border border-white/10 bg-surface px-3 py-1.5 text-sm text-primary hover:bg-surface-alt"
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <span className="min-w-[10rem] text-center font-heading text-lg font-semibold text-primary">
            {MESES[mes - 1]}/{ano}
          </span>
          <button
            type="button"
            onClick={() => mudarMes(1)}
            className="rounded-md border border-white/10 bg-surface px-3 py-1.5 text-sm text-primary hover:bg-surface-alt"
            aria-label="Próximo mês"
          >
            ›
          </button>
          {ehGestor && (
            <button
              type="button"
              onClick={() => setEditandoMetas((v) => !v)}
              className="ml-2 rounded-md bg-accent-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-primary-dark"
            >
              {editandoMetas ? 'Fechar metas' : 'Editar metas'}
            </button>
          )}
        </div>
      </div>

      {erro && (
        <p className="mt-4 rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erro}
        </p>
      )}
      {erroOportunidades && (
        <p className="mt-4 rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erroOportunidades}
        </p>
      )}
      {erroMetas && (
        <p className="mt-4 rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erroMetas}
        </p>
      )}

      {ehGestor && editandoMetas && empresaAtiva && profile && (
        <div className="mt-6">
          <MetasEditor
            empresaId={empresaAtiva.id}
            ano={ano}
            mes={mes}
            rotuloMes={`${MESES[mes - 1]}/${ano}`}
            usuarioId={profile.id}
            vendedoras={vendedoras.map((v) => ({ id: v.id, nome: v.nome }))}
            metas={metas}
            diasUteisCalendario={calcularDiasUteisMes(ano, mes, null).total}
            onSalvo={() => setVersaoMetas((v) => v + 1)}
          />
        </div>
      )}

      {carregando && <p className="mt-4 text-sm text-muted">Carregando dados do mês…</p>}

      <section className="mt-6 rounded-lg border border-white/10 bg-surface p-5">
        <h2 className="font-heading text-lg font-semibold tracking-wide text-primary">Resultado da empresa no mês</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted">Meta da empresa</p>
            <p className="font-mono text-xl font-semibold text-primary">
              {metaGlobal > 0 ? formatarMoeda(metaGlobal) : '—'}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden className="h-2 w-2 rounded-full bg-accent-success" />
              Faturado (equipe)
            </p>
            <p className="font-mono text-xl font-semibold text-primary">{formatarMoeda(equipe.faturadoValor)}</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden className="h-2 w-2 rounded-full bg-accent-alert/70" />
              Não faturado
            </p>
            <p className="font-mono text-xl font-semibold text-primary">{formatarMoeda(equipe.naoFaturadoValor)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">% da meta global batida</p>
            <p className="font-mono text-xl font-semibold text-primary">
              {formatarPct(pct(equipe.faturadoValor, metaGlobal))}
            </p>
          </div>
        </div>
        <BarraProgresso faturado={equipe.faturadoValor} naoFaturado={equipe.naoFaturadoValor} meta={metaGlobal} />
      </section>

      {ehGestor && (
        <>
          <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Indicador rotulo="Faturamento da equipe" valor={formatarMoeda(equipe.faturadoValor)} />
            <Indicador rotulo="% da meta da empresa" valor={formatarPct(pct(equipe.faturadoValor, metaGlobal))} />
            <Indicador
              rotulo="Taxa de conversão"
              valor={formatarPct(taxaConversao(equipe))}
              detalhe={`${equipe.propostasConvertidas} de ${equipe.propostas} propostas do mês já efetuadas`}
            />
            <Indicador
              rotulo="Dias úteis"
              valor={`${dias.decorridos} / ${dias.total}`}
              detalhe={dias.ajustado ? 'Decorridos / total (ajustado pelo gestor)' : 'Decorridos / total (seg–sex, sem feriados nacionais)'}
            />
            <Indicador
              rotulo="Média diária"
              valor={mediaEquipe === null ? '—' : formatarMoeda(mediaEquipe)}
              detalhe={
                necessarioEquipe === null
                  ? 'Sobre os dias úteis já decorridos'
                  : `Necessário por dia útil restante: ${formatarMoeda(necessarioEquipe)}`
              }
            />
          </section>

          <section className="mt-6 rounded-lg border border-white/10 bg-surface p-5">
            <h2 className="font-heading text-lg font-semibold tracking-wide text-primary">Somatória da equipe</h2>
            <div className="mt-3">
              <Somatoria m={equipe} />
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-white/10 bg-surface p-5">
            <h2 className="font-heading text-lg font-semibold tracking-wide text-primary">
              Tarefas e Oportunidades da equipe
            </h2>
            <p className="mt-1 text-xs text-muted">Inclui tarefas e oportunidades sem responsável.</p>
            <div className="mt-3">
              <GrupoTarefas t={tarefas.equipe} />
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-white/10 bg-surface p-5">
            <h2 className="font-heading text-lg font-semibold tracking-wide text-primary">
              Orçamentos e Pedidos da equipe
            </h2>
            {!marcosCompletos && (
              <p className="mt-1 text-xs text-muted">
                Cotados, Aprovados e Entregues aparecem depois que a migração 0033 for rodada no Supabase.
              </p>
            )}
            <div className="mt-3">
              <GrupoPedidos m={equipe} marcosCompletos={marcosCompletos} />
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-white/10 bg-surface p-5">
            <h2 className="font-heading text-lg font-semibold tracking-wide text-primary">
              Comparativo de faturamento
            </h2>
            <div className="mt-4">
              <GraficoBarras
                dados={comparativo}
                corPadrao="var(--accent-primary)"
                vazioTexto="Nenhuma vendedora com movimento neste mês."
              />
            </div>
          </section>
        </>
      )}

      <section className="mt-6">
        <h2 className="font-heading text-lg font-semibold tracking-wide text-primary">
          {ehGestor ? 'Por vendedora' : 'Meu resultado'}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[...visiveis, ...minhaLinha].map((v) => (
            <CardVendedora
              key={v.id}
              nome={v.nome}
              m={v.m}
              metaPessoal={metaPessoalPorId.get(v.id) ?? 0}
              metaGlobal={metaGlobal}
              dias={dias}
              t={v.t}
              marcosCompletos={marcosCompletos}
            />
          ))}
        </div>
      </section>

      <p className="mt-8 text-xs text-muted">
        Faturado = pedidos que passaram por Pedido Efetuado no mês (mesmo que depois arquivados). Propostas, não
        faturados, pendentes e cancelados = pedidos criados no mês, pelo status atual. Valores sem frete; atribuídos a
        quem criou o pedido. Cotados/Aprovados/Efetuados/Entregues = pedidos que chegaram a essa etapa (ou a uma
        posterior) no mês. Tarefas = pelo responsável, no mês da data prevista (sem data, no de criação); Concluídas =
        só Realizada. Oportunidades = atribuídas pela tarefa mais recente (ou pelo criador), com atividade no mês.
      </p>
    </main>
  )
}
