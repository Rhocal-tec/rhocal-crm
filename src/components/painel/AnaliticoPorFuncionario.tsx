'use client'

// Seção do Painel Gestor: analítico por funcionário — cruza orçamentos
// (diretos/normais), pedidos efetuados/aprovados/arquivados/perdidos,
// entregas, leads/oportunidades, tarefas, interações e chamadas, tudo
// agrupado por quem criou/registrou/atendeu/entregou cada um. Recebe o
// `range` de período do resto do Painel (src/app/painel/page.tsx) e a
// `empresaId` ativa; um FiltroData próprio da seção pode sobrepor esse
// período só aqui dentro (ver `rangeEfetivo`).
//
// Estratégia de queries (combinada com o usuário antes de implementar):
// busca os registros CRUS de cada tabela, uma vez cada (nunca por
// funcionário), e faz toda a agregação/soma em JS — ligar/desligar uma
// métrica ou abrir um drill-down não dispara nenhuma query nova, só recorta
// os arrays já carregados.
//
// `pedidos` é buscado SEM filtro de período (só por empresa) porque também
// serve pra escopar `interacoes` por empresa (a tabela não tem empresa_id
// própria — fica só amarrada por pedido_id/oportunidade_id). O recorte de
// período de pedidos é aplicado depois em JS, sobre `criado_em` (ou
// `entregue_em`, no caso das entregas).
//
// Apresentação: uma tabela única, uma linha por funcionário e uma coluna por
// métrica ligada nas pills do topo (mesmo padrão das pills de colunas do
// FunilBoard). Cada célula é compacta — número principal + linha pequena
// (valor/duração/abertas) — e a quebra detalhada (situação, resultado,
// status) fica no drill-down, aberto clicando na célula. Isso substitui as 7
// tabelas empilhadas anteriores sem voltar ao scroll horizontal gigante da
// primeira versão (que tinha todas as subcolunas lado a lado).
//
// Client Supabase compartilhado do app (mesma cautela do resto do Painel:
// nunca um createClient avulso de @supabase/supabase-js).

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RangePeriodo } from '@/lib/kanban/periodo'
import { proximoDia, type ModoFiltroData } from '@/lib/kanban/filtro-data'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import { STATUS_LABELS } from '@/lib/kanban/status'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { TAREFA_SITUACAO_OPCOES } from '@/lib/tarefas/opcoes'
import { RESULTADO_INTERACAO_OPCOES } from '@/lib/interacoes/opcoes'
import { situacaoTerminal } from '@/lib/tarefas/situacao'
import { FiltroData } from '@/components/busca/FiltroData'
import type { Database } from '@/types/database'

type PedidoBruto = Pick<
  Database['public']['Tables']['pedidos']['Row'],
  | 'id'
  | 'numero'
  | 'cliente_nome'
  | 'status'
  | 'orcamento_direto'
  | 'criado_por'
  | 'criado_em'
  | 'movido_por'
  | 'entregue_em'
  | 'motivo_perda'
>
type ItemBruto = Pick<Database['public']['Tables']['pedido_itens']['Row'], 'pedido_id' | 'preco_venda' | 'quantidade'>
type OportunidadeBruta = Pick<
  Database['public']['Tables']['oportunidades']['Row'],
  'id' | 'numero' | 'cliente_nome' | 'cliente_telefone' | 'status' | 'criado_por' | 'criado_em'
>
type TarefaBruta = Pick<
  Database['public']['Tables']['tarefas']['Row'],
  'id' | 'descricao' | 'responsavel' | 'situacao' | 'tipo' | 'data_prevista' | 'criado_em' | 'pedido_id' | 'oportunidade_id'
>
type InteracaoBruta = Pick<
  Database['public']['Tables']['interacoes']['Row'],
  'id' | 'oportunidade_id' | 'pedido_id' | 'tipo' | 'resultado' | 'observacao' | 'registrado_por' | 'criado_em'
>
type ChamadaBruta = Pick<
  Database['public']['Tables']['chamadas']['Row'],
  | 'id'
  | 'usuario_id'
  | 'direcao'
  | 'status'
  | 'numero_origem'
  | 'numero_destino'
  | 'duracao_segundos'
  | 'iniciada_em'
  | 'oportunidade_id'
  | 'empresa_id'
>
type Profile = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'nome' | 'ativo'>

const SEM_ATRIBUICAO_ID = 'sem-atribuicao'
const SEM_ATRIBUICAO_NOME = 'Não atribuído'

interface PedidoLinha {
  id: string
  numero: number
  clienteNome: string
  status: string
  orcamentoDireto: boolean
  valor: number
  criadoEm: string
  motivoPerda: string | null
}

interface TarefaLinha {
  id: string
  descricao: string
  tipo: string | null
  situacao: string
  dataPrevista: string | null
  criadoEm: string
  refLabel: string | null
}

interface InteracaoLinha {
  id: string
  tipo: string
  resultado: string
  observacao: string | null
  criadoEm: string
  refLabel: string | null
}

interface ChamadaLinha {
  id: string
  direcao: string
  status: string
  numero: string | null
  clienteNome: string | null
  duracaoSegundos: number | null
  iniciadaEm: string | null
  empresaId: string | null
}

interface OportunidadeLinha {
  id: string
  numero: number
  clienteNome: string
  clienteTelefone: string | null
  status: string
  criadoEm: string
}

interface EntregaLinha {
  id: string
  numero: number
  clienteNome: string
  valor: number
  entregueEm: string | null
}

// Métrica de pedidos (contagem + valor + lista) — mesma forma pra todas as
// fatias de `pedidos` por status/tipo (orçamentos diretos/normais,
// efetuados, aprovados, arquivados, perdidos).
interface PedidoMetrica {
  total: number
  valorTotal: number
  lista: PedidoLinha[]
}

