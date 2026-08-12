import { diasSemMovimentacao } from '@/lib/kanban/dias-parado'
import type { OportunidadeStatus, PedidoStatus } from '@/types/database'

// Fase 35: segmentação RFM (Recência/Frequência/Valor) cruzando clientes +
// oportunidades + pedidos + interações. Ver CLAUDE.md pros limiares de
// temperatura e as decisões de escopo (o que conta como "compra", como o
// cliente é identificado sem FK direta entre as tabelas).

export type TemperaturaAutomatica = 'verde' | 'amarelo' | 'vermelho' | 'cinza'

export const TEMPERATURA_AUTOMATICA_LABELS: Record<TemperaturaAutomatica, string> = {
  verde: 'Quente',
  amarelo: 'Morno',
  vermelho: 'Frio',
  cinza: 'Sem histórico',
}

// Fase 35 (expansão): 90/180 dias — substituem os limiares 30/90 da versão
// original, ajustados pro ciclo de recompra real de EPI (mais espaçado que
// uma venda de varejo comum).
const LIMITE_VERDE_DIAS = 90
const LIMITE_AMARELO_DIAS = 180

// Reexportado com um nome mais genérico — usado também pelo filtro de "última
// compra" (faixas de 30/60/90/180 dias), fora do cálculo de temperatura.
export const diasDesde = diasSemMovimentacao

export function calcularTemperaturaAutomatica(ultimaCompra: string | null): TemperaturaAutomatica {
  if (!ultimaCompra) return 'cinza'
  const dias = diasDesde(ultimaCompra)
  if (dias < LIMITE_VERDE_DIAS) return 'verde'
  if (dias <= LIMITE_AMARELO_DIAS) return 'amarelo'
  return 'vermelho'
}

// Fase 36.1: score de propensão à compra (0-100) — 4 fatores ponderados
// (frequência 30%, recência 35%, valor 25%, temperatura da oportunidade
// 10%), cada fator normalizado pra 0-100 antes de aplicar o peso. Pesos e
// limiares são decisão de produto desta fase, ajustável depois — ver
// CLAUDE.md pro racional de cada normalização.
export const PESOS_SCORE_PROPENSAO = {
  frequencia: 0.3,
  recencia: 0.35,
  valor: 0.25,
  temperatura: 0.1,
}

const FREQUENCIA_TETO_PEDIDOS = 10
const RECENCIA_TETO_DIAS = 365

const TEMPERATURA_MANUAL_SCORE: Record<string, number> = {
  Quente: 100,
  Morno: 50,
  Frio: 0,
}
// Sem oportunidade ou com valor livre não mapeado: neutro — não penaliza a
// falta do dado como se fosse "Frio".
const TEMPERATURA_MANUAL_SCORE_PADRAO = 50

function calcularScoreRecencia(diasDesdeUltimaCompra: number | null): number {
  if (diasDesdeUltimaCompra === null) return 0
  const score = 100 - (diasDesdeUltimaCompra / RECENCIA_TETO_DIAS) * 100
  return Math.round(Math.max(0, Math.min(100, score)))
}

function calcularScoreFrequencia(qtdPedidosEfetuados: number): number {
  return Math.round(Math.min(qtdPedidosEfetuados / FREQUENCIA_TETO_PEDIDOS, 1) * 100)
}

function calcularScoreValor(valorTotalAcumulado: number, maiorValorTotalAcumulado: number): number {
  if (maiorValorTotalAcumulado <= 0) return 0
  return Math.round(Math.min(valorTotalAcumulado / maiorValorTotalAcumulado, 1) * 100)
}

function calcularScoreTemperatura(temperaturaManual: string | null): number {
  if (!temperaturaManual) return TEMPERATURA_MANUAL_SCORE_PADRAO
  return TEMPERATURA_MANUAL_SCORE[temperaturaManual] ?? TEMPERATURA_MANUAL_SCORE_PADRAO
}

function calcularScorePropensao(params: {
  diasDesdeUltimaCompra: number | null
  qtdPedidosEfetuados: number
  valorTotalAcumulado: number
  maiorValorTotalAcumulado: number
  temperaturaManual: string | null
}): number {
  const total =
    calcularScoreFrequencia(params.qtdPedidosEfetuados) * PESOS_SCORE_PROPENSAO.frequencia +
    calcularScoreRecencia(params.diasDesdeUltimaCompra) * PESOS_SCORE_PROPENSAO.recencia +
    calcularScoreValor(params.valorTotalAcumulado, params.maiorValorTotalAcumulado) * PESOS_SCORE_PROPENSAO.valor +
    calcularScoreTemperatura(params.temperaturaManual) * PESOS_SCORE_PROPENSAO.temperatura

  return Math.round(Math.max(0, Math.min(100, total)))
}

