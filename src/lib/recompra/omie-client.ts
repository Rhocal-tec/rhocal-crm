// ===============================================
// MOTOR DE RECOMPRA PREDITIVA — RHOCAL
// Cliente Omie — v2, ajustado contra a resposta REAL da API
// (validada em ambiente real em ago/2026, ver notas abaixo)
//
// DESCOBERTAS IMPORTANTES:
// - ListarPedidos ACEITA filtrar_por_data_de / filtrar_por_data_ate (dd/mm/aaaa) —
//   confirmado ao vivo set/2026. Eles filtram por dAlt (data da última
//   alteração do pedido), NÃO por data de criação: pega tanto pedido novo
//   (dAlt == dInc) quanto pedido antigo editado no período. Ordem padrão é
//   crescente por código interno (mais antigos primeiro); NÃO há como pedir
//   decrescente (ordem_decrescente faulta; ordem_descrescente é aceito mas só
//   inverte dentro da página, não a paginação — inútil). Usado pelo job da
//   janela recente (listarPaginaDePedidos com filtroData).
// - ListarPedidos NÃO traz infoCadastro nem informacoes_adicionais (data real, vendedor)
// - Só ConsultarPedido (1 pedido por vez) traz esses dados completos
// - ConsultarPedido embrulha TUDO num objeto `pedido_venda_produto` — cabecalho/
//   det/infoCadastro/... ficam DENTRO dele, não no topo (confirmado ao vivo
//   set/2026; o tipo antigo lia no topo e pulava todo pedido como "sem infoCadastro")
// - Data real do pedido = infoCadastro.dInc (não data_previsao, que é previsão de entrega)
// - Vendedor = informacoes_adicionais.codVend (só o código — nome vem de ListarVendedores)
// - Cliente = cabecalho.codigo_cliente (só o código — nome/CNPJ vem de ConsultarCliente,
//   CONFIRMADO contra a API real: razao_social, nome_fantasia, cnpj_cpf, top-level, sem sub-objetos)
// - Categoria do item = det[].inf_adic.codigo_categoria_item
// - Itens ficam em det[].produto (não direto em det[])
//
// IMPORTANTE: usar as credenciais da empresa correta (fase 30 do CRM) —
// este módulo assume RHOCAL por padrão (OMIE_APP_KEY_RHOCAL/OMIE_APP_SECRET_RHOCAL);
// ajustar para aceitar o slug da empresa se for rodar para MATSEG também.
//
// AJUSTE AO COLAR: OMIE_BASE_URL veio sem o ".br" (https://app.omie.com/api/v1)
// — corrigido para https://app.omie.com.br/api/v1, mesmo domínio já usado em
// src/lib/omie/chamar-omie.ts e confirmado ao vivo (ConsultarCliente/ListarClientes)
// nesta mesma investigação. Com o domínio errado nenhuma chamada funcionaria.
//
// ListarVendedores (resolverVendedor) não foi confirmado ao vivo nesta
// investigação — só ConsultarCliente/ConsultarPedido/ListarPedidos foram.
// Vale testar isoladamente antes de confiar no nome dos campos
// (cadastros[].codigo/nome), mesma cautela já documentada nas fases
// 18.5/20/31/33 do CLAUDE.md pra endpoints não confirmados ao vivo.
// ===============================================

import { registrarErroLog } from "@/lib/recompra/registrar-erro-log";
import { registrarPedidoPulado } from "@/lib/recompra/pedidos-pulados";

const OMIE_APP_KEY = process.env.OMIE_APP_KEY_RHOCAL!;
const OMIE_APP_SECRET = process.env.OMIE_APP_SECRET_RHOCAL!;
const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

