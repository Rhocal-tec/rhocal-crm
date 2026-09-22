// ===============================================
// MOTOR DE RECOMPRA PREDITIVA — multi-empresa (RHOCAL + MATSEG)
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

// Multi-empresa: pedido_omie_id sozinho não basta como chave — RHOCAL e
// MATSEG são apps Omie separados, cada um com sua própria numeração de
// pedido, então um código pode colidir entre as duas. empresa_id entra na
// chave de upsert (migração 0031) e no filtro de leitura abaixo.

// Best-effort: uma falha ao registrar não pode derrubar o processamento do
// pedido (o pior caso é ele ser re-consultado no próximo ciclo, como antes).
export async function registrarPedidoPulado(
  empresaId: string,
  pedidoOmieId: number | string,
  motivo: MotivoPulado
): Promise<void> {
  try {
    await supabase.from("recompra_pedidos_pulados").upsert(
      {
        empresa_id: empresaId,
        pedido_omie_id: String(pedidoOmieId),
        motivo,
        visto_em: new Date().toISOString(),
      },
      { onConflict: "empresa_id,pedido_omie_id" }
    );
  } catch (err) {
    console.error(
      `[recompra] erro ao registrar pedido pulado ${pedidoOmieId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

// Lista de pedido_omie_id (string) já vistos e pulados NESTA empresa — unida
// ao dedup de pedidos_itens_historico em sincronizarHistorico. Erro de
// leitura devolve lista vazia (degrada pro comportamento antigo, não quebra
// o job).
export async function carregarPedidosPulados(empresaId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("recompra_pedidos_pulados")
    .select("pedido_omie_id")
    .eq("empresa_id", empresaId);

  if (error) {
    console.error(`[recompra] erro ao carregar pedidos pulados: ${error.message}`);
    return [];
  }

  return (data ?? []).map((l) => String(l.pedido_omie_id));
}