interface AgregadoFuncionario {
  id: string
  nome: string
  ativo: boolean
  orcDiretos: PedidoMetrica
  orcNormais: PedidoMetrica
  efetuados: PedidoMetrica
  aprovados: PedidoMetrica
  arquivados: PedidoMetrica
  perdidos: PedidoMetrica
  entregas: { total: number; valorTotal: number; lista: EntregaLinha[] }
  oportunidades: { total: number; lista: OportunidadeLinha[] }
  tarefas: {
    total: number
    abertas: number
    porSituacao: Record<string, number>
    porTipo: Record<string, number>
    lista: TarefaLinha[]
  }
  interacoes: { total: number; porResultado: Record<string, number>; lista: InteracaoLinha[] }
  chamadas: {
    total: number
    atendidas: number
    naoAtendidas: number
    emAndamento: number
    falhas: number
    duracaoTotalSegundos: number
    lista: ChamadaLinha[]
  }
}

function novaPedidoMetrica(): PedidoMetrica {
  return { total: 0, valorTotal: 0, lista: [] }
}

function novoAgregado(id: string, nome: string, ativo = true): AgregadoFuncionario {
  return {
    id,
    nome,
    ativo,
    orcDiretos: novaPedidoMetrica(),
    orcNormais: novaPedidoMetrica(),
    efetuados: novaPedidoMetrica(),
    aprovados: novaPedidoMetrica(),
    arquivados: novaPedidoMetrica(),
    perdidos: novaPedidoMetrica(),
    entregas: { total: 0, valorTotal: 0, lista: [] },
    oportunidades: { total: 0, lista: [] },
    tarefas: { total: 0, abertas: 0, porSituacao: {}, porTipo: {}, lista: [] },
    interacoes: { total: 0, porResultado: {}, lista: [] },
    chamadas: {
      total: 0,
      atendidas: 0,
      naoAtendidas: 0,
      emAndamento: 0,
      falhas: 0,
      duracaoTotalSegundos: 0,
      lista: [],
    },
  }
}

function acumularPedido(metrica: PedidoMetrica, linha: PedidoLinha) {
  metrica.total += 1
  metrica.valorTotal += linha.valor
  metrica.lista.push(linha)
}

function obterOuCriar(mapa: Map<string, AgregadoFuncionario>, id: string, nomeFallback: string): AgregadoFuncionario {
  let agregado = mapa.get(id)
  if (!agregado) {
    agregado = novoAgregado(id, nomeFallback)
    mapa.set(id, agregado)
  }
  return agregado
}

function dentroDoPeriodo(dataIso: string, inicio: string | null, fim: string | null): boolean {
  const momento = new Date(dataIso).getTime()
  if (inicio && momento < new Date(`${inicio}T00:00:00`).getTime()) return false
  if (fim && momento >= new Date(`${proximoDia(fim)}T00:00:00`).getTime()) return false
  return true
}

function incrementa(mapa: Record<string, number>, chave: string) {
  mapa[chave] = (mapa[chave] ?? 0) + 1
}

function formatarDuracao(segundos: number): string {
  const horas = Math.floor(segundos / 3600)
  const min = Math.floor((segundos % 3600) / 60)
  if (horas > 0) return `${horas}h ${min}m`
  return `${min}m`
}