const DELAY_ENTRE_REQUISICOES_MS = 150;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiraEm: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Timeout de rede por chamada — sem isso, uma conexão que trava (DNS, TLS,
// TCP connect) fica pendurada até o maxDuration inteiro da função estourar,
// e o erro que sobra pro catch da rota é genérico demais pra diagnosticar.
// Com o AbortSignal, a falha vem rápida e com um nome de erro específico
// (ex: TimeoutError) em vez de silenciosa.
//
// 12s (reduzido de 20s): com maxDuration=60s na rota do cron, 20s era 1/3 do
// orçamento inteiro numa única chamada — duas ou três chamadas travadas
// seguidas matavam a function (FUNCTION_INVOCATION_TIMEOUT) antes do teto de
// tempo interno (LIMITE_TEMPO_MS em sync-recompra-preditiva.ts) conseguir
// agir. 12s deixa margem pra retry (abaixo) sem estourar.
const TIMEOUT_REQUISICAO_MS = 12_000;

// Retry automático só em cima de timeout de rede: um blip no Omie costuma
// passar numa 2ª/3ª tentativa. São até MAX_TENTATIVAS no total (1 original +
// 2 retries), com DELAY_ENTRE_TENTATIVAS_MS entre elas. Fault da API,
// credencial ausente ou erro de parse NÃO são retentados — não melhoram
// tentando de novo, e só gastariam tempo do orçamento da function.
// Pior caso teórico: 3 × 12s + 2 × 1s = 38s numa única chamada — mas o gate
// de tempo antes de cada retry (haMargemPraRetry) corta os retries bem antes
// disso quando a execução da rota já está perto do maxDuration=60s, e o
// try/catch por pedido em sincronizarHistorico impede que qualquer falha aqui
// derrube a execução inteira.
const MAX_TENTATIVAS = 3;
const DELAY_ENTRE_TENTATIVAS_MS = 1_000;

// maxDuration da rota do cron (route.ts: `export const maxDuration = 60`).
// Usado só como referência pro gate de tempo antes de cada retry.
const MAX_DURATION_ROTA_MS = 60_000;

// Antes de gastar mais um ciclo de timeout (até 12s) + delay (1s) num retry,
// o gate confere quanto tempo ainda resta dentro do maxDuration=60s da
// function, contando a partir do início da execução da rota (inicioJob,
// passado pelo orquestrador do job). Com menos de MARGEM_MINIMA_PRA_RETRY_MS
// de folga, desiste do retry e propaga o erro agora — melhor falhar limpo
// (só aquele pedido é pulado, retomado no próximo run) do que arriscar o
// FUNCTION_INVOCATION_TIMEOUT, que mata a function sem resposta nenhuma.
// Sem inicioJob (caller fora do cron), o gate fica desligado.
const MARGEM_MINIMA_PRA_RETRY_MS = 15_000;

function haMargemPraRetry(inicioJob?: number): boolean {
  if (inicioJob === undefined) return true;
  const restanteMs = MAX_DURATION_ROTA_MS - (Date.now() - inicioJob);
  return restanteMs >= MARGEM_MINIMA_PRA_RETRY_MS;
}

function ehErroDeTimeout(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "TimeoutError"
  );
}

