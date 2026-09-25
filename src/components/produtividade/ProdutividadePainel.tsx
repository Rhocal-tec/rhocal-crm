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
import { formatarMoeda } from '@/lib/kanban/formatacao'
import {
  agregarProdutividade,
  cancelados,
  limitesDoMes,
  novasMetricas,
  taxaConversao,
  type MetricasProdutividade,
  type PedidoProdutividade,
} from '@/lib/produtividade/calculo'
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

function CardVendedora({
  nome,
  m,
  metaPessoal,
  metaGlobal,
  dias,
}: {
  nome: string
  m: MetricasProdutividade
  metaPessoal: number
  metaGlobal: number
  dias: DiasUteisMes
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
  const [efetuadoEm, setEfetuadoEm] = useState<Map<string, string>>(new Map())
  const [valorPorPedido, setValorPorPedido] = useState<Map<string, number>>(new Map())
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

  // Vendas do mês: pedidos criados no mês + pedidos efetuados no mês (que
  // podem ter sido criados antes), valores dos itens e data de efetuação.
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

        const [profilesResp, criadosNoMes, efetuados] = await Promise.all([
          supabase.from('profiles').select('id, nome, setor, ativo'),
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
          paginar<{ pedido_id: string; efetuado_em: string }>((de, ate) =>
            supabase.rpc('fn_pedidos_efetuados', { p_empresa_id: empresaId }).range(de, ate),
          ),
        ])
        if (profilesResp.error) throw profilesResp.error

        const mapaEfetuado = new Map(efetuados.map((e) => [e.pedido_id, e.efetuado_em]))

        // Efetuados no mês cujo pedido foi criado em outro mês — busca à parte.
        const idsCriados = new Set(criadosNoMes.map((p) => p.id))
        const idsFaltantes = efetuados
          .filter((e) => {
            const t = Date.parse(e.efetuado_em)
            return t >= inicio.getTime() && t < fim.getTime() && !idsCriados.has(e.pedido_id)
          })
          .map((e) => e.pedido_id)
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
        setProfiles((profilesResp.data ?? []) as Profile[])
        setPedidos(todos)
        setEfetuadoEm(mapaEfetuado)
        setValorPorPedido(valores)
      } catch (err) {
        console.error('Erro ao carregar produtividade:', err)
        if (ativo) setErro('Não foi possível carregar os dados de produtividade. Tente novamente.')
      } finally {
        if (ativo) setCarregando(false)
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
          setErroMetas('Não foi possível carregar as metas do mês.')
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
    return agregarProdutividade({ pedidos, efetuadoEm, valorPorPedido, inicio, fim })
  }, [pedidos, efetuadoEm, valorPorPedido, ano, mes])

  const metaGlobalLinha = metas.find((m) => m.funcionario_id === null) ?? null
  const metaGlobal = metaGlobalLinha?.valor_meta ?? 0
  const metaPessoalPorId = useMemo(
    () => new Map(metas.filter((m) => m.funcionario_id).map((m) => [m.funcionario_id as string, m.valor_meta])),
    [metas],
  )
  const dias = calcularDiasUteisMes(ano, mes, metaGlobalLinha?.dias_uteis_ajuste ?? null)

  // Vendedoras: comerciais ativos + quem tem meta pessoal no mês + quem teve
  // movimento no mês (ex: gestor que criou pedido) — nada fixo no código.
  const vendedoras = useMemo(() => {
    const nomePorId = new Map(profiles.map((p) => [p.id, p.nome]))
    const ids = new Set<string>([
      ...profiles.filter((p) => p.setor === 'comercial' && p.ativo).map((p) => p.id),
      ...Array.from(metaPessoalPorId.entries())
        .filter(([, valor]) => valor > 0)
        .map(([id]) => id),
      ...Array.from(porFuncionario.keys()),
    ])
    return Array.from(ids)
      .map((id) => ({
        id,
        nome: nomePorId.get(id) ?? 'Perfil removido',
        m: porFuncionario.get(id) ?? novasMetricas(),
      }))
      .sort((a, b) => b.m.faturadoValor - a.m.faturadoValor || a.nome.localeCompare(b.nome))
  }, [profiles, metaPessoalPorId, porFuncionario])

  const visiveis = ehGestor ? vendedoras : vendedoras.filter((v) => v.id === profile?.id)
  const minhaLinha =
    !ehGestor && profile && visiveis.length === 0
      ? [{ id: profile.id, nome: profile.nome, m: novasMetricas() }]
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
            />
          ))}
        </div>
      </section>

      <p className="mt-8 text-xs text-muted">
        Faturado = pedidos que passaram por Pedido Efetuado no mês (mesmo que depois arquivados). Propostas, não
        faturados, pendentes e cancelados = pedidos criados no mês, pelo status atual. Valores sem frete; atribuídos a
        quem criou o pedido.
      </p>
    </main>
  )
}
