'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { AppHeader } from '@/components/layout/AppHeader'
import { ErrosRecentesSection } from '@/components/painel/ErrosRecentesSection'
import { FiltroPeriodo } from '@/components/painel/FiltroPeriodo'
import { GraficoBarras, type BarraDado } from '@/components/painel/GraficoBarras'
import { KANBAN_COLUMNS, STATUS_LABELS, STATUS_STRIPE_VAR } from '@/lib/kanban/status'
import { estaParado } from '@/lib/kanban/dias-parado'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import { proximoDia } from '@/lib/kanban/filtro-data'
import { calcularRangePeriodo, type PeriodoPreset, type RangePeriodo } from '@/lib/kanban/periodo'
import {
  OPORTUNIDADE_FUNIL_ORDEM,
  OPORTUNIDADE_STATUS_LABELS,
  OPORTUNIDADE_STATUS_STRIPE_VAR,
} from '@/lib/oportunidades/status'
import type { OportunidadeStatus, PedidoStatus } from '@/types/database'

interface EventoAudit {
  data_hora: string
  antes: string | null
  depois: string | null
}

const TODOS_STATUS_OPORTUNIDADE = Object.keys(
  OPORTUNIDADE_STATUS_LABELS,
) as OportunidadeStatus[]

// < 48h mostra em horas (granularidade que importa pra velocidade de resposta
// do SDR); acima disso, dias (mais legível que "72.0h").
function formatarTempoMedioContato(horas: number): string {
  if (horas < 48) return `${horas.toFixed(1)}h`
  return `${(horas / 24).toFixed(1)} dias`
}

