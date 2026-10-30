import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { paginar } from './paginar'

export type Indicador = 'pedidos_efetuados' | 'tarefas_concluidas' | 'oportunidades_criadas' | 'contatos_cs'

export const INDICADORES: Record<Indicador, { rotulo: string; unidade: string }> = {
  pedidos_efetuados: { rotulo: 'Pedidos efetuados', unidade: 'pedidos' },
  tarefas_concluidas: { rotulo: 'Tarefas concluídas', unidade: 'tarefas' },
  oportunidades_criadas: { rotulo: 'Oportunidades criadas', unidade: 'oportunidades' },
  contatos_cs: { rotulo: 'Contatos de CS realizados', unidade: 'contatos' },
}

type Cliente = SupabaseClient<Database>

// Conta o indicador no período [inicioISO, fimISO) para a empresa informada.
export async function contarIndicador(
  supabase: Cliente,
  indicador: Indicador,
  empresaId: string,
  inicioISO: string,
  fimISO: string,
): Promise<number> {
  if (indicador === 'pedidos_efetuados') {
    const linhas = await paginar<{ pedido_id: string; efetuado_em: string }>((de, ate) =>
      supabase.rpc('fn_pedidos_efetuados', { p_empresa_id: empresaId }).range(de, ate),
    )
    return linhas.filter((l) => l.efetuado_em >= inicioISO && l.efetuado_em < fimISO).length
  }
  if (indicador === 'tarefas_concluidas') {
    const { count } = await supabase
      .from('tarefas')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('excluida', false)
      .eq('concluida', true)
      .gte('concluida_em', inicioISO)
      .lt('concluida_em', fimISO)
    return count ?? 0
  }
  if (indicador === 'oportunidades_criadas') {
    const { count } = await supabase
      .from('oportunidades')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .gte('criado_em', inicioISO)
      .lt('criado_em', fimISO)
    return count ?? 0
  }
  const { count } = await supabase
    .from('cs_contatos')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .neq('status', 'em_andamento')
    .gte('criado_em', inicioISO)
    .lt('criado_em', fimISO)
  return count ?? 0
}

// Datas (YYYY-MM-DD) → intervalo ISO em horário local: [início 00:00, dia seguinte 00:00).
export function intervaloDeDatas(inicio: string, fim: string): { inicioISO: string; fimISO: string } {
  const [ai, mi, di] = inicio.split('-').map(Number)
  const [af, mf, df] = fim.split('-').map(Number)
  return {
    inicioISO: new Date(ai, mi - 1, di, 0, 0, 0).toISOString(),
    fimISO: new Date(af, mf - 1, df + 1, 0, 0, 0).toISOString(),
  }
}