async function chamarOmie<T>(
  endpoint: string,
  call: string,
  param: Record<string, unknown>,
  delayMs: number = DELAY_ENTRE_REQUISICOES_MS,
  inicioJob?: number
): Promise<T> {
  await sleep(delayMs);

  if (!OMIE_APP_KEY || !OMIE_APP_SECRET) {
    throw new Error(
      `[omie-client] OMIE_APP_KEY_RHOCAL/OMIE_APP_SECRET_RHOCAL não configuradas neste ambiente — abortando antes de chamar ${endpoint}/${call}.`
    );
  }

  let resp: Response | undefined;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      resp = await fetch(`${OMIE_BASE_URL}/${endpoint}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // POST pra uma API externa nunca deve passar pelo Data Cache do
        // Next.js — evita o comportamento observado em dev ("Failed to set
        // fetch cache ... items over 2MB can not be cached") e qualquer
        // interferência equivalente em produção.
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_REQUISICAO_MS),
        body: JSON.stringify({
          call,
          app_key: OMIE_APP_KEY,
          app_secret: OMIE_APP_SECRET,
          param: [param],
        }),
      });
      break;
    } catch (err) {
      // Timeout do AbortSignal acima: retenta enquanto ainda há tentativa
      // sobrando E ainda há folga de tempo dentro do maxDuration da function.
      // Nas demais falhas (DNS, TLS, TCP connect), na última tentativa, ou sem
      // margem de tempo, cai direto no wrap abaixo.
      const timeoutRetentavel = ehErroDeTimeout(err) && tentativa < MAX_TENTATIVAS;

      if (timeoutRetentavel && haMargemPraRetry(inicioJob)) {
        console.warn(
          `[omie-client] timeout em ${endpoint}/${call} (tentativa ${tentativa}/${MAX_TENTATIVAS}) — novo retry em ${DELAY_ENTRE_TENTATIVAS_MS}ms`
        );
        await sleep(DELAY_ENTRE_TENTATIVAS_MS);
        continue;
      }

      if (timeoutRetentavel) {
        console.warn(
          `[omie-client] timeout em ${endpoint}/${call} (tentativa ${tentativa}/${MAX_TENTATIVAS}) — sem margem segura de tempo dentro do maxDuration pra novo retry, propagando o erro`
        );
      }

      // Erro de rede (DNS, TLS, TCP connect, timeout do AbortSignal acima) —
      // nunca chega a sair uma requisição "de verdade" nesses casos, por isso
      // não aparece em "External APIs" nos logs da Vercel. Sem este catch, o
      // erro original (nome/causa) se perde e só sobra um "fetch failed"
      // genérico lá na rota.
      const causa =
        err instanceof Error
          ? `${err.name}: ${err.message}${err.cause ? ` (cause: ${String(err.cause)})` : ""}`
          : String(err);
      throw new Error(
        `[omie-client] falha de rede ao chamar ${endpoint}/${call}${
          tentativa > 1 ? ` (após ${tentativa} tentativas)` : ""
        }: ${causa}`
      );
    }
  }

  // Inalcançável na prática (o loop ou retorna via break com resp definido, ou
  // lança) — só mantém o narrowing de tipo feliz sem `!`.
  if (!resp) {
    throw new Error(
      `[omie-client] sem resposta de ${endpoint}/${call} após ${MAX_TENTATIVAS} tentativas.`
    );
  }

  const json = await resp.json();

  if (json.faultstring) {
    throw new Error(`Omie API fault em ${endpoint}/${call}: ${json.faultstring}`);
  }

  return json as T;
}

async function chamarOmieComCache<T>(
  chave: string,
  endpoint: string,
  call: string,
  param: Record<string, unknown>,
  inicioJob?: number
): Promise<T> {
  const cacheado = cache.get(chave);
  if (cacheado && cacheado.expiraEm > Date.now()) {
    return cacheado.data as T;
  }

  const resultado = await chamarOmie<T>(endpoint, call, param, DELAY_ENTRE_REQUISICOES_MS, inicioJob);
  cache.set(chave, { data: resultado, expiraEm: Date.now() + CACHE_TTL_MS });
  return resultado;
}

export interface OmieItemPedido {
  codigo_produto: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  categoria: string;
}

export interface OmiePedido {
  numero_pedido: string;
  codigo_pedido_omie: string;
  data_pedido: string;
  codigo_cliente_omie: string;
  codigo_vendedor_omie: string;
  itens: OmieItemPedido[];
}

interface ListarPedidosResponse {
  pedido_venda_produto: Array<{ cabecalho: { codigo_pedido: number } }>;
  total_de_paginas: number;
}

export interface PaginaDePedidos {
  codigos: number[];
  totalPaginas: number;
}

// Janela de data pro ListarPedidos. Formato dd/mm/aaaa. O Omie filtra por
// dAlt (data da última alteração do pedido), não por data de criação.
export interface FiltroDataPedidos {
  de: string;
  ate: string;
}

// Busca só UMA página por chamada (não pagina tudo de uma vez) — listar o
// histórico inteiro do Omie antes de processar qualquer coisa estourava
// sozinho o tempo de execução da function na Vercel. O cursor de qual
// página buscar a seguir vive em sync_estado (ver CHAVE_PAGINA_CURSOR_SYNC
// em sync-recompra-preditiva.ts), não aqui.
//
// filtroData (opcional): usado pelo job /api/cron/recompra-recente pra varrer
// só os pedidos alterados/criados nos últimos ~45 dias (1-2 páginas). O job
// diário completo (/api/cron/recompra-preditiva) chama sem filtro e pagina o
// histórico inteiro.
export async function listarPaginaDePedidos(
  pagina: number,
  inicioJob?: number,
  filtroData?: FiltroDataPedidos
): Promise<PaginaDePedidos> {
  const param: Record<string, unknown> = {
    pagina,
    registros_por_pagina: 50,
    apenas_importado_api: "N",
  };

  if (filtroData) {
    param.filtrar_por_data_de = filtroData.de;
    param.filtrar_por_data_ate = filtroData.ate;
  }

  const resposta = await chamarOmie<ListarPedidosResponse>(
    "produtos/pedido",
    "ListarPedidos",
    param,
    DELAY_ENTRE_REQUISICOES_MS,
    inicioJob
  );

  const codigos = (resposta.pedido_venda_produto ?? []).map((p) => p.cabecalho.codigo_pedido);

  return { codigos, totalPaginas: resposta.total_de_paginas };
}

// Confirmado ao vivo (teste isolado, set/2026) contra o pedido 9898723357:
// o ConsultarPedido devolve TUDO embrulhado num objeto `pedido_venda_produto`
// — { "pedido_venda_produto": { cabecalho, det, infoCadastro, ... } } — e NÃO
// no topo, ao contrário do que a versão anterior deste tipo assumia. (O
// ListarPedidos usa a mesma chave, mas como ARRAY; aqui é objeto único.)
// Ler `resposta.infoCadastro` direto no topo dava sempre `undefined`, então
// todo pedido caía no ramo "sem infoCadastro" e era pulado — o error_log
// cheio desse aviso era falso positivo, não pedido em estado incomum.
interface PedidoVendaProduto {
  cabecalho: { codigo_cliente: number; numero_pedido: string; codigo_pedido: number };
  det: Array<{
    produto: {
      codigo_produto: number;
      descricao: string;
      quantidade: number;
      valor_unitario: number;
      valor_total: number;
    };
    inf_adic: { codigo_categoria_item: string };
  }>;
  infoCadastro?: { dInc: string; cancelado: string };
  informacoes_adicionais?: { codVend: number };
}

interface ConsultarPedidoResponse {
  pedido_venda_produto?: PedidoVendaProduto;
}

export async function consultarPedido(
  codigoPedido: number,
  inicioJob?: number
): Promise<OmiePedido | null> {
  // Delay reduzido (50ms em vez do padrão 150ms) — chamada de detalhe feita
  // uma vez por pedido novo, dentro do teto já apertado de maxDuration da
  // rota de cron; dá mais margem pra processar mais pedidos por execução.
  const resposta = await chamarOmie<ConsultarPedidoResponse>(
    "produtos/pedido",
    "ConsultarPedido",
    { codigo_pedido: codigoPedido },
    50,
    inicioJob
  );

  // Desembrulha o `pedido_venda_produto` (ver comentário no tipo acima) — sem
  // isso, todas as checagens abaixo liam `undefined` e todo pedido era pulado.
  const pvp = resposta.pedido_venda_produto;
  if (!pvp) {
    console.warn("[omie] ConsultarPedido sem pedido_venda_produto, pulando:", codigoPedido);
    await registrarErroLog(
      `Pedido Omie ${codigoPedido}: resposta do ConsultarPedido sem pedido_venda_produto, pulado`
    );
    await registrarPedidoPulado(codigoPedido, "resposta sem pedido_venda_produto");
    return null;
  }

  // Alguns pedidos voltam sem infoCadastro/det/informacoes_adicionais
  // preenchidos (pedido em estado incomum no Omie). Sem essas checagens, um
  // único pedido nesse estado derrubava o job inteiro em vez de só ser pulado.
  if (!pvp.infoCadastro) {
    console.warn("[omie] pedido sem infoCadastro, pulando:", codigoPedido);
    await registrarErroLog(`Pedido Omie ${codigoPedido} sem infoCadastro, pulado`);
    await registrarPedidoPulado(codigoPedido, "sem infoCadastro");
    return null;
  }

  if (pvp.infoCadastro.cancelado === "S") {
    console.warn("[omie] pedido cancelado, pulando:", codigoPedido);
    await registrarErroLog(`Pedido Omie ${codigoPedido} cancelado, pulado`);
    await registrarPedidoPulado(codigoPedido, "cancelado");
    return null;
  }

  if (!pvp.det || pvp.det.length === 0) {
    console.warn("[omie] pedido sem itens (det), pulando:", codigoPedido);
    await registrarErroLog(`Pedido Omie ${codigoPedido} sem campo det, pulado`);
    await registrarPedidoPulado(codigoPedido, "sem itens (det)");
    return null;
  }

  if (!pvp.informacoes_adicionais) {
    // Não é um "return null" — o pedido segue e é gravado, só sem vendedor.
    // Ainda assim registra em error_log pra o gestor ver que o dado veio
    // incompleto do Omie.
    console.warn("[omie] pedido sem informacoes_adicionais, vendedor ficará vazio:", codigoPedido);
    await registrarErroLog(
      `Pedido Omie ${codigoPedido} sem informacoes_adicionais, gravado sem vendedor`
    );
  }

  return {
    numero_pedido: pvp.cabecalho.numero_pedido,
    codigo_pedido_omie: String(pvp.cabecalho.codigo_pedido),
    data_pedido: pvp.infoCadastro.dInc,
    codigo_cliente_omie: String(pvp.cabecalho.codigo_cliente),
    codigo_vendedor_omie: String(pvp.informacoes_adicionais?.codVend ?? ""),
    itens: pvp.det.map((item) => ({
      codigo_produto: String(item.produto.codigo_produto),
      descricao: item.produto.descricao,
      quantidade: item.produto.quantidade,
      valor_unitario: item.produto.valor_unitario,
      valor_total: item.produto.valor_total,
      categoria: item.inf_adic.codigo_categoria_item || "default",
    })),
  };
}

interface ConsultarClienteResponse {
  razao_social: string;
  nome_fantasia: string;
  cnpj_cpf: string;
}

export async function resolverCliente(
  codigoCliente: string,
  inicioJob?: number
): Promise<{ nome: string; cnpj: string }> {
  const resposta = await chamarOmieComCache<ConsultarClienteResponse>(
    `cliente:${codigoCliente}`,
    "geral/clientes",
    "ConsultarCliente",
    { codigo_cliente_omie: Number(codigoCliente) },
    inicioJob
  );

  return {
    nome: resposta.nome_fantasia || resposta.razao_social,
    cnpj: resposta.cnpj_cpf,
  };
}

interface ListarVendedoresResponse {
  cadastros: Array<{ codigo: number; nome: string }>;
}

let mapaVendedoresCache: Map<string, string> | null = null;
let mapaVendedoresExpiraEm = 0;

export async function resolverVendedor(
  codigoVendedor: string,
  inicioJob?: number
): Promise<string> {
  if (!mapaVendedoresCache || mapaVendedoresExpiraEm < Date.now()) {
    const resposta = await chamarOmie<ListarVendedoresResponse>(
      "geral/vendedores",
      "ListarVendedores",
      { pagina: 1, registros_por_pagina: 200 },
      DELAY_ENTRE_REQUISICOES_MS,
      inicioJob
    );

    mapaVendedoresCache = new Map(
      (resposta.cadastros ?? []).map((v) => [String(v.codigo), v.nome])
    );
    mapaVendedoresExpiraEm = Date.now() + CACHE_TTL_MS;
  }

  return mapaVendedoresCache.get(codigoVendedor) ?? "";
}
