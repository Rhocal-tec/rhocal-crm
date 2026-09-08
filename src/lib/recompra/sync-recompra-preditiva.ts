// ===============================================
// MOTOR DE RECOMPRA PREDITIVA — RHOCAL
// Job diário de sincronização — v2
//
// Fluxo:
//   1. Lista UMA página de códigos de pedido no Omie (cursor de página em
//      sync_estado, avança a cada execução)
//   2. Descobre quais códigos dessa página já estão no nosso histórico (pulados)
//   3. Consulta o DETALHE só dos pedidos novos (ConsultarPedido)
//   4. Resolve cliente e vendedor (com cache)
//   5. Grava no histórico
//   6. Recalcula recorrência, cross-sell e cruzamento de CA
//
// Depende de @/lib/recompra/omie-client, @/lib/recompra/supabase-client,
// @/lib/recompra/calculo-recorrencia e @/lib/recompra/calculo-cross-sell
// (mesma pasta, todos já criados).
// ===============================================

import {
  listarPaginaDePedidos,
  consultarPedido,
  resolverCliente,
  resolverVendedor,
} from "@/lib/recompra/omie-client";
import { supabase } from "@/lib/recompra/supabase-client";
import { calcularRecorrencia, Pedido } from "@/lib/recompra/calculo-recorrencia";
import { calcularCoOcorrencia, ItemPedido } from "@/lib/recompra/calculo-cross-sell";
import { cotacaoVencida } from "@/lib/kanban/cotacao-vencida";

// Teto de pedidos NOVOS (ConsultarPedido, 1 chamada Omie cada + resolverCliente/
// resolverVendedor) processados POR EXECUÇÃO. Confirmado ao vivo que mesmo
// com a listagem já paginada (1 página do Omie por execução), processar até
// 15 pedidos de detalhe ainda estourava o maxDuration=60s da rota — reduzido
// pra 5. Com lotes de 5 por execução e cron diário, o backfill de centenas
// de pedidos leva algumas semanas — proposital: confiabilidade > velocidade.
const LIMITE_PEDIDOS_NOVOS_POR_EXECUCAO = 5;

// Teto de tempo interno, sempre abaixo do maxDuration=60s da rota (ver
// route.ts) — checado entre iterações de qualquer loop potencialmente longo
// deste job (detalhe de pedidos, recorrência, cruzamento de CA). Ao
// estourar, a execução atual para de processar mais itens e retorna
// ok:true com o que já foi feito (e já persistido) até aqui, em vez de
// deixar a Vercel matar a function no meio (FUNCTION_INVOCATION_TIMEOUT,
// sem resposta nenhuma e sem o cursor necessariamente salvo).
const LIMITE_TEMPO_MS = 45_000;

function tempoEsgotado(inicioJob: number): boolean {
  return Date.now() - inicioJob > LIMITE_TEMPO_MS;
}

const CHAVE_PAGINA_CURSOR_SYNC = "recompra_pagina_atual";

// Cursor persistido em sync_estado — qual página do ListarPedidos buscar na
// próxima execução. Listar TODAS as páginas de uma vez (comportamento
// antigo) estourava sozinho o tempo de execução da function antes mesmo de
// processar qualquer pedido; buscando uma página por vez, o backfill
// completo acontece ao longo de várias execuções (cron diário). Ao alcançar
// a última página, volta pra página 1 (recomeça o ciclo, pra pegar pedidos
// novos criados desde o início do backfill).
async function lerPaginaCursorSync(): Promise<number> {
  const { data, error } = await supabase
    .from("sync_estado")
    .select("valor")
    .eq("chave", CHAVE_PAGINA_CURSOR_SYNC)
    .maybeSingle();

  if (error) {
    console.error(`[sync] erro ao ler página cursor: ${error.message}`);
    return 1;
  }

  const numero = Number(data?.valor);
  return Number.isFinite(numero) && numero >= 1 ? numero : 1;
}

