// app/api/mobcall/click-to-call/route.ts
//
// Dispara uma ligação via Mobcall a partir do CRM (botão "click-to-call").
// Auth: header X-API-KEY (confirmado na doc Swagger da Mobcall v2.2)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MOBCALL_API_URL = process.env.MOBCALL_API_URL!; // ex: https://api.mobcall.com/v2.2
const MOBCALL_API_KEY = process.env.MOBCALL_API_KEY!; // NUNCA hardcode — só via env

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { numero_destino, oportunidade_id, usuario_id, device } =
      await req.json();

    if (!numero_destino || !usuario_id) {
      return NextResponse.json(
        { error: "numero_destino e usuario_id são obrigatórios" },
        { status: 400 }
      );
    }

    // 1. Busca o ramal (extension) do vendedor logado
    const { data: perfil, error: perfilError } = await supabase
      .from("profiles")
      .select("ramal_mobcall, nome")
      .eq("id", usuario_id)
      .single();

    if (perfilError || !perfil?.ramal_mobcall) {
      return NextResponse.json(
        { error: "Usuário não tem ramal Mobcall configurado em profiles.ramal_mobcall" },
        { status: 400 }
      );
    }

    // 2. Dispara a chamada na Mobcall
    const mobcallResponse = await fetch(`${MOBCALL_API_URL}/calls/click-to-call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": MOBCALL_API_KEY,
      },
      body: JSON.stringify({
        extension: perfil.ramal_mobcall,
        destination: numero_destino.replace(/\D/g, ""), // só dígitos
        device: device ?? "MOBILE",
        levelId: 0,
      }),
    });

    if (!mobcallResponse.ok) {
      const errorBody = await mobcallResponse.text();
      return NextResponse.json(
        { error: "Falha ao iniciar chamada na Mobcall", detail: errorBody },
        { status: 502 }
      );
    }

    const mobcallData = await mobcallResponse.json();

    // 3. Registra a chamada no CRM como "em andamento"
    // Obs: como não há webhook, o status/duração real serão preenchidos
    // depois pela sincronização periódica (route-sync-calls.ts)
    const { data: chamada, error } = await supabase
      .from("chamadas")
      .insert({
        mobcall_call_id: mobcallData.id ? String(mobcallData.id) : null,
        direcao: "saida",
        status: "em_andamento",
        numero_origem: perfil.ramal_mobcall,
        numero_destino,
        oportunidade_id: oportunidade_id ?? null,
        usuario_id,
        iniciada_em: new Date().toISOString(),
        payload_bruto: mobcallData,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, chamada });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: mensagem }, { status: 500 });
  }
}
