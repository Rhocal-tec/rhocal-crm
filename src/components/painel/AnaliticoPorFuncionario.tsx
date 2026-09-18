'use client'

// Seção do Painel Gestor: analítico por funcionário — cruza orçamentos,
// pedidos efetuados, entregas, leads/oportunidades, tarefas, interações e
// chamadas, tudo agrupado por quem criou/registrou/atendeu/entregou cada um.
// Reaproveita o mesmo `range` de período do resto do Painel
// (src/app/painel/page.tsx) e a `empresaId` ativa.
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
// Apresentação: 7 tabelas compactas empilhadas (`BlocoAnalitico`), uma por
// categoria, em vez de uma tabela única com todas as colunas lado a lado —
// evita o scroll horizontal gigante. Os dados continuam vindo de um único
// carregamento/agregação (`AgregadoFuncionario` por funcionário); cada bloco
// só recorta as colunas e a lista de detalhe da sua própria categoria, com
// seu próprio estado de expandido. A busca por nome fica no componente pai e
// filtra `linhasFiltradas`, repassada igual a todos os blocos.
//
// Client Supabase compartilhado do app (mesma cautela do resto do Painel:
// nunca um createClient avulso de @supabase/supabase-js).

import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RangePeriodo } from '@/lib/kanban/periodo'
import { proximoDia } from '@/lib/kanban/filtro-data'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import { STATUS_LABELS } from '@/lib/kanban/status'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { TAREFA_SITUACAO_OPCOES } from '@/lib/tarefas/opcoes'
import { RESULTADO_INTERACAO_OPCOES } from '@/lib/interacoes/opcoes'
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