export default function PainelPage() {
  const { profile, loading: authLoading } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const [preset, setPreset] = useState<PeriodoPreset>('mes_atual')
  const [personalizadoDe, setPersonalizadoDe] = useState('')
  const [personalizadoAte, setPersonalizadoAte] = useState('')
  const [range, setRange] = useState<RangePeriodo>(() =>
    calcularRangePeriodo('mes_atual', { inicio: null, fim: null }),
  )

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [contagemPorEtapa, setContagemPorEtapa] = useState<Partial<Record<PedidoStatus, number>>>(
    {},
  )
  const [valorNegociacao, setValorNegociacao] = useState(0)
  const [paradosCount, setParadosCount] = useState(0)
  const [taxaConversao, setTaxaConversao] = useState<number | null>(null)
  const [tempoMedioPorEtapa, setTempoMedioPorEtapa] = useState<BarraDado[]>([])
  const [motivosPerda, setMotivosPerda] = useState<BarraDado[]>([])

  // Fase 32.2 — seção "Oportunidades" do painel.
  const [oportCarregando, setOportCarregando] = useState(true)
  const [oportErro, setOportErro] = useState<string | null>(null)
  const [oportContagemPorEtapa, setOportContagemPorEtapa] = useState<
    Partial<Record<OportunidadeStatus, number>>
  >({})
  const [oportConversaoEtapas, setOportConversaoEtapas] = useState<BarraDado[]>([])
  const [oportTempoMedioContato, setOportTempoMedioContato] = useState<number | null>(null)
  const [oportConversaoPorOrigem, setOportConversaoPorOrigem] = useState<BarraDado[]>([])

  const ehGestor = profile?.setor === 'gestor'

  // Só gestor acessa o painel — qualquer outro perfil volta pro kanban.
  useEffect(() => {
    if (!authLoading && profile && !ehGestor) {
      router.replace('/dashboard')
    }
  }, [authLoading, profile, ehGestor, router])

  function selecionarPreset(novo: PeriodoPreset) {
    setPreset(novo)
    if (novo !== 'personalizado') {
      setRange(calcularRangePeriodo(novo, { inicio: null, fim: null }))
    }
  }

  function aplicarPersonalizado() {
    setRange({ inicio: personalizadoDe || null, fim: personalizadoAte || null })
  }

  useEffect(() => {
    if (!ehGestor || !empresaAtiva) return
    let ativo = true

    async function carregar() {
      setCarregando(true)
      setErro(null)

      try {
        const { inicio, fim } = range
        let queryPedidos = supabase
          .from('pedidos')
          .select('id, status, ultima_movimentacao, criado_em, motivo_perda')
          .eq('empresa_id', empresaAtiva!.id)

        if (inicio) queryPedidos = queryPedidos.gte('criado_em', `${inicio}T00:00:00`)
        if (fim) queryPedidos = queryPedidos.lt('criado_em', `${proximoDia(fim)}T00:00:00`)

        const { data: pedidos, error: erroPedidos } = await queryPedidos
        if (erroPedidos) throw erroPedidos
        const listaPedidos = pedidos ?? []

        // Pedidos ativos por etapa (as 5 colunas do kanban).
        const contagem: Partial<Record<PedidoStatus, number>> = {}
        for (const status of KANBAN_COLUMNS) contagem[status] = 0
        for (const p of listaPedidos) {
          if (contagem[p.status] !== undefined) {
            contagem[p.status] = (contagem[p.status] ?? 0) + 1
          }
        }

        // Parados 3+ dias, só entre os que ainda estão no kanban ativo.
        const parados = listaPedidos.filter(
          (p) =>
            (KANBAN_COLUMNS as string[]).includes(p.status) && estaParado(p.ultima_movimentacao),
        ).length

        // Taxa de conversão: EFETUADOS ÷ (EFETUADOS + PERDIDOS) no período.
        const efetuados = listaPedidos.filter((p) => p.status === 'PEDIDO_EFETUADO').length
        const perdidos = listaPedidos.filter((p) => p.status === 'PERDIDO').length
        const denominador = efetuados + perdidos
        const taxa = denominador > 0 ? (efetuados / denominador) * 100 : null

        // Motivos de perda: agrupa pela parte antes do "—" em motivo_perda.
        const mapaMotivos = new Map<string, number>()
        for (const p of listaPedidos) {
          if (p.status !== 'PERDIDO') continue
          const bruto = p.motivo_perda ?? ''
          const motivo = bruto.split('—')[0]?.trim() || 'Outro'
          mapaMotivos.set(motivo, (mapaMotivos.get(motivo) ?? 0) + 1)
        }
        const listaMotivos: BarraDado[] = Array.from(mapaMotivos.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([motivo, quantidade]) => ({
            chave: motivo,
            rotulo: motivo,
            valor: quantidade,
            rotuloValor: `${quantidade}`,
          }))

        // Valor total em negociação: soma de preco_venda dos itens dos pedidos
        // ainda ativos (fora ARQUIVADO e PERDIDO).
        const idsAtivos = listaPedidos
          .filter((p) => p.status !== 'ARQUIVADO' && p.status !== 'PERDIDO')
          .map((p) => p.id)

        let valorNegociacaoCalc = 0
        if (idsAtivos.length > 0) {
          const { data: itens, error: erroItens } = await supabase
            .from('pedido_itens')
            .select('pedido_id, preco_venda, quantidade')
            .in('pedido_id', idsAtivos)
          if (erroItens) throw erroItens
          // preco_venda é o preço UNITÁRIO do item — precisa multiplicar pela
          // quantidade para chegar no valor da linha.
          valorNegociacaoCalc = (itens ?? []).reduce(
            (soma, item) => soma + Number(item.preco_venda ?? 0) * Number(item.quantidade),
            0,
          )
        }

        // Tempo médio por etapa: reconstrói, a partir do audit_log, quanto
        // tempo cada pedido ficou em cada status antes de sair dele. Updates
        // que não mudam o status (ex: salvar previsão de chegada) são
        // ignorados — só fecha o intervalo quando o status realmente muda.
        const idsTodos = listaPedidos.map((p) => p.id)
        const acumulador: Partial<Record<string, { totalMs: number; amostras: number }>> = {}

        if (idsTodos.length > 0) {
          const { data: logs, error: erroLogs } = await supabase
            .from('audit_log')
            .select('registro_id, data_hora, dados_antes, dados_depois')
            .eq('tabela', 'pedidos')
            .in('registro_id', idsTodos)
            .order('data_hora', { ascending: true })
          if (erroLogs) throw erroLogs

          const eventosPorPedido = new Map<string, EventoAudit[]>()
          for (const log of logs ?? []) {
            const antes = (log.dados_antes as Record<string, unknown> | null)?.status
            const depois = (log.dados_depois as Record<string, unknown> | null)?.status
            const lista = eventosPorPedido.get(log.registro_id) ?? []
            lista.push({
              data_hora: log.data_hora,
              antes: typeof antes === 'string' ? antes : null,
              depois: typeof depois === 'string' ? depois : null,
            })
            eventosPorPedido.set(log.registro_id, lista)
          }

          for (const eventos of Array.from(eventosPorPedido.values())) {
            let statusAtual: string | null = null
            let inicioStatus: string | null = null

            for (const evento of eventos) {
              if (statusAtual === null) {
                statusAtual = evento.depois
                inicioStatus = evento.data_hora
                continue
              }
              if (evento.depois === statusAtual) continue

              const duracaoMs =
                new Date(evento.data_hora).getTime() - new Date(inicioStatus as string).getTime()
              if (duracaoMs >= 0) {
                const bucket = acumulador[statusAtual] ?? { totalMs: 0, amostras: 0 }
                bucket.totalMs += duracaoMs
                bucket.amostras += 1
                acumulador[statusAtual] = bucket
              }
              statusAtual = evento.depois
              inicioStatus = evento.data_hora
            }
          }
        }

        const listaTempoMedio: BarraDado[] = KANBAN_COLUMNS.filter(
          (status) => (acumulador[status]?.amostras ?? 0) > 0,
        ).map((status) => {
          const bucket = acumulador[status] as { totalMs: number; amostras: number }
          const mediaDias = bucket.totalMs / bucket.amostras / (1000 * 60 * 60 * 24)
          return {
            chave: status,
            rotulo: STATUS_LABELS[status],
            valor: mediaDias,
            rotuloValor: `${mediaDias.toFixed(1)} dias`,
            corVar: STATUS_STRIPE_VAR[status],
          }
        })

        if (!ativo) return
        setContagemPorEtapa(contagem)
        setParadosCount(parados)
        setTaxaConversao(taxa)
        setMotivosPerda(listaMotivos)
        setValorNegociacao(valorNegociacaoCalc)
        setTempoMedioPorEtapa(listaTempoMedio)
      } catch (err) {
        console.error('Erro ao carregar painel:', err)
        if (ativo) setErro('Não foi possível carregar os dados do painel. Tente novamente.')
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [ehGestor, range, supabase, empresaAtiva])

  // Fase 32.2 — dados da seção "Oportunidades" do painel, mesmo filtro de
  // período da seção de pedidos acima.
  useEffect(() => {
    if (!ehGestor || !empresaAtiva) return
    let ativo = true

    async function carregar() {
      setOportCarregando(true)
      setOportErro(null)

      try {
        const { inicio, fim } = range
        let queryOport = supabase
          .from('oportunidades')
          .select('id, status, origem, criado_em')
          .eq('empresa_id', empresaAtiva!.id)

        if (inicio) queryOport = queryOport.gte('criado_em', `${inicio}T00:00:00`)
        if (fim) queryOport = queryOport.lt('criado_em', `${proximoDia(fim)}T00:00:00`)

        const { data: oportunidades, error: erroOport } = await queryOport
        if (erroOport) throw erroOport
        const lista = oportunidades ?? []

        // Contagem por etapa — funil completo, inclusive terminais (GANHO/PERDIDO).
        const contagem: Partial<Record<OportunidadeStatus, number>> = {}
        for (const status of TODOS_STATUS_OPORTUNIDADE) contagem[status] = 0
        for (const o of lista) {
          contagem[o.status] = (contagem[o.status] ?? 0) + 1
        }

        const ids = lista.map((o) => o.id)

        // Taxa de conversão entre etapas consecutivas: reconstrói, a partir do
        // audit_log, o conjunto de status que cada oportunidade já teve (o
        // INSERT já grava o status inicial NOVO_LEAD) — para cada etapa do
        // funil, mede quantas das que já passaram por ela também chegaram na
        // seguinte.
        const conversaoEtapas: BarraDado[] = []
        if (ids.length > 0) {
          const { data: logs, error: erroLogs } = await supabase
            .from('audit_log')
            .select('registro_id, dados_depois')
            .eq('tabela', 'oportunidades')
            .in('registro_id', ids)
          if (erroLogs) throw erroLogs

          const statusPorOportunidade = new Map<string, Set<string>>()
          for (const log of logs ?? []) {
            const statusDepois = (log.dados_depois as Record<string, unknown> | null)?.status
            if (typeof statusDepois !== 'string') continue
            const conjunto = statusPorOportunidade.get(log.registro_id) ?? new Set<string>()
            conjunto.add(statusDepois)
            statusPorOportunidade.set(log.registro_id, conjunto)
          }

          const alcancouEtapa = (etapa: OportunidadeStatus) =>
            ids.filter((id) => statusPorOportunidade.get(id)?.has(etapa)).length

          for (let i = 0; i < OPORTUNIDADE_FUNIL_ORDEM.length - 1; i++) {
            const atual = OPORTUNIDADE_FUNIL_ORDEM[i]
            const proxima = OPORTUNIDADE_FUNIL_ORDEM[i + 1]
            const totalAtual = alcancouEtapa(atual)
            if (totalAtual === 0) continue
            const totalProxima = alcancouEtapa(proxima)
            const pct = (totalProxima / totalAtual) * 100
            conversaoEtapas.push({
              chave: `${atual}->${proxima}`,
              rotulo: `${OPORTUNIDADE_STATUS_LABELS[atual]} → ${OPORTUNIDADE_STATUS_LABELS[proxima]}`,
              valor: pct,
              rotuloValor: `${pct.toFixed(1)}%`,
            })
          }
        }

        // Tempo médio até o 1º contato: diferença entre criado_em da
        // oportunidade e criado_em da primeira interação vinculada a ela.
        let tempoMedioHoras: number | null = null
        if (ids.length > 0) {
          const { data: interacoes, error: erroInteracoes } = await supabase
            .from('interacoes')
            .select('oportunidade_id, criado_em')
            .in('oportunidade_id', ids)
            .order('criado_em', { ascending: true })
          if (erroInteracoes) throw erroInteracoes

          const primeiraPorOportunidade = new Map<string, string>()
          for (const interacao of interacoes ?? []) {
            if (!interacao.oportunidade_id) continue
            if (!primeiraPorOportunidade.has(interacao.oportunidade_id)) {
              primeiraPorOportunidade.set(interacao.oportunidade_id, interacao.criado_em)
            }
          }

          const diffsMs: number[] = []
          for (const o of lista) {
            const primeiraData = primeiraPorOportunidade.get(o.id)
            if (!primeiraData) continue
            const diffMs = new Date(primeiraData).getTime() - new Date(o.criado_em).getTime()
            if (diffMs >= 0) diffsMs.push(diffMs)
          }
          if (diffsMs.length > 0) {
            const mediaMs = diffsMs.reduce((soma, v) => soma + v, 0) / diffsMs.length
            tempoMedioHoras = mediaMs / (1000 * 60 * 60)
          }
        }

        // Conversão por origem: % de oportunidades daquela origem que
        // chegaram a GANHO.
        const mapaOrigem = new Map<string, { total: number; ganhas: number }>()
        for (const o of lista) {
          const chave = o.origem?.trim() || 'Sem origem'
          const bucket = mapaOrigem.get(chave) ?? { total: 0, ganhas: 0 }
          bucket.total += 1
          if (o.status === 'GANHO') bucket.ganhas += 1
          mapaOrigem.set(chave, bucket)
        }
        const conversaoPorOrigem: BarraDado[] = Array.from(mapaOrigem.entries())
          .map(([origemNome, bucket]) => {
            const pct = bucket.total > 0 ? (bucket.ganhas / bucket.total) * 100 : 0
            return {
              chave: origemNome,
              rotulo: origemNome,
              valor: pct,
              rotuloValor: `${pct.toFixed(1)}% (${bucket.ganhas}/${bucket.total})`,
            }
          })
          .sort((a, b) => b.valor - a.valor)

        if (!ativo) return
        setOportContagemPorEtapa(contagem)
        setOportConversaoEtapas(conversaoEtapas)
        setOportTempoMedioContato(tempoMedioHoras)
        setOportConversaoPorOrigem(conversaoPorOrigem)
      } catch (err) {
        console.error('Erro ao carregar oportunidades do painel:', err)
        if (ativo) {
          setOportErro('Não foi possível carregar os dados de oportunidades. Tente novamente.')
        }
      } finally {
        if (ativo) setOportCarregando(false)
      }
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [ehGestor, range, supabase, empresaAtiva])

  if (authLoading || !profile || !ehGestor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base text-muted">
        Carregando…
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <AppHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <h1 className="font-heading text-2xl font-semibold tracking-wide text-primary">
          Painel executivo
        </h1>

        <div className="mt-4">
          <FiltroPeriodo
            preset={preset}
            onPresetChange={selecionarPreset}
            personalizadoDe={personalizadoDe}
            onPersonalizadoDeChange={setPersonalizadoDe}
            personalizadoAte={personalizadoAte}
            onPersonalizadoAteChange={setPersonalizadoAte}
            onAplicarPersonalizado={aplicarPersonalizado}
          />
        </div>

        {erro && <p className="mt-3 text-sm text-accent-danger">{erro}</p>}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Pedidos ativos por etapa
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {KANBAN_COLUMNS.map((status) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-primary/80">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: `var(${STATUS_STRIPE_VAR[status] ?? '--text-primary'})` }}
                    />
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="font-mono font-semibold text-primary">
                    {contagemPorEtapa[status] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Valor total em negociação
            </p>
            <p className="mt-3 font-mono text-2xl font-semibold text-primary">
              {formatarMoeda(valorNegociacao)}
            </p>
          </div>

          <div
            className={`rounded-lg border p-4 ${
              paradosCount > 0
                ? 'border-accent-alert/40 bg-accent-alert/10'
                : 'border-white/10 bg-surface'
            }`}
          >
            <p
              className={`text-xs font-medium uppercase tracking-wide ${
                paradosCount > 0 ? 'text-accent-alert' : 'text-muted'
              }`}
            >
              Parados 3+ dias
            </p>
            <p
              className={`mt-3 font-mono text-2xl font-semibold ${
                paradosCount > 0 ? 'text-accent-alert' : 'text-primary'
              }`}
            >
              {paradosCount}
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Taxa de conversão
            </p>
            <p className="mt-3 font-mono text-2xl font-semibold text-primary">
              {taxaConversao === null ? '—' : `${taxaConversao.toFixed(1)}%`}
            </p>
            <p className="mt-1 text-xs text-muted">Efetuados ÷ (Efetuados + Perdidos)</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-sm font-medium text-primary">Tempo médio por etapa</p>
            <p className="mt-1 text-xs text-muted">
              Média de dias que os pedidos ficam em cada etapa antes de mudar de status.
            </p>
            <div className="mt-4">
              <GraficoBarras
                dados={tempoMedioPorEtapa}
                corPadrao="var(--accent-compras)"
                vazioTexto="Ainda não há movimentações suficientes no período para calcular."
              />
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-sm font-medium text-primary">Motivos de perda</p>
            <p className="mt-1 text-xs text-muted">
              Pedidos marcados como perdidos no período, agrupados por motivo.
            </p>
            <div className="mt-4">
              <GraficoBarras
                dados={motivosPerda}
                corPadrao="var(--accent-danger)"
                vazioTexto="Nenhum pedido perdido no período."
              />
            </div>
          </div>
        </div>

        {carregando && <p className="mt-4 text-sm text-muted">Atualizando dados…</p>}

        <h2 className="mt-10 font-heading text-xl font-semibold tracking-wide text-primary">
          Oportunidades
        </h2>

        {oportErro && <p className="mt-3 text-sm text-accent-danger">{oportErro}</p>}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Oportunidades por etapa
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {TODOS_STATUS_OPORTUNIDADE.map((status) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-primary/80">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: `var(${OPORTUNIDADE_STATUS_STRIPE_VAR[status]})`,
                      }}
                    />
                    {OPORTUNIDADE_STATUS_LABELS[status]}
                  </span>
                  <span className="font-mono font-semibold text-primary">
                    {oportContagemPorEtapa[status] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Tempo médio até o 1º contato
            </p>
            <p className="mt-3 font-mono text-2xl font-semibold text-primary">
              {oportTempoMedioContato === null
                ? '—'
                : formatarTempoMedioContato(oportTempoMedioContato)}
            </p>
            <p className="mt-1 text-xs text-muted">
              Da criação do lead até o primeiro registro em Histórico de contato.
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Conversão por origem
            </p>
            <div className="mt-4">
              <GraficoBarras
                dados={oportConversaoPorOrigem}
                corPadrao="var(--accent-success)"
                vazioTexto="Nenhuma oportunidade com origem preenchida no período."
              />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6">
          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-sm font-medium text-primary">Conversão entre etapas</p>
            <p className="mt-1 text-xs text-muted">
              Das oportunidades que já passaram por uma etapa, quantas também chegaram na
              seguinte (histórico completo do período, via auditoria).
            </p>
            <div className="mt-4">
              <GraficoBarras
                dados={oportConversaoEtapas}
                corPadrao="var(--accent-compras)"
                vazioTexto="Ainda não há oportunidades suficientes no período para calcular."
              />
            </div>
          </div>
        </div>

        {oportCarregando && <p className="mt-4 text-sm text-muted">Atualizando dados…</p>}

        <ErrosRecentesSection />
      </main>
    </div>
  )
}