// Reaproveita o mesmo tipo/paleta da temperatura automática (verde/amarelo/
// vermelho) pro badge de score — nunca produz 'cinza'.
export function faixaDoScorePropensao(score: number): TemperaturaAutomatica {
  if (score >= 70) return 'verde'
  if (score >= 40) return 'amarelo'
  return 'vermelho'
}

// Fase 36.2: alerta de churn — mesma técnica de intervalo médio já usada no
// Motor de Recompra Preditiva (src/lib/recompra/calculo-recorrencia.ts):
// média dos intervalos, em dias, entre compras consecutivas — só que
// calculada por CLIENTE (sobre as datas de efetuação de cada pedido) em vez
// de por item/categoria. Exige pelo menos 2 pedidos efetuados; sem isso não
// há base pra média e o cliente não entra no cálculo de risco.
export const MULTIPLICADOR_ALERTA_CHURN = 1.5

function calcularIntervaloMedioDiasCompra(datasEfetuacaoAsc: string[]): number | null {
  if (datasEfetuacaoAsc.length < 2) return null
  const intervalos: number[] = []
  for (let i = 1; i < datasEfetuacaoAsc.length; i++) {
    const dias =
      (new Date(datasEfetuacaoAsc[i]).getTime() - new Date(datasEfetuacaoAsc[i - 1]).getTime()) /
      (1000 * 60 * 60 * 24)
    intervalos.push(dias)
  }
  return Math.round(intervalos.reduce((soma, n) => soma + n, 0) / intervalos.length)
}

export interface PedidoInteligencia {
  id: string
  numero: number
  status: PedidoStatus
  criado_em: string
  criado_por: string
  total: number
  dataEfetuacao: string | null
}

export interface ItemMaisComprado {
  descricao: string
  quantidade: number
}

export interface OportunidadeInteligencia {
  id: string
  numero: number
  status: OportunidadeStatus
  origem: string | null
  temperatura: string | null
  valor_estimado: number | null
  criado_em: string
  criado_por: string
}

export interface TarefaInteligencia {
  id: string
  descricao: string
  data_prevista: string | null
  responsavel: string | null
}

export interface InteracaoInteligencia {
  id: string
  tipo: string
  resultado: string
  criado_em: string
}

export interface ClienteInteligencia {
  chave: string
  clienteId: string | null
  nome: string
  razaoSocial: string | null
  nomeFantasia: string | null
  cnpj: string | null
  email: string | null
  telefone: string | null
  contato: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  observacoes: string | null

  temperaturaAutomatica: TemperaturaAutomatica
  temperaturaManual: string | null
  etapaFunil: OportunidadeStatus | null
  origem: string | null
  valorEstimadoAberto: number
  oportunidadeCriadaEm: string | null
  vendedorId: string | null
  vendedorNome: string | null

  ultimaCompra: string | null
  qtdPedidosTotal: number
  qtdPedidosEfetuados: number
  ticketMedio: number | null
  valorTotalAcumulado: number
  itensMaisComprados: ItemMaisComprado[]

  qtdInteracoes: number
  tipoInteracaoMaisUsado: string | null
  ultimoContato: string | null

  // Fase 36.1
  scorePropensao: number
  faixaScorePropensao: TemperaturaAutomatica

  // Fase 36.2
  diasDesdeUltimaCompra: number | null
  intervaloMedioDiasCompra: number | null
  emRiscoChurn: boolean
  // Vínculo sugerido pra "Criar tarefa" a partir do alerta de churn:
  // oportunidade aberta mais recente, senão pedido mais recente.
  vinculoTarefaTipo: 'oportunidade' | 'pedido' | null
  vinculoTarefaId: string | null

  // Fase 36.3 — pra registrar cliente_omie_codigo em campanha_clientes
  omieClienteId: number | null

  historicoPedidos: PedidoInteligencia[]
  oportunidadesAbertas: OportunidadeInteligencia[]
  tarefasPendentes: TarefaInteligencia[]
  interacoes: InteracaoInteligencia[]
}

