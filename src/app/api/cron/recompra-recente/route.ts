import { NextResponse } from 'next/server'
import { rodarSincronizacaoRecente } from '@/lib/recompra/sync-recompra-preditiva'
import { supabase } from '@/lib/recompra/supabase-client'

// Job da JANELA RECENTE do Motor de Recompra Preditiva. Complementa o
// /api/cron/recompra-preditiva (backfill completo — ~150 páginas percorridas
// em lotes ao longo de meses, cursor `recompra_pagina_atual`): em vez de
// esperar o cursor do backfill dar a volta, este pega só os pedidos com
// dAlt nos últimos 45 dias (1-2 páginas do ListarPedidos via
// filtrar_por_data_de/ate), então um pedido novo entra no Motor de Recompra
// no dia seguinte. Cursor próprio (`recompra_recente_ultima_execucao`, só
// informativo) — não toca no cursor do backfill, que continua igual.
//
// Só GET (assim que o Vercel Cron chama), protegido pelo mesmo CRON_SECRET.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const resultado = await rodarSincronizacaoRecente()
    return NextResponse.json({
      ok: true,
      executado_em: new Date().toISOString(),
      janela: { de: resultado.janelaDe, ate: resultado.janelaAte },
      paginas_lidas: resultado.paginasLidas,
      codigos_na_janela: resultado.codigosNaJanela,
      processados: resultado.processados,
      restantes_estimado: resultado.restantes,
    })
  } catch (err) {
    const mensagem =
      err instanceof Error ? err.message : 'Erro desconhecido no job de recompra recente.'

    console.error('[cron recente] erro:', err)

    // Roda sem sessão de usuário (chamado pelo agendador) — grava com o mesmo
    // client de service role que o job usa, igual em recompra-preditiva.
    try {
      await supabase.from('error_log').insert({
        rota: '/api/cron/recompra-recente',
        mensagem,
        colaborador: null,
      })
    } catch {
      // Melhor esforço: se o próprio log falhar, não mascara o erro original.
    }

    return NextResponse.json({ ok: false, erro: mensagem }, { status: 500 })
  }
}