function formatarData(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

// Mesmo padrão de ChamadasSemEmpresa.tsx/HistoricoChamadas.tsx — chamada
// precisa de hora, não só data, pra ser útil (várias no mesmo dia).
function formatarDataHoraChamada(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function chamadaStatusLabel(status: string): string {
  switch (status) {
    case 'atendida':
      return 'Atendida'
    case 'nao_atendida':
      return 'Não atendida'
    case 'falha':
      return 'Falhou'
    default:
      return 'Em andamento'
  }
}

function statusPedidoLabel(status: string): string {
  return STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status
}

// ===== Métricas (pills + colunas da tabela) =====

type MetricaKey =
  | 'orcDiretos'
  | 'orcNormais'
  | 'efetuados'
  | 'entregues'
  | 'aprovados'
  | 'arquivados'
  | 'perdidos'
  | 'tarefas'
  | 'interacoes'
  | 'chamadas'
  | 'oportunidades'

interface QuebraItem {
  label: string
  valor: string | number
  cor?: string
}

interface MetricaDef {
  key: MetricaKey
  label: string
  // Campo de data sobre o qual o período é aplicado — cada métrica usa o
  // seu (não dá pra unificar), exibido como tooltip no cabeçalho da coluna.
  dataRef: string
  principal: (l: AgregadoFuncionario) => number
  // Linha pequena abaixo do número principal; somável pra linha TOTAL.
  secundario?: { valor: (l: AgregadoFuncionario) => number; formatar: (n: number) => string }
  quebra?: (l: AgregadoFuncionario) => QuebraItem[]
  detalhe: (l: AgregadoFuncionario) => React.ReactNode[]
}

// Quebra por status dentro de uma fatia de pedidos (ex: orçamentos normais
// divididos entre Orçamento/Cotado/Pedido aprovado/…) — só os status que de
// fato aparecem na lista.
function quebraPorStatus(lista: PedidoLinha[]): QuebraItem[] {
  const contagem: Record<string, number> = {}
  for (const p of lista) incrementa(contagem, p.status)
  return Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .map(([status, qtd]) => ({ label: statusPedidoLabel(status), valor: qtd }))
}

function linhasPedido(lista: PedidoLinha[], { mostrarMotivo = false } = {}): React.ReactNode[] {
  return lista.map((p) => (
    <div key={p.id} className="text-xs text-primary/80">
      <span className="font-mono">#{p.numero}</span> — {p.clienteNome} · {statusPedidoLabel(p.status)}
      {p.orcamentoDireto && <span className="text-accent-compras"> · DIRETO</span>} ·{' '}
      <span className="font-mono">{formatarMoeda(p.valor)}</span> · {formatarData(p.criadoEm)}
      {mostrarMotivo && p.motivoPerda && (
        <span className="block text-muted/80">Motivo: {p.motivoPerda}</span>
      )}
    </div>
  ))
}

function metricaPedido(
  key: MetricaKey,
  label: string,
  campo: (l: AgregadoFuncionario) => PedidoMetrica,
  opcoes: { mostrarMotivo?: boolean } = {},
): MetricaDef {
  return {
    key,
    label,
    dataRef: 'Filtrado pela data de criação do pedido',
    principal: (l) => campo(l).total,
    secundario: { valor: (l) => campo(l).valorTotal, formatar: formatarMoeda },
    quebra: (l) => quebraPorStatus(campo(l).lista),
    detalhe: (l) => linhasPedido(campo(l).lista, opcoes),
  }
}

const METRICAS: MetricaDef[] = [
  metricaPedido('orcDiretos', 'Orç. Diretos', (l) => l.orcDiretos),
  metricaPedido('orcNormais', 'Orç. Normais', (l) => l.orcNormais),
  // Efetuados inclui ENTREGUE — pedido entregue já passou por
  // PEDIDO_EFETUADO antes, só avançou mais uma etapa; sem isso, ele
  // desaparecia daqui assim que fosse marcado como entregue.
  metricaPedido('efetuados', 'Pedidos Efetuados', (l) => l.efetuados),
  {
    key: 'entregues',
    label: 'Entregues',
    dataRef: 'Filtrado pela data de entrega; atribuído a quem marcou como entregue',
    principal: (l) => l.entregas.total,
    secundario: { valor: (l) => l.entregas.valorTotal, formatar: formatarMoeda },
    detalhe: (l) =>
      l.entregas.lista.map((e) => (
        <div key={e.id} className="text-xs text-primary/80">
          <span className="font-mono">#{e.numero}</span> — {e.clienteNome} ·{' '}
          <span className="font-mono">{formatarMoeda(e.valor)}</span> · entregue em {formatarData(e.entregueEm)}
        </div>
      )),
  },
  metricaPedido('aprovados', 'Pedidos Aprovados', (l) => l.aprovados),
  metricaPedido('arquivados', 'Arquivados', (l) => l.arquivados),
  metricaPedido('perdidos', 'Perdidos', (l) => l.perdidos, { mostrarMotivo: true }),
  {
    key: 'tarefas',
    label: 'Tarefas',
    dataRef: 'Filtrado pela data prevista (tarefas sem data sempre aparecem)',
    principal: (l) => l.tarefas.total,
    secundario: { valor: (l) => l.tarefas.abertas, formatar: (n) => `${n} abertas` },
    quebra: (l) => [
      ...TAREFA_SITUACAO_OPCOES.map((s) => ({ label: s, valor: l.tarefas.porSituacao[s] ?? 0 })),
      ...Object.entries(l.tarefas.porTipo)
        .sort((a, b) => b[1] - a[1])
        .map(([tipo, qtd]) => ({ label: `Tipo: ${tipo}`, valor: qtd })),
    ],
    detalhe: (l) =>
      l.tarefas.lista.map((t) => (
        <div key={t.id} className="text-xs text-primary/80">
          {t.descricao || '(sem descrição)'}
          {t.tipo && ` · ${t.tipo}`} · {t.situacao}
          {t.refLabel && ` · ${t.refLabel}`} · {formatarData(t.dataPrevista ?? t.criadoEm)}
        </div>
      )),
  },
  {
    key: 'interacoes',
    label: 'Interações',
    dataRef: 'Filtrado pela data do registro',
    principal: (l) => l.interacoes.total,
    quebra: (l) => {
      // Resultados fixos primeiro (na ordem da lista), depois qualquer valor
      // livre que exista nos dados.
      const fixos = RESULTADO_INTERACAO_OPCOES.map((r) => ({ label: r, valor: l.interacoes.porResultado[r] ?? 0 }))
      const livres = Object.entries(l.interacoes.porResultado)
        .filter(([r]) => !(RESULTADO_INTERACAO_OPCOES as readonly string[]).includes(r))
        .map(([r, qtd]) => ({ label: r, valor: qtd }))
      return [...fixos, ...livres]
    },
    detalhe: (l) =>
      l.interacoes.lista.map((i) => (
        <div key={i.id} className="text-xs text-primary/80">
          {i.tipo} · {i.resultado}
          {i.refLabel && ` · ${i.refLabel}`} · {formatarData(i.criadoEm)}
          {i.observacao && <span className="block text-muted/80">&ldquo;{i.observacao}&rdquo;</span>}
        </div>
      )),
  },
  {
    key: 'chamadas',
    label: 'Chamadas',
    dataRef: 'Filtrado pela data/hora da chamada',
    principal: (l) => l.chamadas.total,
    secundario: { valor: (l) => l.chamadas.duracaoTotalSegundos, formatar: formatarDuracao },
    quebra: (l) => [
      { label: 'Atendidas', valor: l.chamadas.atendidas, cor: '#2FAE66' },
      { label: 'Não atendidas', valor: l.chamadas.naoAtendidas, cor: '#F4B400' },
      { label: 'Em andamento', valor: l.chamadas.emAndamento, cor: '#3B7DD8' },
      { label: 'Falhas', valor: l.chamadas.falhas, cor: '#E5484D' },
      { label: 'Duração total', valor: formatarDuracao(l.chamadas.duracaoTotalSegundos) },
    ],
    detalhe: (l) =>
      l.chamadas.lista.map((c) => (
        <div key={c.id} className="text-xs text-primary/80">
          {c.direcao === 'saida' ? '📤' : '📥'} {c.numero ?? '—'}
          {c.clienteNome && ` — ${c.clienteNome}`} · {chamadaStatusLabel(c.status)} ·{' '}
          {c.duracaoSegundos ? formatarDuracao(c.duracaoSegundos) : '—'} · {formatarDataHoraChamada(c.iniciadaEm)}
          {!c.empresaId && (
            <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-muted">
              empresa não identificada
            </span>
          )}
        </div>
      )),
  },
  {
    key: 'oportunidades',
    label: 'Leads/Oportunidades',
    dataRef: 'Filtrado pela data de criação da oportunidade',
    principal: (l) => l.oportunidades.total,
    quebra: (l) => {
      const contagem: Record<string, number> = {}
      for (const o of l.oportunidades.lista) incrementa(contagem, o.status)
      return Object.entries(contagem)
        .sort((a, b) => b[1] - a[1])
        .map(([status, qtd]) => ({
          label: OPORTUNIDADE_STATUS_LABELS[status as keyof typeof OPORTUNIDADE_STATUS_LABELS] ?? status,
          valor: qtd,
        }))
    },
    detalhe: (l) =>
      l.oportunidades.lista.map((o) => (
        <div key={o.id} className="text-xs text-primary/80">
          <span className="font-mono">#{o.numero}</span> — {o.clienteNome}
          {o.clienteTelefone && <span className="font-mono"> · {o.clienteTelefone}</span>} ·{' '}
          {OPORTUNIDADE_STATUS_LABELS[o.status as keyof typeof OPORTUNIDADE_STATUS_LABELS] ?? o.status} ·{' '}
          {formatarData(o.criadoEm)}
        </div>
      )),
  },
]

const TODAS_METRICAS: MetricaKey[] = METRICAS.map((m) => m.key)

// Seleção de pills lembrada por navegador — conveniência do gestor, não
// estado crítico: qualquer falha de leitura/escrita cai no padrão (todas).
const STORAGE_KEY_METRICAS = 'rhocal:analitico-funcionario:metricas'

function lerMetricasSalvas(): Set<MetricaKey> | null {
  try {
    const bruto = window.localStorage.getItem(STORAGE_KEY_METRICAS)
    if (!bruto) return null
    const lista = JSON.parse(bruto)
    if (!Array.isArray(lista)) return null
    return new Set(lista.filter((k): k is MetricaKey => TODAS_METRICAS.includes(k)))
  } catch {
    return null
  }
}

function salvarMetricas(selecao: Set<MetricaKey>) {
  try {
    window.localStorage.setItem(STORAGE_KEY_METRICAS, JSON.stringify(Array.from(selecao)))
  } catch {
    // Sem storage disponível (aba anônima, bloqueio) — segue sem lembrar.
  }
}

export default function AnaliticoPorFuncionario({
  range,
  periodoLabel,
  empresaId,
}: {
  range: RangePeriodo
  periodoLabel: string
  empresaId: string
}) {
  const [supabase] = useState(() => createClient())
  const [linhas, setLinhas] = useState<AgregadoFuncionario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  // Filtro de data próprio da seção — sobrepõe o período do Painel só aqui
  // dentro. Em "Sem filtro" (ou sem data preenchida ainda), segue o Painel.
  const [modoData, setModoData] = useState<ModoFiltroData>('nenhum')
  const [dataEspecifica, setDataEspecifica] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')

  const [metricasAtivas, setMetricasAtivas] = useState<Set<MetricaKey>>(() => new Set(TODAS_METRICAS))
  const preferenciaCarregada = useRef(false)

  // Drill-down: só uma célula (funcionário × métrica) aberta por vez.
  const [aberto, setAberto] = useState<{ funcionarioId: string; metrica: MetricaKey } | null>(null)

  // Lido só depois de montar (localStorage não existe no render do servidor).
  useEffect(() => {
    const salvas = lerMetricasSalvas()
    if (salvas) setMetricasAtivas(salvas)
    preferenciaCarregada.current = true
  }, [])

  useEffect(() => {
    if (preferenciaCarregada.current) salvarMetricas(metricasAtivas)
  }, [metricasAtivas])

  const usandoPeriodoPainel =
    !(modoData === 'especifica' && dataEspecifica) && !(modoData === 'intervalo' && (dataDe || dataAte))
  const inicioEfetivo = usandoPeriodoPainel
    ? range.inicio
    : modoData === 'especifica'
      ? dataEspecifica
      : dataDe || null
  const fimEfetivo = usandoPeriodoPainel
    ? range.fim
    : modoData === 'especifica'
      ? dataEspecifica
      : dataAte || null

  useEffect(() => {
    let ativo = true
    const rangeEfetivo: RangePeriodo = { inicio: inicioEfetivo, fim: fimEfetivo }

    async function carregar() {
      setCarregando(true)
      setErro(null)

      try {
        // Período de tarefas filtra por `data_prevista` (coluna `date`, sem
        // hora/fuso — valor cru vem como 'YYYY-MM-DD', confirmado direto no
        // banco), não por `criado_em`: uma leva grande de tarefas foi
        // importada do Omie de uma vez (todas com `criado_em` do dia da
        // importação), então filtrar por criação escondia praticamente tudo
        // do "Mês atual" — `data_prevista` reflete quando a tarefa de fato
        // está agendada, que é o que faz sentido pro recorte de período aqui.
        // Sendo `date`, a comparação é direta com as strings do range, sem o
        // truque de `proximoDia`/`T00:00:00` usado nas colunas timestamptz.
        //
        // Tarefa sem `data_prevista` (opcional — ex: boa parte das importadas
        // do Omie) sempre aparece, não importa o período selecionado: só as
        // que TÊM data marcada são de fato filtradas por ela. Por isso o
        // filtro é um `.or()` (data nula OU dentro do range), não um `.gte`/
        // `.lte` direto, que excluiria as nulas.
        let queryTarefas = supabase
          .from('tarefas')
          .select(
            'id, descricao, responsavel, situacao, tipo, data_prevista, criado_em, pedido_id, oportunidade_id',
          )
          .eq('empresa_id', empresaId)
          .eq('excluida', false)
        if (rangeEfetivo.inicio && rangeEfetivo.fim) {
          queryTarefas = queryTarefas.or(
            `data_prevista.is.null,and(data_prevista.gte.${rangeEfetivo.inicio},data_prevista.lte.${rangeEfetivo.fim})`,
          )
        } else if (rangeEfetivo.inicio) {
          queryTarefas = queryTarefas.or(`data_prevista.is.null,data_prevista.gte.${rangeEfetivo.inicio}`)
        } else if (rangeEfetivo.fim) {
          queryTarefas = queryTarefas.or(`data_prevista.is.null,data_prevista.lte.${rangeEfetivo.fim}`)
        }

        let queryInteracoes = supabase
          .from('interacoes')
          .select('id, oportunidade_id, pedido_id, tipo, resultado, observacao, registrado_por, criado_em')
        if (rangeEfetivo.inicio) queryInteracoes = queryInteracoes.gte('criado_em', `${rangeEfetivo.inicio}T00:00:00`)
        if (rangeEfetivo.fim) {
          queryInteracoes = queryInteracoes.lt('criado_em', `${proximoDia(rangeEfetivo.fim)}T00:00:00`)
        }

        // Inclui também chamadas sem empresa_id identificada (mesmo
        // raciocínio de ChamadasPorFuncionario.tsx/ChamadasSemEmpresa.tsx) —
        // sabemos quem fez a ligação mesmo sem saber a empresa, então elas
        // aparecem em qualquer empresa ativa em vez de sumir do analítico. O
        // indicador visual no drill-down deixa claro quais são.
        let queryChamadas = supabase
          .from('chamadas')
          .select(
            'id, usuario_id, direcao, status, numero_origem, numero_destino, duracao_segundos, iniciada_em, oportunidade_id, empresa_id',
          )
          .or(`empresa_id.eq.${empresaId},empresa_id.is.null`)
        if (rangeEfetivo.inicio) queryChamadas = queryChamadas.gte('iniciada_em', `${rangeEfetivo.inicio}T00:00:00`)
        if (rangeEfetivo.fim) {
          queryChamadas = queryChamadas.lt('iniciada_em', `${proximoDia(rangeEfetivo.fim)}T00:00:00`)
        }

        const [
          { data: profilesData, error: erroProfiles },
          { data: pedidosData, error: erroPedidos },
          { data: oportData, error: erroOport },
          { data: tarefasData, error: erroTarefas },
          { data: interacoesData, error: erroInteracoes },
          { data: chamadasData, error: erroChamadas },
        ] = await Promise.all([
          supabase.from('profiles').select('id, nome, ativo'),
          supabase
            .from('pedidos')
            .select(
              'id, numero, cliente_nome, status, orcamento_direto, criado_por, criado_em, movido_por, entregue_em, motivo_perda',
            )
            .eq('empresa_id', empresaId),
          supabase
            .from('oportunidades')
            .select('id, numero, cliente_nome, cliente_telefone, status, criado_por, criado_em')
            .eq('empresa_id', empresaId),
          queryTarefas,
          queryInteracoes,
          queryChamadas,
        ])

        if (erroProfiles) throw erroProfiles
        if (erroPedidos) throw erroPedidos
        if (erroOport) throw erroOport
        if (erroTarefas) throw erroTarefas
        if (erroInteracoes) throw erroInteracoes
        if (erroChamadas) throw erroChamadas
        if (!ativo) return

        const pedidosTodos = (pedidosData ?? []) as PedidoBruto[]
        const idsPedidosTodos = new Set(pedidosTodos.map((p) => p.id))
        const numeroPorPedidoId = new Map(pedidosTodos.map((p) => [p.id, p.numero]))

        const oportunidadesTodas = (oportData ?? []) as OportunidadeBruta[]
        const idsOportunidadesTodos = new Set(oportunidadesTodas.map((o) => o.id))
        const numeroPorOportunidadeId = new Map(oportunidadesTodas.map((o) => [o.id, o.numero]))
        const nomePorOportunidadeId = new Map(oportunidadesTodas.map((o) => [o.id, o.cliente_nome]))

        // Recorte de período de pedidos, feito em JS — ver comentário no topo
        // do arquivo sobre por que `pedidos` é buscado sem filtro server-side.
        const pedidosNoPeriodo = pedidosTodos.filter((p) =>
          dentroDoPeriodo(p.criado_em, rangeEfetivo.inicio, rangeEfetivo.fim),
        )
        const idsPedidosNoPeriodo = pedidosNoPeriodo.map((p) => p.id)

        // Entregas: recorte por período aplicado sobre `entregue_em` (quando a
        // entrega aconteceu), não `criado_em` (quando o orçamento nasceu) — um
        // pedido pode ter sido criado num mês e entregue só num período
        // seguinte, mesmo raciocínio já usado pra tarefas (data_prevista).
        const pedidosEntreguesNoPeriodo = pedidosTodos.filter(
          (p) =>
            p.status === 'ENTREGUE' &&
            p.entregue_em &&
            dentroDoPeriodo(p.entregue_em, rangeEfetivo.inicio, rangeEfetivo.fim),
        )
        const idsPedidosEntreguesNoPeriodo = pedidosEntreguesNoPeriodo.map((p) => p.id)

        // Mesma lógica: oportunidades buscadas sem filtro server-side (o
        // conjunto completo já serve pra resolver refLabel de tarefas/
        // interações e o nome do cliente nas chamadas, fora do período), o
        // recorte pro agregado por funcionário é feito aqui em JS.
        const oportunidadesNoPeriodo = oportunidadesTodas.filter((o) =>
          dentroDoPeriodo(o.criado_em, rangeEfetivo.inicio, rangeEfetivo.fim),
        )

        // União dos pedidos que precisam de valor de itens: pedidos no
        // período de criação + entregas no período de entrega (podem não se
        // sobrepor, já que usam campos de data diferentes).
        const idsParaItens = Array.from(new Set([...idsPedidosNoPeriodo, ...idsPedidosEntreguesNoPeriodo]))

        const { data: itensData, error: erroItens } =
          idsParaItens.length > 0
            ? await supabase
                .from('pedido_itens')
                .select('pedido_id, preco_venda, quantidade')
                .in('pedido_id', idsParaItens)
                .eq('excluido', false)
            : { data: [] as ItemBruto[], error: null }
        if (erroItens) throw erroItens
        if (!ativo) return

        const valorPorPedido = new Map<string, number>()
        for (const item of (itensData ?? []) as ItemBruto[]) {
          const atual = valorPorPedido.get(item.pedido_id) ?? 0
          valorPorPedido.set(item.pedido_id, atual + Number(item.preco_venda ?? 0) * Number(item.quantidade))
        }

        // interacoes não tem empresa_id — escopo por empresa via pertencimento
        // a um pedido ou oportunidade da empresa ativa (conjuntos completos,
        // sem recorte de período, já que o período da interação é o próprio
        // criado_em dela, já filtrado na query).
        const interacoesDaEmpresa = ((interacoesData ?? []) as InteracaoBruta[]).filter(
          (i) =>
            (i.pedido_id && idsPedidosTodos.has(i.pedido_id)) ||
            (i.oportunidade_id && idsOportunidadesTodos.has(i.oportunidade_id)),
        )

        const refLabel = (pedidoId: string | null, oportunidadeId: string | null): string | null => {
          if (pedidoId && numeroPorPedidoId.has(pedidoId)) return `Pedido #${numeroPorPedidoId.get(pedidoId)}`
          if (oportunidadeId && numeroPorOportunidadeId.has(oportunidadeId)) {
            return `Oportunidade #${numeroPorOportunidadeId.get(oportunidadeId)}`
          }
          return null
        }

        const mapa = new Map<string, AgregadoFuncionario>()
        for (const p of (profilesData ?? []) as Profile[]) {
          mapa.set(p.id, novoAgregado(p.id, p.nome, p.ativo))
        }

        // 1) Pedidos por criado_por (nunca nulo em `pedidos`), período sobre
        // criado_em: orçamentos diretos/normais (qualquer status, separados
        // por orcamento_direto) + fatias por status atual (efetuados,
        // aprovados, arquivados, perdidos).
        for (const pedido of pedidosNoPeriodo) {
          const agregado = obterOuCriar(mapa, pedido.criado_por, 'Perfil removido')
          const linha: PedidoLinha = {
            id: pedido.id,
            numero: pedido.numero,
            clienteNome: pedido.cliente_nome,
            status: pedido.status,
            orcamentoDireto: pedido.orcamento_direto,
            valor: valorPorPedido.get(pedido.id) ?? 0,
            criadoEm: pedido.criado_em,
            motivoPerda: pedido.motivo_perda,
          }

          acumularPedido(pedido.orcamento_direto ? agregado.orcDiretos : agregado.orcNormais, linha)

          if (pedido.status === 'PEDIDO_EFETUADO' || pedido.status === 'ENTREGUE') {
            acumularPedido(agregado.efetuados, linha)
          } else if (pedido.status === 'APROVADO_CLIENTE') {
            acumularPedido(agregado.aprovados, linha)
          } else if (pedido.status === 'ARQUIVADO') {
            acumularPedido(agregado.arquivados, linha)
          } else if (pedido.status === 'PERDIDO') {
            acumularPedido(agregado.perdidos, linha)
          }
        }

        // 2) Entregas — agrupadas por movido_por (quem de fato clicou em
        // "Marcar como Entregue"), não por criado_por: quem confirma a
        // entrega costuma ser alguém diferente de quem criou o orçamento.
        // `movido_por` é gravado pela trigger fn_pedido_movimentado a cada
        // mudança de status, então sempre reflete o autor da última
        // movimentação — nesse caso, exatamente quem marcou como entregue.
        for (const pedido of pedidosEntreguesNoPeriodo) {
          const chave = pedido.movido_por ?? SEM_ATRIBUICAO_ID
          const agregado = obterOuCriar(mapa, chave, chave === SEM_ATRIBUICAO_ID ? SEM_ATRIBUICAO_NOME : 'Perfil removido')
          const valor = valorPorPedido.get(pedido.id) ?? 0

          agregado.entregas.total += 1
          agregado.entregas.valorTotal += valor
          agregado.entregas.lista.push({
            id: pedido.id,
            numero: pedido.numero,
            clienteNome: pedido.cliente_nome,
            valor,
            entregueEm: pedido.entregue_em,
          })
        }

        // 3) Leads/Oportunidades — agrupadas por criado_por (nunca nulo em
        // `oportunidades`).
        for (const oportunidade of oportunidadesNoPeriodo) {
          const agregado = obterOuCriar(mapa, oportunidade.criado_por, 'Perfil removido')
          agregado.oportunidades.total += 1
          agregado.oportunidades.lista.push({
            id: oportunidade.id,
            numero: oportunidade.numero,
            clienteNome: oportunidade.cliente_nome,
            clienteTelefone: oportunidade.cliente_telefone,
            status: oportunidade.status,
            criadoEm: oportunidade.criado_em,
          })
        }

        // 4) Tarefas — agrupadas por responsavel (nulo vira "Não atribuído",
        // caso comum em tarefa importada do Omie).
        for (const tarefa of (tarefasData ?? []) as TarefaBruta[]) {
          const chave = tarefa.responsavel ?? SEM_ATRIBUICAO_ID
          const agregado = obterOuCriar(mapa, chave, chave === SEM_ATRIBUICAO_ID ? SEM_ATRIBUICAO_NOME : 'Perfil removido')

          agregado.tarefas.total += 1
          if (!situacaoTerminal(tarefa.situacao)) agregado.tarefas.abertas += 1
          incrementa(agregado.tarefas.porSituacao, tarefa.situacao)
          incrementa(agregado.tarefas.porTipo, tarefa.tipo ?? 'Sem tipo')
          agregado.tarefas.lista.push({
            id: tarefa.id,
            descricao: tarefa.descricao,
            tipo: tarefa.tipo,
            situacao: tarefa.situacao,
            dataPrevista: tarefa.data_prevista,
            criadoEm: tarefa.criado_em,
            refLabel: refLabel(tarefa.pedido_id, tarefa.oportunidade_id),
          })
        }

        // 5) Interações — agrupadas por registrado_por (nunca nulo).
        for (const interacao of interacoesDaEmpresa) {
          const agregado = obterOuCriar(mapa, interacao.registrado_por, 'Perfil removido')
          agregado.interacoes.total += 1
          incrementa(agregado.interacoes.porResultado, interacao.resultado)
          agregado.interacoes.lista.push({
            id: interacao.id,
            tipo: interacao.tipo,
            resultado: interacao.resultado,
            observacao: interacao.observacao,
            criadoEm: interacao.criado_em,
            refLabel: refLabel(interacao.pedido_id, interacao.oportunidade_id),
          })
        }

        // 6) Chamadas — agrupadas por usuario_id (nulo vira "Não atribuído").
        // Nome do cliente resolvido via oportunidade_id (quando preenchido),
        // usando o mapa já montado a partir de `oportunidadesTodas` — chamada
        // pode ter sido feita fora do período de criação da oportunidade,
        // então o mapa não pode ficar restrito a `oportunidadesNoPeriodo`.
        for (const chamada of (chamadasData ?? []) as ChamadaBruta[]) {
          const chave = chamada.usuario_id ?? SEM_ATRIBUICAO_ID
          const agregado = obterOuCriar(mapa, chave, chave === SEM_ATRIBUICAO_ID ? SEM_ATRIBUICAO_NOME : 'Perfil removido')

          agregado.chamadas.total += 1
          agregado.chamadas.duracaoTotalSegundos += chamada.duracao_segundos ?? 0
          if (chamada.status === 'atendida') agregado.chamadas.atendidas += 1
          else if (chamada.status === 'nao_atendida') agregado.chamadas.naoAtendidas += 1
          else if (chamada.status === 'em_andamento') agregado.chamadas.emAndamento += 1
          else if (chamada.status === 'falha') agregado.chamadas.falhas += 1

          agregado.chamadas.lista.push({
            id: chamada.id,
            direcao: chamada.direcao,
            status: chamada.status,
            numero: chamada.direcao === 'saida' ? chamada.numero_destino : chamada.numero_origem,
            clienteNome: chamada.oportunidade_id ? nomePorOportunidadeId.get(chamada.oportunidade_id) ?? null : null,
            duracaoSegundos: chamada.duracao_segundos,
            iniciadaEm: chamada.iniciada_em,
            empresaId: chamada.empresa_id,
          })
        }

        // "Não atribuído" fica sempre no resultado — se ele aparece ou não é
        // decidido na renderização, conforme as métricas ligadas nas pills.
        const resultado = Array.from(mapa.values()).sort((x, y) => {
          if (x.id === SEM_ATRIBUICAO_ID) return 1
          if (y.id === SEM_ATRIBUICAO_ID) return -1
          return x.nome.localeCompare(y.nome)
        })

        setLinhas(resultado)
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : 'Erro ao carregar o analítico por funcionário.')
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [supabase, inicioEfetivo, fimEfetivo, empresaId])

  const metricasVisiveis = useMemo(() => METRICAS.filter((m) => metricasAtivas.has(m.key)), [metricasAtivas])

  const linhasVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return linhas.filter((l) => {
      if (termo && !l.nome.toLowerCase().includes(termo)) return false
      // "Não atribuído" só aparece se tiver valor em alguma métrica ligada.
      if (l.id === SEM_ATRIBUICAO_ID) return metricasVisiveis.some((m) => m.principal(l) > 0)
      return true
    })
  }, [linhas, busca, metricasVisiveis])

  function alternarMetrica(key: MetricaKey) {
    setMetricasAtivas((atual) => {
      const novo = new Set(atual)
      if (novo.has(key)) novo.delete(key)
      else novo.add(key)
      return novo
    })
  }

  function alternarCelula(funcionarioId: string, metrica: MetricaKey) {
    setAberto((atual) =>
      atual?.funcionarioId === funcionarioId && atual.metrica === metrica ? null : { funcionarioId, metrica },
    )
  }

  // Drill-down só vale enquanto a métrica continua ligada nas pills.
  const metricaAberta = aberto && metricasAtivas.has(aberto.metrica)
    ? METRICAS.find((m) => m.key === aberto.metrica) ?? null
    : null

  return (
    <section className="print-analitico-funcionario rounded-lg border border-white/10 bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-primary">Analítico por funcionário</h3>
        <div className="no-print flex items-center gap-2">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar funcionário..."
            className="input-field w-56 rounded-md px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-primary/80 transition-colors hover:bg-white/10"
          >
            🖨️ Imprimir
          </button>
        </div>
      </div>

      <div className="no-print mb-3 flex flex-wrap items-end gap-3">
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
      </div>
      <p className="mb-3 text-xs text-muted">
        {usandoPeriodoPainel
          ? `Usando período do Painel: ${periodoLabel}`
          : 'Usando o filtro de data desta seção (o período do Painel não se aplica aqui).'}
      </p>

      <div className="no-print mb-4">
        <label className="block text-xs text-muted">Métricas</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMetricasAtivas(new Set(TODAS_METRICAS))}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-primary/80 transition-colors hover:bg-white/10"
          >
            Todas
          </button>
          {METRICAS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => alternarMetrica(m.key)}
              aria-pressed={metricasAtivas.has(m.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                metricasAtivas.has(m.key)
                  ? 'bg-accent-primary text-white'
                  : 'bg-white/5 text-muted hover:bg-white/10 hover:text-primary'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {carregando && <p className="text-sm text-muted">Carregando...</p>}
      {erro && (
        <p className="rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erro}
        </p>
      )}

      {!carregando && !erro && metricasVisiveis.length === 0 && (
        <p className="text-sm text-muted">Selecione ao menos uma métrica.</p>
      )}

      {!carregando && !erro && metricasVisiveis.length > 0 && linhasVisiveis.length === 0 && (
        <p className="text-sm text-muted">Nenhum funcionário encontrado.</p>
      )}

      {!carregando && !erro && metricasVisiveis.length > 0 && linhasVisiveis.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-base">
            <thead className="border-b-2 border-white/15 bg-surface-alt text-sm uppercase tracking-wide text-primary/80">
              <tr>
                <th className="sticky left-0 z-10 bg-surface-alt px-4 py-3 font-semibold">Funcionário</th>
                {metricasVisiveis.map((m) => (
                  <th
                    key={m.key}
                    title={m.dataRef}
                    className="whitespace-nowrap border-l border-white/10 px-4 py-3 text-center font-semibold"
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhasVisiveis.map((l) => {
                const comAtividade = metricasVisiveis.some((m) => m.principal(l) > 0)
                const detalheAberto = metricaAberta && aberto?.funcionarioId === l.id ? metricaAberta : null
                return (
                  <Fragment key={l.id}>
                    <tr
                      className={`border-t border-white/10 transition-colors ${
                        comAtividade ? 'bg-white/[0.03]' : 'opacity-40'
                      }`}
                    >
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-3.5 font-semibold text-primary">
                        {l.nome}
                        {!l.ativo && <span className="ml-1.5 font-normal text-muted">(inativo)</span>}
                      </td>
                      {metricasVisiveis.map((m) => {
                        const valor = m.principal(l)
                        const selecionada = detalheAberto?.key === m.key
                        // Célula com valor: cinza claro + contorno (bem mais
                        // claro que o fundo #1C242A da tabela, pra aparecer no
                        // tema escuro). Zerada: sem fundo, número em
                        // text-muted. Aberta no drill-down: tom da marca, pra
                        // não se confundir com as ativas.
                        return (
                          <td key={m.key} className="border-l border-white/10 px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => alternarCelula(l.id, m.key)}
                              aria-expanded={selecionada}
                              aria-label={`${m.label} de ${l.nome}: ${valor}. Ver registros`}
                              className={`w-full min-w-[5.5rem] rounded-md px-3 py-2.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary ${
                                selecionada
                                  ? 'bg-[color:color-mix(in_srgb,var(--accent-primary)_20%,transparent)] ring-2 ring-accent-primary'
                                  : valor > 0
                                    ? 'bg-white/[0.16] ring-1 ring-inset ring-white/25 hover:bg-white/[0.22]'
                                    : 'hover:bg-white/10'
                              }`}
                            >
                              <span
                                className={`block font-mono text-base ${
                                  valor > 0 ? 'font-semibold text-primary' : 'text-muted'
                                }`}
                              >
                                {valor}
                              </span>
                              {m.secundario && valor > 0 && (
                                <span className="mt-0.5 block whitespace-nowrap font-mono text-xs text-muted">
                                  {m.secundario.formatar(m.secundario.valor(l))}
                                </span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>

                    {detalheAberto && (
                      <tr className="border-t border-white/5 bg-surface-alt/40">
                        <td colSpan={metricasVisiveis.length + 1} className="px-4 py-3">
                          <DetalheMetrica
                            titulo={`${detalheAberto.label} — ${l.nome}`}
                            total={detalheAberto.principal(l)}
                            quebra={detalheAberto.quebra?.(l) ?? []}
                            itens={detalheAberto.detalhe(l)}
                            onFechar={() => setAberto(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-accent-primary bg-surface-alt text-sm">
              <tr>
                <td className="sticky left-0 z-10 bg-surface-alt px-4 py-3.5 font-bold uppercase tracking-wide text-primary">
                  Total
                </td>
                {metricasVisiveis.map((m) => {
                  const total = linhasVisiveis.reduce((acc, l) => acc + m.principal(l), 0)
                  const totalSecundario = m.secundario
                    ? linhasVisiveis.reduce((acc, l) => acc + m.secundario!.valor(l), 0)
                    : 0
                  return (
                    <td key={m.key} className="border-l border-white/10 px-4 py-3.5 text-center">
                      <span className="block font-mono text-lg font-bold text-primary">{total}</span>
                      {m.secundario && total > 0 && (
                        <span className="mt-0.5 block whitespace-nowrap font-mono text-xs font-semibold text-primary/70">
                          {m.secundario.formatar(totalSecundario)}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

// Drill-down de uma célula (funcionário × métrica): quebra por situação/
// resultado/status no topo — o que antes eram subcolunas nas tabelas por
// bloco — e a lista de registros por trás do número logo abaixo.
function DetalheMetrica({
  titulo,
  total,
  quebra,
  itens,
  onFechar,
}: {
  titulo: string
  total: number
  quebra: QuebraItem[]
  itens: React.ReactNode[]
  onFechar: () => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-primary">
          {titulo} <span className="font-mono text-muted">({total})</span>
        </p>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar detalhe"
          className="no-print rounded-md px-2 py-0.5 text-muted transition-colors hover:bg-white/10 hover:text-primary"
        >
          ×
        </button>
      </div>

      {quebra.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {quebra.map((q) => (
            <span
              key={q.label}
              className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted"
            >
              {q.label}:
              <span className="font-mono font-medium" style={{ color: q.cor ?? 'var(--text-primary)' }}>
                {q.valor}
              </span>
            </span>
          ))}
        </div>
      )}

      <ListaDetalhe itens={itens} />
    </div>
  )
}

function ListaDetalhe({ itens }: { itens: React.ReactNode[] }) {
  if (itens.length === 0) {
    return <p className="text-xs text-muted/70">Nenhum registro no período.</p>
  }
  return <div className="print-scroll-livre max-h-64 space-y-1.5 overflow-y-auto pr-1">{itens}</div>
}