// --- Entradas cruas (o formato que sai direto do Supabase) ---

export interface PedidoBruto {
  id: string
  numero: number
  cliente_nome: string
  cliente_cnpj: string | null
  cliente_omie_id: number | null
  status: PedidoStatus
  criado_em: string
  criado_por: string
  valor_frete: number | null
}

export interface ItemBruto {
  pedido_id: string
  descricao: string
  preco_venda: number | string | null
  quantidade: number | string
}

// Evento de auditoria já filtrado pra tabela `pedidos` — usado só pra
// reconstruir a primeira transição pra PEDIDO_EFETUADO (ver CLAUDE.md).
export interface AuditoriaPedidoBruta {
  registro_id: string
  data_hora: string
  status_depois: string | null
}

export interface OportunidadeBruta {
  id: string
  numero: number
  cliente_nome: string
  cliente_cnpj: string | null
  status: OportunidadeStatus
  origem: string | null
  temperatura: string | null
  valor_estimado: number | null
  criado_em: string
  criado_por: string
}

export interface TarefaBruta {
  id: string
  oportunidade_id: string | null
  pedido_id: string | null
  descricao: string
  data_prevista: string | null
  situacao: string
  responsavel: string | null
}

export interface InteracaoBruta {
  id: string
  oportunidade_id: string | null
  pedido_id: string | null
  tipo: string
  resultado: string
  criado_em: string
}

export interface ClienteCadastroBruto {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  email: string | null
  telefone: string | null
  contato: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  observacoes: string | null
  omie_cliente_id: number | null
}

function normalizarNome(nome: string): string {
  return nome.trim().toLowerCase()
}

function chaveOmie(id: number): string {
  return `omie:${id}`
}

function chaveCnpj(digitos: string): string {
  return `cnpj:${digitos}`
}

function cnpjDigitosDe(cnpjBruto: string | null): string | null {
  const digitos = (cnpjBruto ?? '').replace(/\D/g, '')
  return digitos.length === 14 ? digitos : null
}

// --- Union-Find: uma mesma pessoa jurídica pode aparecer com identificadores
// diferentes em registros diferentes (ex: um pedido só tem cliente_omie_id, uma
// oportunidade do mesmo cliente só tem cliente_cnpj). Nenhuma tabela tem FK
// direta pra outra — a junção é reconstruída em memória, priorizando
// cliente_omie_id quando disponível e caindo pra CNPJ/nome como fallback (ver
// CLAUDE.md). Qualquer registro que carregue DOIS identificadores ao mesmo
// tempo (um cadastro em `clientes` com omie_cliente_id e cnpj preenchidos, ou
// um pedido com cliente_omie_id e cliente_cnpj preenchidos) serve de "ponte"
// entre os dois espaços de chave.
class UnionFind {
  private pai = new Map<string, string>()

  private raiz(x: string): string {
    if (!this.pai.has(x)) this.pai.set(x, x)
    let atual = x
    while (this.pai.get(atual) !== atual) atual = this.pai.get(atual) as string
    // compressão de caminho
    let cursor = x
    while (this.pai.get(cursor) !== atual) {
      const proximo = this.pai.get(cursor) as string
      this.pai.set(cursor, atual)
      cursor = proximo
    }
    return atual
  }

  unir(a: string, b: string) {
    const ra = this.raiz(a)
    const rb = this.raiz(b)
    if (ra !== rb) this.pai.set(ra, rb)
  }

  encontrar(x: string): string {
    return this.raiz(x)
  }
}

interface Acumulador {
  chave: string
  nome: string
  nomeAtualizadoEm: string
  clienteId: string | null
  pedidos: PedidoInteligencia[]
  oportunidades: OportunidadeInteligencia[]
  vendedorId: string | null
  vendedorAtualizadoEm: string
  omieClienteId: number | null
  omieClienteIdAtualizadoEm: string
}

// Reconstrói, a partir do audit_log já ordenado por data_hora crescente, a
// primeira vez que cada pedido entrou em PEDIDO_EFETUADO — mesma técnica já
// usada no Painel executivo (fase 14) pra tempo médio por etapa/conversão.
function calcularPrimeiraEfetuacaoPorPedido(eventos: AuditoriaPedidoBruta[]): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const evento of eventos) {
    if (evento.status_depois !== 'PEDIDO_EFETUADO') continue
    if (mapa.has(evento.registro_id)) continue
    mapa.set(evento.registro_id, evento.data_hora)
  }
  return mapa
}

