// ===============================================
// MOTOR DE RECOMPRA PREDITIVA — RHOCAL
// Helper de log de erros (fase 25)
// ===============================================
//
// Grava uma linha em error_log — mesmo padrão de colunas usado em
// src/app/api/cron/recompra-preditiva/route.ts e src/lib/omie/registrar-erro.ts
// (rota, mensagem, pedido_id, colaborador, data_hora).
//
// pedido_id/colaborador ficam null: o job roda sem sessão de usuário, e os
// "códigos de pedido" desse fluxo são os do Omie (não uuids da nossa tabela
// pedidos — a FK rejeitaria). O código do pedido vai embutido na mensagem.
//
// Melhor esforço: uma falha ao gravar o log nunca pode mascarar o fluxo
// original que chamou este helper.

import { supabase } from "@/lib/recompra/supabase-client";

export async function registrarErroLog(mensagem: string): Promise<void> {
  try {
    await supabase.from("error_log").insert({
      rota: "/api/cron/recompra-preditiva",
      mensagem,
      pedido_id: null,
      colaborador: null,
      data_hora: new Date().toISOString(),
    });
  } catch (logErr) {
    console.error(
      `[recompra] erro ao gravar em error_log: ${
        logErr instanceof Error ? logErr.message : String(logErr)
      }`
    );
  }
}
