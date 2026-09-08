// ===============================================
// MOTOR DE RECOMPRA PREDITIVA — RHOCAL
// Registro de pedidos do Omie "vistos e sem nada pra gravar"
// ===============================================
//
// Ver migração supabase/migrations/0018_recompra_pedidos_pulados.sql para o
// porquê: sem isto, cancelados (e outros retornos null do ConsultarPedido)
// eram re-consultados no Omie toda vez que o cursor de página dava a volta.

import { supabase } from "@/lib/recompra/supabase-client";

export type MotivoPulado =
  | "cancelado"
  | "sem infoCadastro"
  | "sem itens (det)"
  | "resposta sem pedido_venda_produto";

// Best-effort: uma falha ao registrar não pode derrubar o processamento do
// pedido (o pior caso é ele ser re-consultado no próximo ciclo, como antes).
export async function registrarPedidoPulado(
  pedidoOmieId: number | string,
  motivo: MotivoPulado
): Promise<void> {
  try {
    await supabase.from("recompra_pedidos_pulados").upsert(
      {
        pedido_omie_id: String(pedidoOmieId),
        motivo,
        visto_em: new Date().toISOString(),
      },
      { onConflict: "pedido_omie_id" }
    );
  } catch (err) {
    console.error(
      `[recompra] erro ao registrar pedido pulado ${pedidoOmieId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

// Lista de pedido_omie_id (string) já vistos e pulados — unida ao dedup de
// pedidos_itens_historico em sincronizarHistorico. Erro de leitura devolve
// lista vazia (degrada pro comportamento antigo, não quebra o job).
export async function carregarPedidosPulados(): Promise<string[]> {
  const { data, error } = await supabase
    .from("recompra_pedidos_pulados")
    .select("pedido_omie_id");

  if (error) {
    console.error(`[recompra] erro ao carregar pedidos pulados: ${error.message}`);
    return [];
  }

  return (data ?? []).map((l) => String(l.pedido_omie_id));
}
