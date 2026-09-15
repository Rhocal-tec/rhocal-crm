'use client'

// Seção do Painel Gestor: analítico por funcionário — cruza orçamentos,
// pedidos efetuados, tarefas, interações e chamadas, tudo agrupado por quem
// criou/registrou/atendeu cada um. Reaproveita o mesmo `range` de período do
// resto do Painel (src/app/painel/page.tsx) e a `empresaId` ativa.
//
// Estratégia de queries (combinada com o usuário antes de implementar):
// busca os registros CRUS de cada tabela, uma vez cada (nunca por
// funcionário), e faz toda a agregação/soma em JS — expandir uma linha não
// dispara nenhuma query nova, só filtra os arrays já carregados.
//
// `pedidos` é buscado SEM filtro de período (só por empresa) porque também
// serve pra escopar `interacoes` por empresa (a tabela não tem empresa_id
// própria — fica só amarrada por pedido_id/oportunidade_id). O recorte de
// período de pedidos é aplicado depois em JS, sobre `criado_em`.
//
// Client Supabase compartilhado do app (mesma cautela do resto do Painel:
// nunca um createClient avulso de @supabase/supabase-js).

import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RangePeriodo } from '@/lib/kanban/periodo'
import { proximoDia } from '@/lib/kanban/filtro-data'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import { STATUS_LABELS } from '@/lib/kanban/status'
import { TAREFA_SITUACAO_OPCOES } from '@/lib/tarefas/opcoes'
import { RESULTADO_INTERACAO_OPCOES } from '@/lib/interacoes/opcoes'
import type { Database } from '@/types/database'

type PedidoBruto = Pick<
  Database['public']['Tables']['pedidos']['Row'],
  'id' | 'numero' | 'cliente_nome' | 'status' | 'orcamento_direto' | 'criado_por' | 'criado_em'
>
type ItemBruto = Pick<Database['public']['Tables']['pedido_itens']['Row'], 'pedido_id' | 'preco_venda' | 'quantidade'>
type OportunidadeIdBruta = Pick<Database['public']['Tables']['oportunidades']['Row'], 'id' | 'numero'>
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
  'id' | 'usuario_id' | 'direcao' | 'status' | 'numero_origem' | 'numero_destino' | 'duracao_segundos' | 'iniciada_em'
>
type Profile = Pick<Database['public']['Tables']['profiles']['Row'], 'id' | 'nome'>

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
  duracaoSegundos: number | null
  iniciadaEm: string | null
}

