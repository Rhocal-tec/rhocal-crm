import { NextResponse } from 'next/server'
import { rodarSincronizacaoDiaria } from '@/lib/recompra/sync-recompra-preditiva'
import { supabase } from '@/lib/recompra/supabase-client'

// Job diário do Motor de Recompra Preditiva, disparado pelo Vercel Cron
// (vercel.json — 06:00 UTC = 03:00 horário de Brasília). Só GET (é assim que
// o Vercel Cron chama), protegido por CRON_SECRET (env var — nunca expor no
// client) pra ninguém além do próprio agendador conseguir disparar o job.
//
// Confirmado ao vivo (Vercel Function Logs) que o gargalo é a LISTAGEM
// paginada de pedidos (listarCodigosDePedidos, não paginada em lote) — a
// função morre no meio dela, antes de sequer chegar no lote de detalhe.
// Também confirmado que o maxDuration configurado É respeitado (o log
// mostrou "Task timed out after 60 seconds" batendo exatamente com o valor
// anterior) — 300s é o teto documentado do plano Hobby com Fluid Compute,
// dando 5x mais margem pra listagem terminar.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Diagnóstico temporário — confirma se as env vars chegam no contexto
  // server-side do cron sem expor os valores reais. Remover depois de
  // confirmar que o problema não é de configuração de ambiente.
  console.log(
    '[cron] OMIE_APP_KEY_RHOCAL:',
    !!process.env.OMIE_APP_KEY_RHOCAL,
    'OMIE_APP_SECRET_RHOCAL:',
    !!process.env.OMIE_APP_SECRET_RHOCAL,
    'SUPABASE_SERVICE_ROLE_KEY:',
    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  try {
    const resultado = await rodarSincronizacaoDiaria()
    return NextResponse.json({
      ok: true,
      executado_em: new Date().toISOString(),
      processados: resultado.processados,
      restantes: resultado.restantes,
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

    // DEBUG TEMPORÁRIO — expõe stack trace completo no corpo da resposta pra
    // diagnosticar o 500 que não estava dando pra ver o motivo real. Status
    // 200 de propósito (o PowerShell/Invoke-WebRequest esconde o corpo em
    // respostas não-2xx por padrão). Reverter pra { erro: mensagem } com
    // status 500 assim que o erro real for identificado.
    return NextResponse.json(
      {
        ok: false,
        erro: mensagem,
        stack: err instanceof Error ? err.stack ?? null : null,
      },
      { status: 200 },
    )
  }
}
