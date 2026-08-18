import { NextResponse } from 'next/server'
import { rodarSincronizacaoDiaria } from '@/lib/recompra/sync-recompra-preditiva'
import { supabase } from '@/lib/recompra/supabase-client'

// Job diário do Motor de Recompra Preditiva, disparado pelo Vercel Cron
// (vercel.json — 06:00 UTC = 03:00 horário de Brasília). Só GET (é assim que
// o Vercel Cron chama), protegido por CRON_SECRET (env var — nunca expor no
// client) pra ninguém além do próprio agendador conseguir disparar o job.
//
// Confirmado ao vivo (Vercel Function Logs) que o erro era
// FUNCTION_INVOCATION_TIMEOUT puro: listarCodigosDePedidos (listagem
// paginada COMPLETA de pedidos, antes de processar qualquer coisa) sozinha
// já estourava o tempo de execução — por isso o try/catch abaixo nunca
// chegava a rodar. Corrigido na origem: omie-client.ts agora lista só UMA
// página por execução (listarPaginaDePedidos), com o cursor de página em
// sync_estado.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const resultado = await rodarSincronizacaoDiaria()
    return NextResponse.json({
      ok: true,
      executado_em: new Date().toISOString(),
      processados: resultado.processados,
      pagina_atual: resultado.paginaAtual,
      restantes_estimado: resultado.restantes,
    })
  } catch (err) {
    const mensagem =
      err instanceof Error ? err.message : 'Erro desconhecido no job de recompra preditiva.'

    console.error('[cron] erro:', err)

    // Roda sem sessão de usuário (chamado pelo agendador, não por alguém
    // logado) — por isso grava com o mesmo client de service role que o job
    // já usa (@/lib/recompra/supabase-client), em vez do helper
    // registrarErro (@/lib/omie/registrar-erro), que depende da sessão via
    // cookies do client autenticado e não se aplica aqui.
    try {
      await supabase.from('error_log').insert({
        rota: '/api/cron/recompra-preditiva',
        mensagem,
        colaborador: null,
      })
    } catch {
      // Melhor esforço: se o próprio log falhar, não deixa isso mascarar o
      // erro original do job.
    }

    return NextResponse.json({ ok: false, erro: mensagem }, { status: 500 })
  }
}