async function salvarPaginaCursorSync(pagina: number): Promise<void> {
  const { error } = await supabase
    .from("sync_estado")
    .upsert(
      { chave: CHAVE_PAGINA_CURSOR_SYNC, valor: String(pagina), atualizado_em: new Date().toISOString() },
      { onConflict: "chave" }
    );

  if (error) console.error(`[sync] erro ao salvar página cursor: ${error.message}`);
}

// -----------------------------------------------------------
// 1) Sincronização em lotes: busca só UMA página de pedidos no Omie por
// execução (cursor de página em sync_estado) e, dentro dela, processa
// detalhe de até LIMITE_PEDIDOS_NOVOS_POR_EXECUCAO pedidos novos. O backfill
// completo acontece ao longo de várias execuções (cron diário).
// -----------------------------------------------------------
async function sincronizarHistorico(
  inicioJob: number
): Promise<{ processados: number; restantes: number; paginaAtual: number }> {
  const paginaAtual = await lerPaginaCursorSync();

  const inicioListagem = Date.now();
  console.log(`[sync] listando página ${paginaAtual} de pedidos no Omie...`);
  const { codigos: codigosDaPagina, totalPaginas } = await listarPaginaDePedidos(
    paginaAtual,
    inicioJob
  );
  console.log(
    `[sync] página ${paginaAtual}/${totalPaginas} — ${codigosDaPagina.length} pedidos (listagem levou ${Date.now() - inicioListagem}ms)`
  );

  const proximaPagina = paginaAtual >= totalPaginas ? 1 : paginaAtual + 1;
  await salvarPaginaCursorSync(proximaPagina);

  const { data: existentes, error } = await supabase
    .from("pedidos_itens_historico")
    .select("pedido_omie_id");

  if (error) throw new Error(`[sync] erro ao ler histórico existente: ${error.message}`);

  const codigosJaSincronizados = new Set((existentes ?? []).map((l) => l.pedido_omie_id));
  const novos = codigosDaPagina.filter((c) => !codigosJaSincronizados.has(String(c)));

  const lote = novos.slice(0, LIMITE_PEDIDOS_NOVOS_POR_EXECUCAO);
  let restantes = novos.length - lote.length;

  console.log(
    `[sync] página ${paginaAtual}: ${novos.length} pedidos novos, processando até ${lote.length} nesta execução (${restantes} ficam pendentes nesta página; próxima execução vai pra página ${proximaPagina})`
  );

  const inicioDetalhe = Date.now();
  let processados = 0;

  for (const codigo of lote) {
    if (tempoEsgotado(inicioJob)) {
      const faltam = lote.length - processados;
      restantes += faltam;
      console.warn(
        `[sync] tempo esgotado (${LIMITE_TEMPO_MS}ms) — parando com ${processados}/${lote.length} pedidos processados nesta execução, ${faltam} ficam pra próxima`
      );
      break;
    }

    // Cada pedido é isolado: um erro aqui (timeout do Omie que sobreviveu aos
    // retries de chamarOmie, fault da API, cliente/vendedor que não resolve,
    // falha de upsert que lance) não pode derrubar a execução inteira do job
    // — loga com o código do pedido e segue pro próximo. O pedido pulado
    // volta a ser tentado quando o cursor de página der a volta.
    try {
      const pedido = await consultarPedido(codigo, inicioJob);
      if (pedido) {
        const { nome: clienteNome, cnpj: clienteCnpj } = await resolverCliente(
          pedido.codigo_cliente_omie,
          inicioJob
        );
        const vendedorNome = await resolverVendedor(pedido.codigo_vendedor_omie, inicioJob);

        const [dia, mes, ano] = pedido.data_pedido.split("/");
        const dataPedidoISO = `${ano}-${mes}-${dia}`;

        const linhas = pedido.itens.map((item) => ({
          cliente_omie_codigo: pedido.codigo_cliente_omie,
          cliente_nome: clienteNome,
          cliente_cnpj: clienteCnpj,
          pedido_omie_id: pedido.codigo_pedido_omie,
          pedido_numero: pedido.numero_pedido,
          data_pedido: dataPedidoISO,
          item_codigo: item.codigo_produto,
          item_nome: item.descricao,
          categoria: item.categoria,
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
          valor_total: item.valor_total,
          vendedor_omie_id: pedido.codigo_vendedor_omie,
          vendedor_nome: vendedorNome,
        }));

        const { error: upsertError } = await supabase
          .from("pedidos_itens_historico")
          .upsert(linhas, { onConflict: "pedido_omie_id,item_codigo" });

        if (upsertError) {
          console.error(`[sync] erro ao gravar pedido ${codigo}: ${upsertError.message}`);
        }
      } // pedido === null: cancelado ou campo ausente (omie-client.ts já loga o motivo), pula
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sync] erro ao processar pedido ${codigo}, pulando: ${msg}`);

      // Fase 25: além do console, grava em error_log pro gestor ver no Painel.
      // Mesmas colunas usadas em route.ts / registrar-erro.ts (rota, mensagem,
      // pedido_id, colaborador, data_hora). pedido_id fica null: o código aqui
      // é o do pedido no Omie, não um uuid da nossa tabela pedidos (a FK
      // rejeitaria) — vai embutido na mensagem. Melhor esforço: se o log
      // falhar, não mascara o erro original (o pedido já foi pulado acima).
      try {
        await supabase.from("error_log").insert({
          rota: "/api/cron/recompra-preditiva",
          mensagem: `Falha ao processar pedido Omie ${codigo}: ${msg}`,
          pedido_id: null,
          colaborador: null,
          data_hora: new Date().toISOString(),
        });
      } catch (logErr) {
        console.error(
          `[sync] erro ao gravar em error_log (pedido ${codigo}): ${
            logErr instanceof Error ? logErr.message : String(logErr)
          }`
        );
      }
    }

    processados++;
  }

  console.log(
    `[sync] lote concluído em ${Date.now() - inicioDetalhe}ms — ${processados} processados, ${restantes} restantes`
  );

  return { processados, restantes, paginaAtual };
}

// -----------------------------------------------------------
// 1.1) Resolve o CA de cada item_codigo (Omie) a partir do nosso
// pedido_itens — o histórico vindo do Omie (pedidos_itens_historico) não
// carrega CA, é um campo exclusivo do nosso CRM (fase 26, opcional).
// Cruza por pedido_itens.codigo_produto_omie (fase 18.5), que é o mesmo
// código de produto que o Omie devolve em item.codigo_produto. Quando o
// mesmo código de produto tem mais de um CA registrado (itens diferentes,
// mesmo produto Omie), fica com o mais recente (criado_em desc).
// -----------------------------------------------------------
async function resolverMapaCaPorItemCodigo(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("pedido_itens")
    .select("codigo_produto_omie, ca, criado_em")
    .not("codigo_produto_omie", "is", null)
    .not("ca", "is", null)
    .order("criado_em", { ascending: false });

  if (error) {
    console.error(`[recorrencia] erro ao resolver CA por item: ${error.message}`);
    return new Map();
  }

  const mapa = new Map<string, string>();
  for (const linha of data ?? []) {
    const chave = String(linha.codigo_produto_omie);
    if (!mapa.has(chave)) mapa.set(chave, linha.ca as string); // já ordenado do mais recente pro mais antigo
  }
  return mapa;
}

// Formato de cada linha de pedidos_itens_historico — declarado à mão porque
// o client Supabase deste job (@/lib/recompra/supabase-client) não recebe o
// generic Database (roda com a service role, fora do client tipado da app),
// então .select("*") volta como `any` e cascateia implicit-any por toda a
// função que le esse histórico.
interface LinhaHistorico {
  cliente_omie_codigo: string;
  cliente_nome: string;
  cliente_cnpj: string | null;
  pedido_omie_id: string;
  pedido_numero: string;
  data_pedido: string;
  item_codigo: string;
  item_nome: string;
  categoria: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  vendedor_omie_id: string;
  vendedor_nome: string;
}

// -----------------------------------------------------------
// 2) Recalcula recorrência por par cliente+item
// -----------------------------------------------------------
async function recalcularRecorrencias(inicioJob: number): Promise<void> {
  const { data: historico, error } = await supabase
    .from("pedidos_itens_historico")
    .select("*")
    .order("data_pedido", { ascending: true })
    .returns<LinhaHistorico[]>();

  if (error) throw new Error(`[recorrencia] erro ao ler histórico: ${error.message}`);
  if (!historico || historico.length === 0) return;

  const mapaCaPorItemCodigo = await resolverMapaCaPorItemCodigo();

  const grupos = new Map<string, LinhaHistorico[]>();
  for (const linha of historico) {
    const chave = `${linha.cliente_omie_codigo}|${linha.item_codigo}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(linha);
    grupos.set(chave, lista);
  }

  const entradas = Array.from(grupos.entries());
  let recalculadas = 0;

  for (const [, linhas] of entradas) {
    if (tempoEsgotado(inicioJob)) {
      console.warn(
        `[recorrencia] tempo esgotado (${LIMITE_TEMPO_MS}ms) — parando com ${recalculadas}/${entradas.length} pares recalculados (cada upsert já feito fica salvo; retoma no próximo run)`
      );
      break;
    }

    const ultima = linhas[linhas.length - 1];

    const pedidosParaCalculo: Pedido[] = linhas.map((l) => ({
      data: new Date(l.data_pedido),
      quantidade: Number(l.quantidade),
    }));

    const previsao = calcularRecorrencia(pedidosParaCalculo, ultima.categoria ?? "default");

    const valorUnitarioMedio =
      linhas.reduce((s, l) => s + Number(l.valor_unitario ?? 0), 0) / linhas.length;

    const registro = {
      cliente_omie_codigo: ultima.cliente_omie_codigo,
      cliente_nome: ultima.cliente_nome,
      cliente_cnpj: ultima.cliente_cnpj,
      item_codigo: ultima.item_codigo,
      item_nome: ultima.item_nome,
      categoria: ultima.categoria ?? "default",
      ca: mapaCaPorItemCodigo.get(String(ultima.item_codigo)) ?? null,

      origem_calculo: previsao.origemCalculo,
      intervalo_medio_dias: previsao.intervaloMedioDias,
      consumo_diario: previsao.consumoDiario,
      data_ultima_compra: previsao.dataUltimaCompra.toISOString().slice(0, 10),
      quantidade_ultima_compra: previsao.quantidadeUltimaCompra,
      dias_ate_precisar: previsao.diasAtePrecisar,
      data_prevista_recompra: previsao.dataPrevistaRecompra.toISOString().slice(0, 10),
      confiabilidade: previsao.confiabilidade,

      valor_unitario_medio: valorUnitarioMedio,
      valor_estimado_pedido: previsao.quantidadeUltimaCompra * valorUnitarioMedio,

      vendedor_omie_id: ultima.vendedor_omie_id,
      vendedor_nome: ultima.vendedor_nome,

      atualizado_em: new Date().toISOString(),
    };

    await upsertPreservandoStatus(registro);
    recalculadas++;
  }

  console.log(`[recorrencia] ${recalculadas}/${entradas.length} previsões recalculadas`);
}

