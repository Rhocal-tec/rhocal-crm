// ===============================================
// MOTOR DE RECOMPRA PREDITIVA — RHOCAL
// Cliente Omie — v2, ajustado contra a resposta REAL da API
// (validada em ambiente real em ago/2026, ver notas abaixo)
//
// DESCOBERTAS IMPORTANTES:
// - ListarPedidos NÃO aceita filtro de data — só pagina/registros_por_pagina/apenas_importado_api
// - ListarPedidos NÃO traz infoCadastro nem informacoes_adicionais (data real, vendedor)
// - Só ConsultarPedido (1 pedido por vez) traz esses dados completos
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
const TIMEOUT_REQUISICAO_MS = 20_000;

async function chamarOmie<T>(
  endpoint: string,
  call: string,
  param: Record<string, unknown>
): Promise<T> {
  await sleep(DELAY_ENTRE_REQUISICOES_MS);

  if (!OMIE_APP_KEY || !OMIE_APP_SECRET) {
    throw new Error(
      `[omie-client] OMIE_APP_KEY_RHOCAL/OMIE_APP_SECRET_RHOCAL não configuradas neste ambiente — abortando antes de chamar ${endpoint}/${call}.`
    );
  }

  let resp: Response;
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
  } catch (err) {
    // Erro de rede (DNS, TLS, TCP connect, timeout do AbortSignal acima) —
    // nunca chega a sair uma requisição "de verdade" nesses casos, por isso
    // não aparece em "External APIs" nos logs da Vercel. Sem este catch, o
    // erro original (nome/causa) se perde e só sobra um "fetch failed"
    // genérico lá na rota.
    const causa =
      err instanceof Error
        ? `${err.name}: ${err.message}${err.cause ? ` (cause: ${String(err.cause)})` : ""}`
        : String(err);
    throw new Error(`[omie-client] falha de rede ao chamar ${endpoint}/${call}: ${causa}`);
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
  param: Record<string, unknown>
): Promise<T> {
  const cacheado = cache.get(chave);
  if (cacheado && cacheado.expiraEm > Date.now()) {
    return cacheado.data as T;
  }

  const resultado = await chamarOmie<T>(endpoint, call, param);
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

export async function listarCodigosDePedidos(): Promise<number[]> {
  const codigos: number[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  const inicio = Date.now();

  do {
    const resposta = await chamarOmie<ListarPedidosResponse>(
      "produtos/pedido",
      "ListarPedidos",
      {
        pagina,
        registros_por_pagina: 100,
        apenas_importado_api: "N",
      }
    );

    totalPaginas = resposta.total_de_paginas;
    // Log por página — se a listagem inteira estourar o tempo de novo, essa
    // linha (a última impressa antes do corte) mostra exatamente em qual
    // página parou e quanto tempo cada uma está levando.
    console.log(
      `[omie] página ${pagina}/${totalPaginas} da listagem de pedidos (${Date.now() - inicio}ms acumulados)`
    );

    for (const p of resposta.pedido_venda_produto ?? []) {
      codigos.push(p.cabecalho.codigo_pedido);
    }

    pagina++;
  } while (pagina <= totalPaginas);

  return codigos;
}

interface ConsultarPedidoResponse {
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
  infoCadastro: { dInc: string; cancelado: string };
  informacoes_adicionais: { codVend: number };
}

export async function consultarPedido(codigoPedido: number): Promise<OmiePedido | null> {
  const resposta = await chamarOmie<ConsultarPedidoResponse>(
    "produtos/pedido",
    "ConsultarPedido",
    { codigo_pedido: codigoPedido }
  );

  if (resposta.infoCadastro.cancelado === "S") return null;

  return {
    numero_pedido: resposta.cabecalho.numero_pedido,
    codigo_pedido_omie: String(resposta.cabecalho.codigo_pedido),
    data_pedido: resposta.infoCadastro.dInc,
    codigo_cliente_omie: String(resposta.cabecalho.codigo_cliente),
    codigo_vendedor_omie: String(resposta.informacoes_adicionais.codVend ?? ""),
    itens: resposta.det.map((item) => ({
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
  codigoCliente: string
): Promise<{ nome: string; cnpj: string }> {
  const resposta = await chamarOmieComCache<ConsultarClienteResponse>(
    `cliente:${codigoCliente}`,
    "geral/clientes",
    "ConsultarCliente",
    { codigo_cliente_omie: Number(codigoCliente) }
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

export async function resolverVendedor(codigoVendedor: string): Promise<string> {
  if (!mapaVendedoresCache || mapaVendedoresExpiraEm < Date.now()) {
    const resposta = await chamarOmie<ListarVendedoresResponse>(
      "geral/vendedores",
      "ListarVendedores",
      { pagina: 1, registros_por_pagina: 200 }
    );

    mapaVendedoresCache = new Map(
      (resposta.cadastros ?? []).map((v) => [String(v.codigo), v.nome])
    );
    mapaVendedoresExpiraEm = Date.now() + CACHE_TTL_MS;
  }

  return mapaVendedoresCache.get(codigoVendedor) ?? "";
}