interface AgregadoFuncionario {
  id: string
  nome: string
  ativo: boolean
  orcamentos: { total: number; diretos: number; normais: number; valorTotal: number; lista: PedidoLinha[] }
  efetuados: { total: number; valorTotal: number; lista: PedidoLinha[] }
  entregas: { total: number; valorTotal: number; lista: EntregaLinha[] }
  oportunidades: { total: number; lista: OportunidadeLinha[] }
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

function novoAgregado(id: string, nome: string, ativo = true): AgregadoFuncionario {
  return {
    id,
    nome,
    ativo,
    orcamentos: { total: 0, diretos: 0, normais: 0, valorTotal: 0, lista: [] },
    efetuados: { total: 0, valorTotal: 0, lista: [] },
    entregas: { total: 0, valorTotal: 0, lista: [] },
    oportunidades: { total: 0, lista: [] },
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

export default function AnaliticoPorFuncionario({ range, empresaId }: { range: RangePeriodo; empresaId: string }) {
  const [supabase] = useState(() => createClient())
  const [linhas, setLinhas] = useState<AgregadoFuncionario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    let ativo = true

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
        if (range.inicio && range.fim) {
          queryTarefas = queryTarefas.or(
            `data_prevista.is.null,and(data_prevista.gte.${range.inicio},data_prevista.lte.${range.fim})`,
          )
        } else if (range.inicio) {
          queryTarefas = queryTarefas.or(`data_prevista.is.null,data_prevista.gte.${range.inicio}`)
        } else if (range.fim) {
          queryTarefas = queryTarefas.or(`data_prevista.is.null,data_prevista.lte.${range.fim}`)
        }

        let queryInteracoes = supabase
          .from('interacoes')
          .select('id, oportunidade_id, pedido_id, tipo, resultado, observacao, registrado_por, criado_em')
        if (range.inicio) queryInteracoes = queryInteracoes.gte('criado_em', `${range.inicio}T00:00:00`)
        if (range.fim) queryInteracoes = queryInteracoes.lt('criado_em', `${proximoDia(range.fim)}T00:00:00`)

        // Inclui também chamadas sem empresa_id identificada (mesmo
        // raciocínio de ChamadasPorFuncionario.tsx/ChamadasSemEmpresa.tsx) —
        // sabemos quem fez a ligação mesmo sem saber a empresa, então elas
        // aparecem em qualquer empresa ativa em vez de sumir do analítico. O
        // indicador visual no drill-down abaixo deixa claro quais são.
        let queryChamadas = supabase
          .from('chamadas')
          .select(
            'id, usuario_id, direcao, status, numero_origem, numero_destino, duracao_segundos, iniciada_em, oportunidade_id, empresa_id',
          )
          .or(`empresa_id.eq.${empresaId},empresa_id.is.null`)
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
          supabase.from('profiles').select('id, nome, ativo'),
          supabase
            .from('pedidos')
            .select('id, numero, cliente_nome, status, orcamento_direto, criado_por, criado_em, movido_por, entregue_em')
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
        const pedidosNoPeriodo = pedidosTodos.filter((p) => dentroDoPeriodo(p.criado_em, range.inicio, range.fim))
        const idsPedidosNoPeriodo = pedidosNoPeriodo.map((p) => p.id)

        // Entregas: recorte por período aplicado sobre `entregue_em` (quando a
        // entrega aconteceu), não `criado_em` (quando o orçamento nasceu) — um
        // pedido pode ter sido criado num mês e entregue só num período
        // seguinte, mesmo raciocínio já usado pra tarefas (data_prevista).
        const pedidosEntreguesNoPeriodo = pedidosTodos.filter(
          (p) => p.status === 'ENTREGUE' && p.entregue_em && dentroDoPeriodo(p.entregue_em, range.inicio, range.fim),
        )
        const idsPedidosEntreguesNoPeriodo = pedidosEntreguesNoPeriodo.map((p) => p.id)

        // Mesma lógica: oportunidades buscadas sem filtro server-side (o
        // conjunto completo já serve pra resolver refLabel de tarefas/
        // interações e o nome do cliente nas chamadas, fora do período), o
        // recorte pro agregado por funcionário é feito aqui em JS.
        const oportunidadesNoPeriodo = oportunidadesTodas.filter((o) =>
          dentroDoPeriodo(o.criado_em, range.inicio, range.fim),
        )

        // União dos pedidos que precisam de valor de itens: orçamentos/
        // efetuados no período de criação + entregas no período de entrega
        // (podem não se sobrepor, já que usam campos de data diferentes).
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

          // ENTREGUE conta aqui também — pedido entregue já passou por
          // PEDIDO_EFETUADO antes, só avançou mais uma etapa; sem isso, ele
          // desaparecia do bloco assim que fosse marcado como entregue.
          if (pedido.status === 'PEDIDO_EFETUADO' || pedido.status === 'ENTREGUE') {
            agregado.efetuados.total += 1
            agregado.efetuados.valorTotal += valor
            agregado.efetuados.lista.push(linha)
          }
        }

        // 3) Entregas — agrupadas por movido_por (quem de fato clicou em
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

        // 4) Leads/Oportunidades — agrupadas por criado_por (nunca nulo em
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

        // 5) Tarefas — agrupadas por responsavel (nulo vira "Não atribuído",
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

        // 6) Interações — agrupadas por registrado_por (nunca nulo).
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

        // 7) Chamadas — agrupadas por usuario_id (nulo vira "Não atribuído").
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

        const resultado = Array.from(mapa.values())
          .filter((a) => {
            if (a.id !== SEM_ATRIBUICAO_ID) return true
            // "Não atribuído" só aparece se tiver alguma atividade de fato.
            return (
              a.tarefas.total > 0 ||
              a.chamadas.total > 0 ||
              a.interacoes.total > 0 ||
              a.orcamentos.total > 0 ||
              a.oportunidades.total > 0 ||
              a.entregas.total > 0
            )
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

  return (
    <section className="print-analitico-funcionario rounded-lg border border-white/10 bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
        <div className="space-y-4">
          <BlocoAnalitico
            titulo={`Orçamentos (${somarCampo(linhasFiltradas, (l) => l.orcamentos.total)})`}
            linhas={linhasFiltradas}
            temAtividade={(l) => l.orcamentos.total > 0}
            colunas={[
              {
                key: 'total',
                header: 'Total',
                headerClassName: 'border-l border-white/10 text-center',
                cellClassName: 'border-l border-white/5 text-center text-primary',
                render: (l) => l.orcamentos.total,
              },
              {
                key: 'diretos',
                header: 'Diretos',
                headerClassName: 'text-center',
                cellClassName: 'text-center text-primary/80',
                render: (l) => l.orcamentos.diretos,
              },
              {
                key: 'normais',
                header: 'Normais',
                headerClassName: 'text-center',
                cellClassName: 'text-center text-primary/80',
                render: (l) => l.orcamentos.normais,
              },
              {
                key: 'valor',
                header: 'Valor',
                headerClassName: 'text-center',
                cellClassName: 'text-center font-mono text-primary',
                render: (l) => formatarMoeda(l.orcamentos.valorTotal),
              },
            ]}
            renderDetalhe={(l) => (
              <ListaDetalhe
                itens={l.orcamentos.lista.map((p) => (
                  <div key={p.id} className="text-xs text-primary/80">
                    <span className="font-mono">#{p.numero}</span> — {p.clienteNome} ·{' '}
                    {STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status}
                    {p.orcamentoDireto && <span className="text-accent-compras"> · DIRETO</span>} ·{' '}
                    {formatarMoeda(p.valor)} · {formatarData(p.criadoEm)}
                  </div>
                ))}
              />
            )}
          />

          <BlocoAnalitico
            titulo={`Pedidos efetuados (${somarCampo(linhasFiltradas, (l) => l.efetuados.total)})`}
            linhas={linhasFiltradas}
            temAtividade={(l) => l.efetuados.total > 0}
            colunas={[
              {
                key: 'qtd',
                header: 'Qtd.',
                headerClassName: 'border-l border-white/10 text-center',
                cellClassName: 'border-l border-white/5 text-center text-primary',
                render: (l) => l.efetuados.total,
              },
              {
                key: 'valor',
                header: 'Valor',
                headerClassName: 'text-center',
                cellClassName: 'text-center font-mono text-primary',
                render: (l) => formatarMoeda(l.efetuados.valorTotal),
              },
            ]}
            renderDetalhe={(l) => (
              <ListaDetalhe
                itens={l.efetuados.lista.map((p) => (
                  <div key={p.id} className="text-xs text-primary/80">
                    <span className="font-mono">#{p.numero}</span> — {p.clienteNome} ·{' '}
                    {formatarMoeda(p.valor)} · {formatarData(p.criadoEm)}
                  </div>
                ))}
              />
            )}
          />

          <BlocoAnalitico
            titulo={`Entregues (${somarCampo(linhasFiltradas, (l) => l.entregas.total)})`}
            linhas={linhasFiltradas}
            temAtividade={(l) => l.entregas.total > 0}
            colunas={[
              {
                key: 'qtd',
                header: 'Qtd.',
                headerClassName: 'border-l border-white/10 text-center',
                cellClassName: 'border-l border-white/5 text-center text-primary',
                render: (l) => l.entregas.total,
              },
              {
                key: 'valor',
                header: 'Valor',
                headerClassName: 'text-center',
                cellClassName: 'text-center font-mono text-primary',
                render: (l) => formatarMoeda(l.entregas.valorTotal),
              },
            ]}
            renderDetalhe={(l) => (
              <ListaDetalhe
                itens={l.entregas.lista.map((e) => (
                  <div key={e.id} className="text-xs text-primary/80">
                    <span className="font-mono">#{e.numero}</span> — {e.clienteNome} ·{' '}
                    {formatarMoeda(e.valor)} · entregue em {formatarData(e.entregueEm)}
                  </div>
                ))}
              />
            )}
          />

          <BlocoAnalitico
            titulo={`Tarefas (${somarCampo(linhasFiltradas, (l) => l.tarefas.total)})`}
            linhas={linhasFiltradas}
            temAtividade={(l) => l.tarefas.total > 0}
            colunas={[
              {
                key: 'total',
                header: 'Total',
                headerClassName: 'border-l border-white/10 text-center',
                cellClassName: 'border-l border-white/5 text-center text-primary',
                render: (l) => l.tarefas.total,
              },
              ...TAREFA_SITUACAO_OPCOES.map((s) => ({
                key: `situacao-${s}`,
                header: s,
                headerClassName: 'text-center',
                cellClassName: 'text-center text-primary/80',
                render: (l: AgregadoFuncionario) => l.tarefas.porSituacao[s] ?? 0,
              })),
            ]}
            renderDetalhe={(l) => (
              <ListaDetalhe
                itens={l.tarefas.lista.map((t) => (
                  <div key={t.id} className="text-xs text-primary/80">
                    {t.descricao || '(sem descrição)'}
                    {t.tipo && ` · ${t.tipo}`} · {t.situacao}
                    {t.refLabel && ` · ${t.refLabel}`} · {formatarData(t.dataPrevista ?? t.criadoEm)}
                  </div>
                ))}
              />
            )}
          />

          <BlocoAnalitico
            titulo={`Interações (${somarCampo(linhasFiltradas, (l) => l.interacoes.total)})`}
            linhas={linhasFiltradas}
            temAtividade={(l) => l.interacoes.total > 0}
            colunas={[
              {
                key: 'total',
                header: 'Total',
                headerClassName: 'border-l border-white/10 text-center',
                cellClassName: 'border-l border-white/5 text-center text-primary',
                render: (l) => l.interacoes.total,
              },
              ...RESULTADO_INTERACAO_OPCOES.map((r) => ({
                key: `resultado-${r}`,
                header: r,
                headerClassName: 'text-center',
                cellClassName: 'text-center text-primary/80',
                render: (l: AgregadoFuncionario) => l.interacoes.porResultado[r] ?? 0,
              })),
            ]}
            renderDetalhe={(l) => (
              <ListaDetalhe
                itens={l.interacoes.lista.map((i) => (
                  <div key={i.id} className="text-xs text-primary/80">
                    {i.tipo} · {i.resultado}
                    {i.refLabel && ` · ${i.refLabel}`} · {formatarData(i.criadoEm)}
                    {i.observacao && <span className="block text-muted/80">&ldquo;{i.observacao}&rdquo;</span>}
                  </div>
                ))}
              />
            )}
          />

          <BlocoAnalitico
            titulo={`Chamadas (${somarCampo(linhasFiltradas, (l) => l.chamadas.total)})`}
            linhas={linhasFiltradas}
            temAtividade={(l) => l.chamadas.total > 0}
            colunas={[
              {
                key: 'total',
                header: 'Total',
                headerClassName: 'border-l border-white/10 text-center',
                cellClassName: 'border-l border-white/5 text-center text-primary',
                render: (l) => l.chamadas.total,
              },
              {
                key: 'atendidas',
                header: 'Atend.',
                headerClassName: 'text-center',
                cellClassName: 'text-center',
                render: (l) => <span style={{ color: '#2FAE66' }}>{l.chamadas.atendidas}</span>,
              },
              {
                key: 'naoAtendidas',
                header: 'Não atend.',
                headerClassName: 'text-center',
                cellClassName: 'text-center',
                render: (l) => <span style={{ color: '#F4B400' }}>{l.chamadas.naoAtendidas}</span>,
              },
              {
                key: 'emAndamento',
                header: 'Andamento',
                headerClassName: 'text-center',
                cellClassName: 'text-center',
                render: (l) => <span style={{ color: '#3B7DD8' }}>{l.chamadas.emAndamento}</span>,
              },
              {
                key: 'falhas',
                header: 'Falhas',
                headerClassName: 'text-center',
                cellClassName: 'text-center',
                render: (l) => <span style={{ color: '#E5484D' }}>{l.chamadas.falhas}</span>,
              },
              {
                key: 'duracao',
                header: 'Duração',
                headerClassName: 'text-center',
                cellClassName: 'text-center text-primary',
                render: (l) => formatarDuracao(l.chamadas.duracaoTotalSegundos),
              },
            ]}
            renderDetalhe={(l) => (
              <ListaDetalhe
                itens={l.chamadas.lista.map((c) => (
                  <div key={c.id} className="text-xs text-primary/80">
                    {c.direcao === 'saida' ? '📤' : '📥'} {c.numero ?? '—'}
                    {c.clienteNome && ` — ${c.clienteNome}`} · {chamadaStatusLabel(c.status)} ·{' '}
                    {c.duracaoSegundos ? formatarDuracao(c.duracaoSegundos) : '—'} ·{' '}
                    {formatarDataHoraChamada(c.iniciadaEm)}
                    {!c.empresaId && (
                      <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-muted">
                        empresa não identificada
                      </span>
                    )}
                  </div>
                ))}
              />
            )}
          />

          <BlocoAnalitico
            titulo={`Leads/Oportunidades (${somarCampo(linhasFiltradas, (l) => l.oportunidades.total)})`}
            linhas={linhasFiltradas}
            temAtividade={(l) => l.oportunidades.total > 0}
            colunas={[
              {
                key: 'total',
                header: 'Total',
                headerClassName: 'border-l border-white/10 text-center',
                cellClassName: 'border-l border-white/5 text-center text-primary',
                render: (l) => l.oportunidades.total,
              },
            ]}
            renderDetalhe={(l) => (
              <ListaDetalhe
                itens={l.oportunidades.lista.map((o) => (
                  <div key={o.id} className="text-xs text-primary/80">
                    <span className="font-mono">#{o.numero}</span> — {o.clienteNome}
                    {o.clienteTelefone && <span className="font-mono"> · {o.clienteTelefone}</span>} ·{' '}
                    {OPORTUNIDADE_STATUS_LABELS[o.status as keyof typeof OPORTUNIDADE_STATUS_LABELS] ?? o.status} ·{' '}
                    {formatarData(o.criadoEm)}
                  </div>
                ))}
              />
            )}
          />
        </div>
      )}
    </section>
  )
}

function somarCampo(linhas: AgregadoFuncionario[], campo: (l: AgregadoFuncionario) => number): number {
  return linhas.reduce((acc, l) => acc + campo(l), 0)
}

interface ColunaBloco {
  key: string
  header: React.ReactNode
  headerClassName: string
  cellClassName: string
  render: (l: AgregadoFuncionario) => React.ReactNode
}

// Uma tabela compacta e independente por categoria (fase de reestruturação
// visual do Analítico — antes era uma única tabela gigante com todas as
// categorias lado a lado, precisando de scroll horizontal). Cada bloco
// controla seu próprio estado de expandido/drill-down, isolado dos demais —
// expandir uma linha em "Chamadas" não afeta "Orçamentos" pro mesmo
// funcionário. `linhas` já vem filtrada pela busca (um campo só, no
// componente pai, reaplicado a todos os blocos ao mesmo tempo).
function BlocoAnalitico({
  titulo,
  linhas,
  colunas,
  renderDetalhe,
  temAtividade,
}: {
  titulo: string
  linhas: AgregadoFuncionario[]
  colunas: ColunaBloco[]
  renderDetalhe: (l: AgregadoFuncionario) => React.ReactNode
  // Decide, por linha, se o funcionário teve atividade NESSA categoria no
  // período — cada bloco passa seu próprio critério (ex: l.tarefas.total > 0),
  // então a mesma pessoa pode aparecer destacada num bloco e apagada noutro.
  temAtividade: (l: AgregadoFuncionario) => boolean
}) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  function alternar(id: string) {
    setExpandidos((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  return (
    <div className="rounded-lg border border-white/10 bg-surface-alt/20 p-3">
      <h4 className="mb-2 text-sm font-medium text-primary">{titulo}</h4>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Funcionário</th>
              {colunas.map((c) => (
                <th key={c.key} className={`px-2 py-1.5 font-medium ${c.headerClassName}`}>
                  {c.header}
                </th>
              ))}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const aberto = expandidos.has(l.id)
              const ativoNoBloco = temAtividade(l)
              return (
                <Fragment key={l.id}>
                  <tr
                    onClick={() => alternar(l.id)}
                    className={`cursor-pointer border-t border-white/5 transition-colors hover:bg-white/5 ${
                      ativoNoBloco ? 'bg-white/[0.04]' : 'opacity-50'
                    }`}
                  >
                    <td className="px-3 py-2.5 font-medium text-primary">
                      {l.nome}
                      {!l.ativo && <span className="ml-1.5 font-normal text-muted">(inativo)</span>}
                    </td>
                    {colunas.map((c) => (
                      <td key={c.key} className={`px-2 py-2.5 ${c.cellClassName}`}>
                        {c.render(l)}
                      </td>
                    ))}
                    <td className="px-2 py-2.5 text-center text-muted">{aberto ? '▾' : '▸'}</td>
                  </tr>

                  {aberto && (
                    <tr className="border-t border-white/5 bg-surface-alt/40">
                      <td colSpan={colunas.length + 2} className="px-4 py-3">
                        {renderDetalhe(l)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ListaDetalhe({ itens }: { itens: React.ReactNode[] }) {
  if (itens.length === 0) {
    return <p className="text-xs text-muted/70">Nenhum registro no período.</p>
  }
  return <div className="print-scroll-livre max-h-64 space-y-1.5 overflow-y-auto pr-1">{itens}</div>
}