interface RegistroPrevisao {
  cliente_omie_codigo: string;
  cliente_nome: string;
  cliente_cnpj: string | null;
  item_codigo: string;
  item_nome: string;
  categoria: string;
  ca: string | null;
  origem_calculo: "historico" | "fallback_categoria";
  intervalo_medio_dias: number | null;
  consumo_diario: number | null;
  data_ultima_compra: string;
  quantidade_ultima_compra: number;
  dias_ate_precisar: number;
  data_prevista_recompra: string;
  confiabilidade: "alta" | "media" | "baixa";
  valor_unitario_medio: number;
  valor_estimado_pedido: number;
  vendedor_omie_id: string;
  vendedor_nome: string;
  atualizado_em: string;
}

async function upsertPreservandoStatus(previsao: RegistroPrevisao): Promise<void> {
  const { data: existente } = await supabase
    .from("recompra_previsao")
    .select("id")
    .eq("cliente_omie_codigo", previsao.cliente_omie_codigo)
    .eq("item_codigo", previsao.item_codigo)
    .maybeSingle();

  if (existente) {
    const { error } = await supabase
      .from("recompra_previsao")
      .update(previsao)
      .eq("id", existente.id);
    if (error) console.error(`[recorrencia] erro ao atualizar previsão: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("recompra_previsao")
      .insert({ ...previsao, status: "pendente" });
    if (error) console.error(`[recorrencia] erro ao criar previsão: ${error.message}`);
  }
}

// -----------------------------------------------------------
// 3) Recalcula associações de itens (cross-sell)
// -----------------------------------------------------------
async function recalcularCrossSell(): Promise<void> {
  const { data: historico, error } = await supabase
    .from("pedidos_itens_historico")
    .select("pedido_omie_id, item_codigo, item_nome");

  if (error) throw new Error(`[cross-sell] erro ao ler histórico: ${error.message}`);
  if (!historico || historico.length === 0) return;

  const itensPedidos: ItemPedido[] = historico.map((l) => ({
    pedidoId: l.pedido_omie_id,
    itemCodigo: l.item_codigo,
    itemNome: l.item_nome,
  }));

  const associacoes = calcularCoOcorrencia(itensPedidos, 0.3, 2);
  if (associacoes.length === 0) return;

  const linhas = associacoes.map((a) => ({
    item_codigo_principal: a.itemPrincipal,
    item_codigo_associado: a.itemAssociado,
    nome_associado: a.nomeAssociado,
    vezes_juntos: a.vezesJuntos,
    total_pedidos_com_principal: a.totalPedidosComPrincipal,
    frequencia_conjunta: a.frequenciaConjunta,
    atualizado_em: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("itens_associados")
    .upsert(linhas, { onConflict: "item_codigo_principal,item_codigo_associado" });

  if (upsertError) throw new Error(`[cross-sell] erro no upsert: ${upsertError.message}`);
  console.log(`[cross-sell] ${linhas.length} associações atualizadas`);
}

// -----------------------------------------------------------
// 4) Cruza com CA vencendo/vencido, via vw_historico_ca (view já
// existente no schema — CLAUDE.md, fase inicial). Não existe (nem nunca
// existiu) uma tabela "ca_vencimentos" no projeto.
//
// vw_historico_ca não guarda cliente_omie_codigo nem item_codigo (códigos
// do Omie) — só `ca` (texto) e `cliente_nome` (texto, do nosso pedidos).
// O cruzamento por código teria que passar por nome de cliente em texto
// livre, frágil (o nome vindo do Omie via ConsultarCliente pode divergir
// em grafia do cliente_nome digitado no nosso CRM). Por isso o cruzamento
// aqui é só por CA — que é o dado que realmente importa pra essa checagem
// (a cotação vencer é uma questão do produto/fornecedor, não do cliente).
// -----------------------------------------------------------

// Calcula "hoje + N dias" como string YYYY-MM-DD, sem passar por hora
// local em nenhum momento — só parse/format em UTC (mesma cautela de fuso
// já documentada em src/lib/kanban/cotacao-vencida.ts).
function calcularDataLimiteISO(diasAFrente: number): string {
  const hojeISO = new Date().toISOString().slice(0, 10);
  const limite = new Date(`${hojeISO}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + diasAFrente);
  return limite.toISOString().slice(0, 10);
}

async function cruzarComVencimentoCA(inicioJob: number): Promise<void> {
  const { data: previsoesPendentes, error } = await supabase
    .from("recompra_previsao")
    .select("id, ca")
    .in("status", ["pendente", "contatado"]);

  if (error) throw new Error(`[CA] erro ao ler previsões: ${error.message}`);
  if (!previsoesPendentes || previsoesPendentes.length === 0) return;

  const dataLimite30Dias = calcularDataLimiteISO(30);
  let marcadas = 0;
  let avaliadas = 0;

  for (const previsao of previsoesPendentes) {
    if (tempoEsgotado(inicioJob)) {
      console.warn(
        `[CA] tempo esgotado (${LIMITE_TEMPO_MS}ms) — parando com ${avaliadas}/${previsoesPendentes.length} previsões avaliadas (o que já foi marcado fica salvo; retoma no próximo run)`
      );
      break;
    }
    avaliadas++;

    if (!previsao.ca) continue; // item sem CA vinculado (fase 26 é opcional) — nada a cruzar

    // Cotação vencedora mais recente registrada pra esse CA, em qualquer
    // pedido/cliente — é ela que diz se a validade está OK, vencendo ou
    // vencida.
    const { data: historicoCA } = await supabase
      .from("vw_historico_ca")
      .select("validade_cotacao")
      .eq("ca", previsao.ca)
      .eq("vencedora", true)
      .order("data_cotacao", { ascending: false })
      .limit(1)
      .maybeSingle();

    const validade = historicoCA?.validade_cotacao ?? null;
    if (!validade) continue;

    // Mesma comparação de string (YYYY-MM-DD) do helper cotacaoVencida —
    // nunca `new Date(validade)` direto, pra não reintroduzir o bug de
    // fuso já documentado em src/lib/kanban/cotacao-vencida.ts.
    const jaVencida = cotacaoVencida(validade);
    const vencendoEm30Dias = !jaVencida && validade.slice(0, 10) <= dataLimite30Dias;

    if (!jaVencida && !vencendoEm30Dias) continue;

    const { error: updateError } = await supabase
      .from("recompra_previsao")
      .update({ ca_vencendo: true, ca_data_vencimento: validade })
      .eq("id", previsao.id);

    if (updateError) {
      console.error(`[CA] erro ao atualizar previsão ${previsao.id}: ${updateError.message}`);
      continue;
    }
    marcadas++;
  }

  console.log(
    `[CA] cruzamento concluído — ${avaliadas}/${previsoesPendentes.length} avaliadas, ${marcadas} marcadas com CA vencendo/vencida`
  );
}

// -----------------------------------------------------------
// ORQUESTRAÇÃO
// -----------------------------------------------------------
export async function rodarSincronizacaoDiaria(): Promise<{
  processados: number;
  restantes: number;
  paginaAtual: number;
}> {
  const inicioJob = Date.now();
  console.log("=== iniciando job de recompra preditiva ===");

  const resultadoSync = await sincronizarHistorico(inicioJob);

  // Cada fase abaixo processa a tabela inteira (não só o lote sincronizado
  // agora), então também respeita o mesmo teto de tempo — sem isso, o job
  // podia estourar aqui mesmo com o lote de sync já reduzido pra 5.
  if (tempoEsgotado(inicioJob)) {
    console.warn("[job] tempo esgotado após sincronizarHistorico — pulando recorrência/cross-sell/CA nesta execução");
  } else {
    await recalcularRecorrencias(inicioJob);

    if (tempoEsgotado(inicioJob)) {
      console.warn("[job] tempo esgotado após recorrência — pulando cross-sell/CA nesta execução");
    } else {
      await recalcularCrossSell();

      if (tempoEsgotado(inicioJob)) {
        console.warn("[job] tempo esgotado após cross-sell — pulando cruzamento de CA nesta execução");
      } else {
        await cruzarComVencimentoCA(inicioJob);
      }
    }
  }

  console.log(`=== job concluído em ${Date.now() - inicioJob}ms ===`);
  return resultadoSync;
}

if (require.main === module) {
  rodarSincronizacaoDiaria()
    .then((resultado) => {
      console.log("[job] resultado:", resultado);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[job] falhou:", err);
      process.exit(1);
    });
}
