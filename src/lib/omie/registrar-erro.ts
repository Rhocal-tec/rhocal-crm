import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = ReturnType<typeof createClient>

// Fase 25: log de erros próprio, sem depender de serviço externo (Sentry
// etc.) — grava direto no Supabase para o gestor consultar no Painel
// executivo. Nunca deixa uma falha ao registrar o log derrubar a resposta de
// erro original que a rota já ia devolver ao usuário.
export async function registrarErro(
  supabase: SupabaseServerClient,
  params: {
    rota: string
    mensagem: string
    pedidoId?: string | null
    colaboradorId?: string | null
  },
) {
  try {
    await supabase.from('error_log').insert({
      rota: params.rota,
      // A mensagem já vem das rotas — nunca deve incluir chaves de API ou
      // dados sensíveis, mesma regra que já vale pro banner de erro no client.
      mensagem: params.mensagem,
      pedido_id: params.pedidoId ?? null,
      colaborador: params.colaboradorId ?? null,
    })
  } catch {
    // Melhor esforço: se o próprio log falhar (rede, RLS, etc.), ignora.
  }
}