interface AgregadoFuncionario {
  id: string
  nome: string
  orcamentos: { total: number; diretos: number; normais: number; valorTotal: number; lista: PedidoLinha[] }
  efetuados: { total: number; valorTotal: number; lista: PedidoLinha[] }
  tarefas: {
    total: number
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

function novoAgregado(id: string, nome: string): AgregadoFuncionario {
  return {
    id,
    nome,
    orcamentos: { total: 0, diretos: 0, normais: 0, valorTotal: 0, lista: [] },
    efetuados: { total: 0, valorTotal: 0, lista: [] },
    tarefas: { total: 0, porSituacao: {}, porTipo: {}, lista: [] },
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

export default function AnaliticoPorFuncionario({ range, empresaId }: { range: RangePeriodo; empresaId: string }) {
  const [supabase] = useState(() => createClient())
  const [linhas, setLinhas] = useState<AgregadoFuncionario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setCarregando(true)
      setErro(null)

      try {
        let queryTarefas = supabase
          .from('tarefas')
          .select(
            'id, descricao, responsavel, situacao, tipo, data_prevista, criado_em, pedido_id, oportunidade_id',
          )
          .eq('empresa_id', empresaId)
          .eq('excluida', false)
        if (range.inicio) queryTarefas = queryTarefas.gte('criado_em', `${range.inicio}T00:00:00`)
        if (range.fim) queryTarefas = queryTarefas.lt('criado_em', `${proximoDia(range.fim)}T00:00:00`)

        let queryInteracoes = supabase
          .from('interacoes')
          .select('id, oportunidade_id, pedido_id, tipo, resultado, observacao, registrado_por, criado_em')
        if (range.inicio) queryInteracoes = queryInteracoes.gte('criado_em', `${range.inicio}T00:00:00`)
        if (range.fim) queryInteracoes = queryInteracoes.lt('criado_em', `${proximoDia(range.fim)}T00:00:00`)

        let queryChamadas = supabase
          .from('chamadas')
          .select('id, usuario_id, direcao, status, numero_origem, numero_destino, duracao_segundos, iniciada_em')
          .eq('empresa_id', empresaId)
        if (range.inicio) queryChamadas = queryChamadas.gte('iniciada_em', `${range.inicio}T00:00:00`)
        if (range.fim) queryChamadas = queryChamadas.lt('iniciada_em', `${proximoDia(range.fim)}T00:00:00`)

        const [
          { data: profilesData, error: erroProfiles },
          { data: pedidosData, error: erroPedidos },
          { data: oportData, error: erroOport },
          { data: tarefasData, error: erroTarefas },
          { data: interacoesData, error: erroInteracoes },
          { data: chamadasData, error: erroChamadas },
        ] = await Promise.all([
          supabase.from('profiles').select('id, nome'),
          supabase
            .from('pedidos')
            .select('id, numero, cliente_nome, status, orcamento_direto, criado_por, criado_em')
            .eq('empresa_id', empresaId),
          supabase.from('oportunidades').select('id, numero').eq('empresa_id', empresaId),
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

        const oportunidades = (oportData ?? []) as OportunidadeIdBruta[]
        const idsOportunidadesTodos = new Set(oportunidades.map((o) => o.id))
        const numeroPorOportunidadeId = new Map(oportunidades.map((o) => [o.id, o.numero]))

        // Recorte de período de pedidos, feito em JS — ver comentário no topo
        // do arquivo sobre por que `pedidos` é buscado sem filtro server-side.
        const pedidosNoPeriodo = pedidosTodos.filter((p) => dentroDoPeriodo(p.criado_em, range.inicio, range.fim))
        const idsPedidosNoPeriodo = pedidosNoPeriodo.map((p) => p.id)

        const { data: itensData, error: erroItens } =
          idsPedidosNoPeriodo.length > 0
            ? await supabase
                .from('pedido_itens')
                .select('pedido_id, preco_venda, quantidade')
                .in('pedido_id', idsPedidosNoPeriodo)
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
          mapa.set(p.id, novoAgregado(p.id, p.nome))
        }

        // 1) Orçamentos + 2) Pedidos efetuados — agrupados por criado_por
        // (nunca nulo em `pedidos`).
        for (const pedido of pedidosNoPeriodo) {
          const agregado = obterOuCriar(mapa, pedido.criado_por, 'Perfil removido')
          const valor = valorPorPedido.get(pedido.id) ?? 0
          const linha: PedidoLinha = {
            id: pedido.id,
            numero: pedido.numero,
            clienteNome: pedido.cliente_nome,
            status: pedido.status,
            orcamentoDireto: pedido.orcamento_direto,
            valor,
            criadoEm: pedido.criado_em,
          }

          agregado.orcamentos.total += 1
          agregado.orcamentos.valorTotal += valor
          if (pedido.orcamento_direto) agregado.orcamentos.diretos += 1
          else agregado.orcamentos.normais += 1
          agregado.orcamentos.lista.push(linha)

          if (pedido.status === 'PEDIDO_EFETUADO') {
            agregado.efetuados.total += 1
            agregado.efetuados.valorTotal += valor
            agregado.efetuados.lista.push(linha)
          }
        }

        // 3) Tarefas — agrupadas por responsavel (nulo vira "Não atribuído",
        // caso comum em tarefa importada do Omie).
        for (const tarefa of (tarefasData ?? []) as TarefaBruta[]) {
          const chave = tarefa.responsavel ?? SEM_ATRIBUICAO_ID
          const agregado = obterOuCriar(mapa, chave, chave === SEM_ATRIBUICAO_ID ? SEM_ATRIBUICAO_NOME : 'Perfil removido')

          agregado.tarefas.total += 1
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

        // 4) Interações — agrupadas por registrado_por (nunca nulo).
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

        // 5) Chamadas — agrupadas por usuario_id (nulo vira "Não atribuído").
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
            duracaoSegundos: chamada.duracao_segundos,
            iniciadaEm: chamada.iniciada_em,
          })
        }

        const resultado = Array.from(mapa.values())
          .filter((a) => {
            if (a.id !== SEM_ATRIBUICAO_ID) return true
            // "Não atribuído" só aparece se tiver alguma atividade de fato.
            return a.tarefas.total > 0 || a.chamadas.total > 0 || a.interacoes.total > 0 || a.orcamentos.total > 0
          })
          .sort((x, y) => {
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
  }, [supabase, range.inicio, range.fim, empresaId])

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return linhas
    return linhas.filter((l) => l.nome.toLowerCase().includes(termo))
  }, [linhas, busca])

  function alternarExpandido(id: string) {
    setExpandidos((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  return (
    <section className="rounded-lg border border-white/10 bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-primary">Analítico por funcionário</h3>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar funcionário..."
          className="input-field w-56 rounded-md px-3 py-1.5 text-sm"
        />
      </div>

      {carregando && <p className="text-sm text-muted">Carregando...</p>}
      {erro && (
        <p className="rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erro}
        </p>
      )}

      {!carregando && !erro && linhasFiltradas.length === 0 && (
        <p className="text-sm text-muted">Nenhum funcionário encontrado.</p>
      )}

      {!carregando && !erro && linhasFiltradas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
              <tr>
                <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                  Funcionário
                </th>
                <th colSpan={4} className="border-l border-white/10 px-3 py-1 text-center font-medium">
                  Orçamentos
                </th>
                <th colSpan={2} className="border-l border-white/10 px-3 py-1 text-center font-medium">
                  Pedidos efetuados
                </th>
                <th colSpan={5} className="border-l border-white/10 px-3 py-1 text-center font-medium">
                  Tarefas
                </th>
                <th colSpan={6} className="border-l border-white/10 px-3 py-1 text-center font-medium">
                  Interações
                </th>
                <th colSpan={6} className="border-l border-white/10 px-3 py-1 text-center font-medium">
                  Chamadas
                </th>
                <th rowSpan={2} className="px-2 py-2" />
              </tr>
              <tr>
                <th className="border-l border-white/10 px-2 py-1.5 text-center font-medium">Total</th>
                <th className="px-2 py-1.5 text-center font-medium">Diretos</th>
                <th className="px-2 py-1.5 text-center font-medium">Normais</th>
                <th className="px-2 py-1.5 text-center font-medium">Valor</th>

                <th className="border-l border-white/10 px-2 py-1.5 text-center font-medium">Qtd.</th>
                <th className="px-2 py-1.5 text-center font-medium">Valor</th>

                <th className="border-l border-white/10 px-2 py-1.5 text-center font-medium">Total</th>
                {TAREFA_SITUACAO_OPCOES.map((s) => (
                  <th key={s} className="px-2 py-1.5 text-center font-medium">
                    {s}
                  </th>
                ))}

                <th className="border-l border-white/10 px-2 py-1.5 text-center font-medium">Total</th>
                {RESULTADO_INTERACAO_OPCOES.map((r) => (
                  <th key={r} className="px-2 py-1.5 text-center font-medium">
                    {r}
                  </th>
                ))}

                <th className="border-l border-white/10 px-2 py-1.5 text-center font-medium">Total</th>
                <th className="px-2 py-1.5 text-center font-medium">Atend.</th>
                <th className="px-2 py-1.5 text-center font-medium">Não atend.</th>
                <th className="px-2 py-1.5 text-center font-medium">Andamento</th>
                <th className="px-2 py-1.5 text-center font-medium">Falhas</th>
                <th className="px-2 py-1.5 text-center font-medium">Duração</th>
              </tr>
            </thead>
            <tbody>
              {linhasFiltradas.map((l) => {
                const aberto = expandidos.has(l.id)
                return (
                  <Fragment key={l.id}>
                    <tr
                      onClick={() => alternarExpandido(l.id)}
                      className="cursor-pointer border-t border-white/5 hover:bg-white/5"
                    >
                      <td className="px-3 py-2.5 font-medium text-primary">{l.nome}</td>

                      <td className="border-l border-white/5 px-2 py-2.5 text-center text-primary">
                        {l.orcamentos.total}
                      </td>
                      <td className="px-2 py-2.5 text-center text-primary/80">{l.orcamentos.diretos}</td>
                      <td className="px-2 py-2.5 text-center text-primary/80">{l.orcamentos.normais}</td>
                      <td className="px-2 py-2.5 text-center font-mono text-primary">
                        {formatarMoeda(l.orcamentos.valorTotal)}
                      </td>

                      <td className="border-l border-white/5 px-2 py-2.5 text-center text-primary">
                        {l.efetuados.total}
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono text-primary">
                        {formatarMoeda(l.efetuados.valorTotal)}
                      </td>

                      <td className="border-l border-white/5 px-2 py-2.5 text-center text-primary">
                        {l.tarefas.total}
                      </td>
                      {TAREFA_SITUACAO_OPCOES.map((s) => (
                        <td key={s} className="px-2 py-2.5 text-center text-primary/80">
                          {l.tarefas.porSituacao[s] ?? 0}
                        </td>
                      ))}

                      <td className="border-l border-white/5 px-2 py-2.5 text-center text-primary">
                        {l.interacoes.total}
                      </td>
                      {RESULTADO_INTERACAO_OPCOES.map((r) => (
                        <td key={r} className="px-2 py-2.5 text-center text-primary/80">
                          {l.interacoes.porResultado[r] ?? 0}
                        </td>
                      ))}

                      <td className="border-l border-white/5 px-2 py-2.5 text-center text-primary">
                        {l.chamadas.total}
                      </td>
                      <td className="px-2 py-2.5 text-center" style={{ color: '#2FAE66' }}>
                        {l.chamadas.atendidas}
                      </td>
                      <td className="px-2 py-2.5 text-center" style={{ color: '#F4B400' }}>
                        {l.chamadas.naoAtendidas}
                      </td>
                      <td className="px-2 py-2.5 text-center" style={{ color: '#3B7DD8' }}>
                        {l.chamadas.emAndamento}
                      </td>
                      <td className="px-2 py-2.5 text-center" style={{ color: '#E5484D' }}>
                        {l.chamadas.falhas}
                      </td>
                      <td className="px-2 py-2.5 text-center text-primary">
                        {formatarDuracao(l.chamadas.duracaoTotalSegundos)}
                      </td>

                      <td className="px-2 py-2.5 text-center text-muted">{aberto ? '▾' : '▸'}</td>
                    </tr>

                    {aberto && (
                      <tr className="border-t border-white/5 bg-surface-alt/40">
                        <td colSpan={25} className="px-4 py-4">
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                            <DetalhePainel titulo={`Orçamentos (${l.orcamentos.total})`}>
                              {l.orcamentos.lista.map((p) => (
                                <div key={p.id} className="text-xs text-primary/80">
                                  <span className="font-mono">#{p.numero}</span> — {p.clienteNome} ·{' '}
                                  {STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status}
                                  {p.orcamentoDireto && <span className="text-accent-compras"> · DIRETO</span>} ·{' '}
                                  {formatarMoeda(p.valor)} · {formatarData(p.criadoEm)}
                                </div>
                              ))}
                            </DetalhePainel>

                            <DetalhePainel titulo={`Pedidos efetuados (${l.efetuados.total})`}>
                              {l.efetuados.lista.map((p) => (
                                <div key={p.id} className="text-xs text-primary/80">
                                  <span className="font-mono">#{p.numero}</span> — {p.clienteNome} ·{' '}
                                  {formatarMoeda(p.valor)} · {formatarData(p.criadoEm)}
                                </div>
                              ))}
                            </DetalhePainel>

                            <DetalhePainel titulo={`Tarefas (${l.tarefas.total})`}>
                              {l.tarefas.lista.map((t) => (
                                <div key={t.id} className="text-xs text-primary/80">
                                  {t.descricao || '(sem descrição)'}
                                  {t.tipo && ` · ${t.tipo}`} · {t.situacao}
                                  {t.refLabel && ` · ${t.refLabel}`} · {formatarData(t.dataPrevista ?? t.criadoEm)}
                                </div>
                              ))}
                            </DetalhePainel>

                            <DetalhePainel titulo={`Interações (${l.interacoes.total})`}>
                              {l.interacoes.lista.map((i) => (
                                <div key={i.id} className="text-xs text-primary/80">
                                  {i.tipo} · {i.resultado}
                                  {i.refLabel && ` · ${i.refLabel}`} · {formatarData(i.criadoEm)}
                                  {i.observacao && (
                                    <span className="block text-muted/80">&ldquo;{i.observacao}&rdquo;</span>
                                  )}
                                </div>
                              ))}
                            </DetalhePainel>

                            <DetalhePainel titulo={`Chamadas (${l.chamadas.total})`}>
                              {l.chamadas.lista.map((c) => (
                                <div key={c.id} className="text-xs text-primary/80">
                                  {c.direcao === 'saida' ? '📤' : '📥'} {c.numero ?? '—'} ·{' '}
                                  {chamadaStatusLabel(c.status)} ·{' '}
                                  {c.duracaoSegundos ? formatarDuracao(c.duracaoSegundos) : '—'} ·{' '}
                                  {formatarData(c.iniciadaEm)}
                                </div>
                              ))}
                            </DetalhePainel>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function DetalhePainel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const temConteudo = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <div className="rounded-md border border-white/10 bg-surface p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{titulo}</p>
      {temConteudo ? (
        <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">{children}</div>
      ) : (
        <p className="text-xs text-muted/70">Nenhum registro no período.</p>
      )}
    </div>
  )
}
