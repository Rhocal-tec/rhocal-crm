// Verifica se todo item do pedido já tem cotação vencedora marcada E custo_final
// preenchido. Usado apenas para gerar um aviso não bloqueante ao mover para
// PEDIDO_COTADO — a movimentação é permitida mesmo quando o resultado não é `ok`.
import type { createClient } from '@/lib/supabase/client'

type SupabaseBrowserClient = ReturnType<typeof createClient>

export type ResultadoValidacao = { ok: true } | { ok: false; mensagem: string }

export async function validarPedidoParaCotado(
  supabase: SupabaseBrowserClient,
  pedidoId: string,
): Promise<ResultadoValidacao> {
  const { data: todosItens, error: erroItens } = await supabase
    .from('pedido_itens')
    .select('id, descricao, custo_final, em_estoque')
    .eq('pedido_id', pedidoId)

  if (erroItens || !todosItens) {
    return { ok: false, mensagem: 'Não foi possível validar as cotações do pedido.' }
  }

  if (todosItens.length === 0) {
    return { ok: false, mensagem: 'O pedido não tem itens cadastrados.' }
  }

  // Itens já em estoque (fase 26) não passam pela cotação — não contam como
  // pendência aqui.
  const itens = todosItens.filter((item) => !item.em_estoque)

  if (itens.length === 0) {
    return { ok: true }
  }

  const itemIds = itens.map((item) => item.id)

  const { data: vencedoras, error: erroCotacoes } = await supabase
    .from('cotacoes')
    .select('item_id')
    .in('item_id', itemIds)
    .eq('vencedora', true)

  if (erroCotacoes) {
    return { ok: false, mensagem: 'Não foi possível validar as cotações do pedido.' }
  }

  const itensComVencedora = new Set((vencedoras ?? []).map((c) => c.item_id))

  const pendentes = itens.filter(
    (item) => !itensComVencedora.has(item.id) || item.custo_final === null,
  )

  if (pendentes.length > 0) {
    const lista = pendentes.map((item) => `"${item.descricao}"`).join(', ')
    return {
      ok: false,
      mensagem: `Falta cotação vencedora e/ou custo final nos itens: ${lista}.`,
    }
  }

  return { ok: true }
}
