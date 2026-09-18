// app/api/mobcall/sync/route.ts
//
// Busca chamadas recentes na Mobcall (GET /calls) e sincroniza com o CRM.
// A Mobcall não tem webhook, então essa rota é chamada periodicamente
// (Vercel Cron — ver vercel.json) em vez de ser acionada em tempo real.
//
// Auth: header X-API-KEY

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MOBCALL_API_URL = process.env.MOBCALL_API_URL!;
const MOBCALL_API_KEY = process.env.MOBCALL_API_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!; // protege a rota de chamadas externas

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const statusMap: Record<string, string> = {
  ANSWERED: "atendida",
  "NO-ANSWER": "nao_atendida",
  NOANSWER: "nao_atendida",
  BUSY: "nao_atendida",
  FAILED: "falha",
  ONGOING: "em_andamento",
};

export async function GET(req: NextRequest) {
  // Protege contra chamadas externas — só o Vercel Cron (ou você manualmente
  // com o header certo) pode disparar essa sincronização
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Busca chamadas desde os últimos 15 minutos (ajustar conforme frequência do cron)
  const startDate = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const endDate = new Date().toISOString();

  // Log de diagnóstico — confirma em error_log (fase 25) qual MOBCALL_API_URL
  // e qual janela essa instância está realmente usando em produção, sem
  // expor a X-API-KEY. Mesmo padrão do motor de recompra (registrarErroLog).
  try {
    const { error: logError } = await supabase.from("error_log").insert({
      rota: "/api/mobcall/sync",
      mensagem: `MOBCALL_API_URL=${MOBCALL_API_URL} janela=${startDate}->${endDate}`,
      pedido_id: null,
      colaborador: null,
      data_hora: new Date().toISOString(),
    });
    // supabase-js não lança exceção em erro de insert (RLS, coluna, etc.) —
    // ele resolve com { error }. Sem checar isso explicitamente, uma falha
    // fica muda: nem cai no catch, nem aparece no error_log.
    if (logError) {
      console.error(
        `[mobcall/sync] erro ao gravar em error_log: ${logError.message}`
      );
    }
  } catch (logErr) {
    console.error(
      `[mobcall/sync] erro ao gravar em error_log: ${
        logErr instanceof Error ? logErr.message : String(logErr)
      }`
    );
  }

  const mobcallResponse = await fetch(
    `${MOBCALL_API_URL}/calls?startDate=${startDate}&endDate=${endDate}&page=1&perPage=200`,
    {
      headers: { "X-API-KEY": MOBCALL_API_KEY },
    }
  );

  if (!mobcallResponse.ok) {
    const detail = await mobcallResponse.text();
    return NextResponse.json(
      { error: "Falha ao buscar chamadas na Mobcall", detail },
      { status: 502 }
    );
  }

  const calls = await mobcallResponse.json();
  let sincronizadas = 0;
  let vinculadas = 0;

  for (const call of calls) {
    const direcao = call.type === "OUTBOUND" ? "saida" : "entrada";

    const { data: chamada, error } = await supabase
      .from("chamadas")
      .upsert(
        {
          mobcall_call_id: String(call.id),
          direcao,
          status: statusMap[call.status] ?? "em_andamento",
          numero_origem: call.sourceNumber,
          numero_destino: call.destinationNumber,
          duracao_segundos: call.duration ?? null,
          iniciada_em: call.startedAt ?? null,
          finalizada_em: call.endedAt ?? null,
          payload_bruto: call,
        },
        { onConflict: "mobcall_call_id" }
      )
      .select()
      .single();

    if (!error && chamada) {
      sincronizadas++;
      // Chamada sincronizada pelo cron não tem usuário logado nem contexto de
      // browser (diferente do click-to-call) — a única forma de descobrir a
      // empresa aqui é via oportunidade vinculada. Sem match de oportunidade,
      // empresa_id fica null (não há como adivinhar).
      if (!chamada.oportunidade_id) {
        await supabase.rpc("vincular_chamada_oportunidade", {
          chamada_id: chamada.id,
        });
        vinculadas++;

        const { data: chamadaAtualizada } = await supabase
          .from("chamadas")
          .select("oportunidade_id")
          .eq("id", chamada.id)
          .single();

        if (chamadaAtualizada?.oportunidade_id) {
          const { data: oportunidade } = await supabase
            .from("oportunidades")
            .select("empresa_id")
            .eq("id", chamadaAtualizada.oportunidade_id)
            .maybeSingle();

          if (oportunidade?.empresa_id) {
            await supabase
              .from("chamadas")
              .update({ empresa_id: oportunidade.empresa_id })
              .eq("id", chamada.id);
          }
        }
      }
    }
  }

  return NextResponse.json({ success: true, sincronizadas, vinculadas });
}