export function agregarClientesInteligencia(params: {
  pedidos: PedidoBruto[]
  itens: ItemBruto[]
  auditoriaPedidos: AuditoriaPedidoBruta[]
  oportunidades: OportunidadeBruta[]
  tarefas: TarefaBruta[]
  interacoes: InteracaoBruta[]
  clientesCadastro: ClienteCadastroBruto[]
  nomesPorProfileId: Record<string, string>
}): ClienteInteligencia[] {
  const {
    pedidos,
    itens,
    auditoriaPedidos,
    oportunidades,
    tarefas,
    interacoes,
    clientesCadastro,
    nomesPorProfileId,
  } = params

  // === 1) Une os espaços de chave (omie/cnpj) usando os registros que
  // carregam mais de um identificador ao mesmo tempo. ===
  const uf = new UnionFind()
  for (const c of clientesCadastro) {
    const cnpj = cnpjDigitosDe(c.cnpj)
    if (c.omie_cliente_id !== null && cnpj) uf.unir(chaveOmie(c.omie_cliente_id), chaveCnpj(cnpj))
  }
  for (const p of pedidos) {
    const cnpj = cnpjDigitosDe(p.cliente_cnpj)
    if (p.cliente_omie_id !== null && cnpj) uf.unir(chaveOmie(p.cliente_omie_id), chaveCnpj(cnpj))
  }

  // === 2) Resolve a chave de grupo de cada registro: omie > cnpj > nome. ===
  function chaveDoRegistro(omieId: number | null, cnpjBruto: string | null, nome: string): string {
    if (omieId !== null) return uf.encontrar(chaveOmie(omieId))
    const cnpj = cnpjDigitosDe(cnpjBruto)
    if (cnpj) return uf.encontrar(chaveCnpj(cnpj))
    return `nome:${normalizarNome(nome)}`
  }

  const totalPorPedido = new Map<string, number>()
  const itensPorPedido = new Map<string, ItemBruto[]>()
  for (const item of itens) {
    const subtotal = Number(item.preco_venda ?? 0) * Number(item.quantidade)
    totalPorPedido.set(item.pedido_id, (totalPorPedido.get(item.pedido_id) ?? 0) + subtotal)
    const lista = itensPorPedido.get(item.pedido_id) ?? []
    lista.push(item)
    itensPorPedido.set(item.pedido_id, lista)
  }

  const dataEfetuacaoPorPedido = calcularPrimeiraEfetuacaoPorPedido(auditoriaPedidos)

  const acumuladores = new Map<string, Acumulador>()

  function acumuladorDe(chave: string, nome: string, dataReferencia: string): Acumulador {
    const existente = acumuladores.get(chave)
    if (existente) return existente
    const novo: Acumulador = {
      chave,
      nome,
      nomeAtualizadoEm: dataReferencia,
      clienteId: null,
      pedidos: [],
      oportunidades: [],
      vendedorId: null,
      vendedorAtualizadoEm: '',
      omieClienteId: null,
      omieClienteIdAtualizadoEm: '',
    }
    acumuladores.set(chave, novo)
    return novo
  }

  // === 3) Semeia um acumulador pra CADA cliente cadastrado (fase 34), mesmo
  // que ainda não tenha pedido/oportunidade nenhum — "todos os dados do
  // sistema acessíveis" inclui cadastros sem histórico ainda. ===
  const cadastroPorChave = new Map<string, ClienteCadastroBruto>()
  for (const c of clientesCadastro) {
    const chave = chaveDoRegistro(c.omie_cliente_id, c.cnpj, c.nome_fantasia || c.razao_social)
    cadastroPorChave.set(chave, c)
    // Sentinela "menor que qualquer criado_em real" (formato ISO sempre
    // começa com o ano, ex: "2024-...") — garante que o primeiro pedido ou
    // oportunidade encontrado depois sobrescreva esse nome provisório.
    const acc = acumuladorDe(chave, c.nome_fantasia || c.razao_social, '0000')
    acc.clienteId = c.id
  }

  for (const pedido of pedidos) {
    const chave = chaveDoRegistro(pedido.cliente_omie_id, pedido.cliente_cnpj, pedido.cliente_nome)
    const acc = acumuladorDe(chave, pedido.cliente_nome, pedido.criado_em)

    if (pedido.criado_em >= acc.nomeAtualizadoEm) {
      acc.nome = pedido.cliente_nome
      acc.nomeAtualizadoEm = pedido.criado_em
    }
    if (pedido.criado_em >= acc.vendedorAtualizadoEm) {
      acc.vendedorId = pedido.criado_por
      acc.vendedorAtualizadoEm = pedido.criado_em
    }
    if (pedido.cliente_omie_id !== null && pedido.criado_em >= acc.omieClienteIdAtualizadoEm) {
      acc.omieClienteId = pedido.cliente_omie_id
      acc.omieClienteIdAtualizadoEm = pedido.criado_em
    }

    const total = (totalPorPedido.get(pedido.id) ?? 0) + Number(pedido.valor_frete ?? 0)
    acc.pedidos.push({
      id: pedido.id,
      numero: pedido.numero,
      status: pedido.status,
      criado_em: pedido.criado_em,
      criado_por: pedido.criado_por,
      total,
      dataEfetuacao: dataEfetuacaoPorPedido.get(pedido.id) ?? null,
    })
  }

  for (const oportunidade of oportunidades) {
    const chave = chaveDoRegistro(null, oportunidade.cliente_cnpj, oportunidade.cliente_nome)
    const acc = acumuladorDe(chave, oportunidade.cliente_nome, oportunidade.criado_em)

    if (oportunidade.criado_em >= acc.nomeAtualizadoEm) {
      acc.nome = oportunidade.cliente_nome
      acc.nomeAtualizadoEm = oportunidade.criado_em
    }
    if (oportunidade.criado_em >= acc.vendedorAtualizadoEm) {
      acc.vendedorId = oportunidade.criado_por
      acc.vendedorAtualizadoEm = oportunidade.criado_em
    }

    acc.oportunidades.push({
      id: oportunidade.id,
      numero: oportunidade.numero,
      status: oportunidade.status,
      origem: oportunidade.origem,
      temperatura: oportunidade.temperatura,
      valor_estimado: oportunidade.valor_estimado,
      criado_em: oportunidade.criado_em,
      criado_por: oportunidade.criado_por,
    })
  }

  const tarefasPorOportunidade = new Map<string, TarefaBruta[]>()
  const tarefasPorPedido = new Map<string, TarefaBruta[]>()
  for (const tarefa of tarefas) {
    if (tarefa.situacao === 'Realizada') continue
    if (tarefa.oportunidade_id) {
      const lista = tarefasPorOportunidade.get(tarefa.oportunidade_id) ?? []
      lista.push(tarefa)
      tarefasPorOportunidade.set(tarefa.oportunidade_id, lista)
    }
    if (tarefa.pedido_id) {
      const lista = tarefasPorPedido.get(tarefa.pedido_id) ?? []
      lista.push(tarefa)
      tarefasPorPedido.set(tarefa.pedido_id, lista)
    }
  }

  const interacoesPorOportunidade = new Map<string, InteracaoBruta[]>()
  const interacoesPorPedido = new Map<string, InteracaoBruta[]>()
  for (const interacao of interacoes) {
    if (interacao.oportunidade_id) {
      const lista = interacoesPorOportunidade.get(interacao.oportunidade_id) ?? []
      lista.push(interacao)
      interacoesPorOportunidade.set(interacao.oportunidade_id, lista)
    }
    if (interacao.pedido_id) {
      const lista = interacoesPorPedido.get(interacao.pedido_id) ?? []
      lista.push(interacao)
      interacoesPorPedido.set(interacao.pedido_id, lista)
    }
  }

  // Fase 36.1 precisa do maior valorTotalAcumulado de TODA a base pra
  // normalizar o fator "valor" — por isso a montagem roda em duas passadas:
  // 1) monta cada cliente sem o score, 2) acha o maior valor e só então
  // calcula o score de cada um.
  const preResultado: Array<Omit<ClienteInteligencia, 'scorePropensao' | 'faixaScorePropensao'>> = []

  for (const acc of Array.from(acumuladores.values())) {
    const cadastro = cadastroPorChave.get(acc.chave) ?? null

    const pedidosEfetuados = acc.pedidos.filter((p) => p.dataEfetuacao !== null)
    const ultimaCompra =
      pedidosEfetuados.length > 0
        ? pedidosEfetuados.reduce((maisRecente, p) =>
            (p.dataEfetuacao as string) > maisRecente ? (p.dataEfetuacao as string) : maisRecente,
          pedidosEfetuados[0].dataEfetuacao as string)
        : null
    const valorTotalAcumulado = pedidosEfetuados.reduce((soma, p) => soma + p.total, 0)
    const ticketMedio = pedidosEfetuados.length > 0 ? valorTotalAcumulado / pedidosEfetuados.length : null

    // Itens mais comprados: soma a quantidade de cada descrição entre todos
    // os pedidos efetuados do cliente, ordenado do mais pro menos comprado.
    const quantidadePorDescricao = new Map<string, number>()
    for (const p of pedidosEfetuados) {
      for (const item of itensPorPedido.get(p.id) ?? []) {
        const descricao = item.descricao.trim()
        if (!descricao) continue
        quantidadePorDescricao.set(descricao, (quantidadePorDescricao.get(descricao) ?? 0) + Number(item.quantidade))
      }
    }
    const itensMaisComprados: ItemMaisComprado[] = Array.from(quantidadePorDescricao.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([descricao, quantidade]) => ({ descricao, quantidade }))

    const oportunidadeMaisRecente = acc.oportunidades.reduce<OportunidadeInteligencia | null>(
      (atual, o) => (!atual || o.criado_em > atual.criado_em ? o : atual),
      null,
    )

    const oportunidadesAbertas = acc.oportunidades
      .filter((o) => o.status !== 'GANHO' && o.status !== 'PERDIDO')
      .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))
    const valorEstimadoAberto = oportunidadesAbertas.reduce((soma, o) => soma + (o.valor_estimado ?? 0), 0)

    const historicoPedidosOrdenado = [...acc.pedidos].sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))

    // Fase 36.2: intervalo médio entre compras consecutivas + alerta de churn.
    const datasEfetuacaoAsc = pedidosEfetuados.map((p) => p.dataEfetuacao as string).sort()
    const intervaloMedioDiasCompra = calcularIntervaloMedioDiasCompra(datasEfetuacaoAsc)
    const diasDesdeUltimaCompra = ultimaCompra ? diasDesde(ultimaCompra) : null
    const emRiscoChurn =
      intervaloMedioDiasCompra !== null &&
      diasDesdeUltimaCompra !== null &&
      diasDesdeUltimaCompra > MULTIPLICADOR_ALERTA_CHURN * intervaloMedioDiasCompra

    // Vínculo sugerido pro botão "Criar tarefa" do alerta de churn:
    // oportunidade aberta mais recente, senão o pedido mais recente.
    const vinculoTarefaTipo: 'oportunidade' | 'pedido' | null =
      oportunidadesAbertas.length > 0 ? 'oportunidade' : historicoPedidosOrdenado.length > 0 ? 'pedido' : null
    const vinculoTarefaId =
      vinculoTarefaTipo === 'oportunidade'
        ? oportunidadesAbertas[0].id
        : vinculoTarefaTipo === 'pedido'
          ? historicoPedidosOrdenado[0].id
          : null

    const idsOportunidades = new Set(acc.oportunidades.map((o) => o.id))
    const idsPedidos = new Set(acc.pedidos.map((p) => p.id))

    const tarefasPendentes: TarefaBruta[] = []
    const tarefasJaAdicionadas = new Set<string>()
    for (const id of Array.from(idsOportunidades)) {
      for (const tarefa of tarefasPorOportunidade.get(id) ?? []) {
        if (tarefasJaAdicionadas.has(tarefa.id)) continue
        tarefasJaAdicionadas.add(tarefa.id)
        tarefasPendentes.push(tarefa)
      }
    }
    for (const id of Array.from(idsPedidos)) {
      for (const tarefa of tarefasPorPedido.get(id) ?? []) {
        if (tarefasJaAdicionadas.has(tarefa.id)) continue
        tarefasJaAdicionadas.add(tarefa.id)
        tarefasPendentes.push(tarefa)
      }
    }

    const interacoesDoCliente: InteracaoBruta[] = []
    const interacoesJaAdicionadas = new Set<string>()
    for (const id of Array.from(idsOportunidades)) {
      for (const interacao of interacoesPorOportunidade.get(id) ?? []) {
        if (interacoesJaAdicionadas.has(interacao.id)) continue
        interacoesJaAdicionadas.add(interacao.id)
        interacoesDoCliente.push(interacao)
      }
    }
    for (const id of Array.from(idsPedidos)) {
      for (const interacao of interacoesPorPedido.get(id) ?? []) {
        if (interacoesJaAdicionadas.has(interacao.id)) continue
        interacoesJaAdicionadas.add(interacao.id)
        interacoesDoCliente.push(interacao)
      }
    }
    interacoesDoCliente.sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))

    const contagemPorTipo = new Map<string, number>()
    for (const i of interacoesDoCliente) {
      contagemPorTipo.set(i.tipo, (contagemPorTipo.get(i.tipo) ?? 0) + 1)
    }
    let tipoInteracaoMaisUsado: string | null = null
    let maiorContagem = 0
    for (const [tipo, contagem] of Array.from(contagemPorTipo.entries())) {
      if (contagem > maiorContagem) {
        maiorContagem = contagem
        tipoInteracaoMaisUsado = tipo
      }
    }

    preResultado.push({
      chave: acc.chave,
      clienteId: cadastro?.id ?? acc.clienteId,
      nome: cadastro?.nome_fantasia || acc.nome,
      razaoSocial: cadastro?.razao_social ?? null,
      nomeFantasia: cadastro?.nome_fantasia ?? null,
      cnpj: cadastro?.cnpj ?? (acc.chave.startsWith('cnpj:') ? acc.chave.slice('cnpj:'.length) : null),
      email: cadastro?.email ?? null,
      telefone: cadastro?.telefone ?? null,
      contato: cadastro?.contato ?? null,
      cidade: cadastro?.cidade ?? null,
      estado: cadastro?.estado ?? null,
      cep: cadastro?.cep ?? null,
      observacoes: cadastro?.observacoes ?? null,

      temperaturaAutomatica: calcularTemperaturaAutomatica(ultimaCompra),
      temperaturaManual: oportunidadeMaisRecente?.temperatura ?? null,
      etapaFunil: oportunidadeMaisRecente?.status ?? null,
      origem: oportunidadeMaisRecente?.origem ?? null,
      valorEstimadoAberto,
      oportunidadeCriadaEm: oportunidadeMaisRecente?.criado_em ?? null,
      vendedorId: acc.vendedorId,
      vendedorNome: acc.vendedorId ? (nomesPorProfileId[acc.vendedorId] ?? null) : null,

      ultimaCompra,
      qtdPedidosTotal: acc.pedidos.length,
      qtdPedidosEfetuados: pedidosEfetuados.length,
      ticketMedio,
      valorTotalAcumulado,
      itensMaisComprados,

      qtdInteracoes: interacoesDoCliente.length,
      tipoInteracaoMaisUsado,
      ultimoContato: interacoesDoCliente[0]?.criado_em ?? null,

      diasDesdeUltimaCompra,
      intervaloMedioDiasCompra,
      emRiscoChurn,
      vinculoTarefaTipo,
      vinculoTarefaId,

      omieClienteId: cadastro?.omie_cliente_id ?? acc.omieClienteId,

      historicoPedidos: historicoPedidosOrdenado,
      oportunidadesAbertas,
      tarefasPendentes: tarefasPendentes.map((t) => ({
        id: t.id,
        descricao: t.descricao,
        data_prevista: t.data_prevista,
        responsavel: t.responsavel,
      })),
      interacoes: interacoesDoCliente.map((i) => ({
        id: i.id,
        tipo: i.tipo,
        resultado: i.resultado,
        criado_em: i.criado_em,
      })),
    })
  }

  const maiorValorTotalAcumulado = Math.max(0, ...preResultado.map((c) => c.valorTotalAcumulado))

  const resultado: ClienteInteligencia[] = preResultado.map((c) => {
    const scorePropensao = calcularScorePropensao({
      diasDesdeUltimaCompra: c.diasDesdeUltimaCompra,
      qtdPedidosEfetuados: c.qtdPedidosEfetuados,
      valorTotalAcumulado: c.valorTotalAcumulado,
      maiorValorTotalAcumulado,
      temperaturaManual: c.temperaturaManual,
    })
    return {
      ...c,
      scorePropensao,
      faixaScorePropensao: faixaDoScorePropensao(scorePropensao),
    }
  })

  return resultado.sort((a, b) => a.nome.localeCompare(b.nome))
}
