// ===============================================
// MOTOR DE RECOMPRA PREDITIVA — RHOCAL
// Função de co-ocorrência de itens (cross-sell) — v1 / MVP
// ===============================================

export interface ItemPedido {
  pedidoId: string;
  itemCodigo: string;
  itemNome: string;
}

export interface AssociacaoItem {
  itemPrincipal: string;
  itemAssociado: string;
  nomeAssociado: string;
  vezesJuntos: number;
  totalPedidosComPrincipal: number;
  frequenciaConjunta: number;
}

export function calcularCoOcorrencia(
  itensPedidos: ItemPedido[],
  frequenciaMinima = 0.3,
  minVezesJuntos = 2
): AssociacaoItem[] {
  const itensPorPedido = new Map<string, ItemPedido[]>();
  for (const item of itensPedidos) {
    const lista = itensPorPedido.get(item.pedidoId) ?? [];
    lista.push(item);
    itensPorPedido.set(item.pedidoId, lista);
  }

  const totalPedidosPorItem = new Map<string, number>();
  const paresJuntos = new Map<string, number>();
  const nomesPorCodigo = new Map<string, string>();

  for (const itens of Array.from(itensPorPedido.values())) {
    const codigosUnicos = Array.from(new Set(itens.map((i) => i.itemCodigo)));

    for (const item of itens) nomesPorCodigo.set(item.itemCodigo, item.itemNome);

    for (const codigo of codigosUnicos) {
      totalPedidosPorItem.set(codigo, (totalPedidosPorItem.get(codigo) ?? 0) + 1);
    }

    for (const a of codigosUnicos) {
      for (const b of codigosUnicos) {
        if (a === b) continue;
        const chave = `${a}|${b}`;
        paresJuntos.set(chave, (paresJuntos.get(chave) ?? 0) + 1);
      }
    }
  }

  const resultado: AssociacaoItem[] = [];
  for (const [chave, vezesJuntos] of Array.from(paresJuntos.entries())) {
    const [principal, associado] = chave.split("|");
    const totalPrincipal = totalPedidosPorItem.get(principal) ?? 0;
    if (totalPrincipal === 0) continue;

    const frequencia = vezesJuntos / totalPrincipal;

    if (vezesJuntos >= minVezesJuntos && frequencia >= frequenciaMinima) {
      resultado.push({
        itemPrincipal: principal,
        itemAssociado: associado,
        nomeAssociado: nomesPorCodigo.get(associado) ?? associado,
        vezesJuntos,
        totalPedidosComPrincipal: totalPrincipal,
        frequenciaConjunta: Number((frequencia * 100).toFixed(1)),
      });
    }
  }

  return resultado.sort((a, b) => b.frequenciaConjunta - a.frequenciaConjunta);
}
