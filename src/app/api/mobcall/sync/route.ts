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
      if (!chamada.oportunidade_id) {
        await supabase.rpc("vincular_chamada_oportunidade", {
          chamada_id: chamada.id,
        });
        vinculadas++;
      }
    }
  }

  return NextResponse.json({ success: true, sincronizadas, vinculadas });
}
