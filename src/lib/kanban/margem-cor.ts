import type { CSSProperties } from 'react'

// Indicador visual de margem no preço de venda (fase 27) — cor calculada a
// partir de "quanto do preço final é custo": percentual = custo_final /
// preco_venda * 100. Quanto MENOR o percentual, melhor a margem. O percentual
// em si nunca é exibido ao comercial — só a cor.
//
// Tons escolhidos para não ficarem próximos do laranja da marca
// (--accent-primary #F1592A) nem do azul de compras (--accent-compras
// #3B7DD8) já usados no resto da interface — evita confundir o indicador de
// margem com outros elementos do design system.
const CORES_MARGEM = {
  otima: '#2563EB', // < 60%: margem ótima, acima do ideal
  boa: '#16A34A', // 60% a 65%: margem boa
  apertando: '#EAB308', // 66% a 70%: margem apertando
  critica: '#DC2626', // 71% a 75%: margem crítica
  perigo: '#7F1D1D', // > 75%: perigo real, preço muito próximo ou abaixo do custo
} as const

export function corMargemPrecoVenda(
  custoFinalRaw: number | string | null,
  precoVenda: number,
): string | null {
  // custo_final é `numeric` no Postgres — o PostgREST devolve como string
  // (ex: "150.00") para não perder precisão, mesmo o tipo TS dizendo `number`.
  if (custoFinalRaw === null || custoFinalRaw === '') return null
  const custoFinal = typeof custoFinalRaw === 'number' ? custoFinalRaw : Number(custoFinalRaw)
  if (!Number.isFinite(custoFinal) || custoFinal < 0) return null
  if (!Number.isFinite(precoVenda) || precoVenda <= 0) return null

  const percentual = (custoFinal / precoVenda) * 100

  if (percentual < 60) return CORES_MARGEM.otima
  if (percentual <= 65) return CORES_MARGEM.boa
  if (percentual <= 70) return CORES_MARGEM.apertando
  if (percentual <= 75) return CORES_MARGEM.critica
  return CORES_MARGEM.perigo
}

// Estilo inline do campo de preço de venda a partir da cor já calculada:
// fundo com opacidade alta (~50%) — não um tingimento sutil — e borda mais
// grossa na cor cheia, para ficar bem visível mesmo à distância contra o
// fundo escuro do sistema.
export function estiloCorMargem(cor: string | null): CSSProperties | undefined {
  if (!cor) return undefined
  return {
    borderColor: cor,
    borderWidth: '2px',
    backgroundColor: `${cor}80`, // ~50% de opacidade
  }
}
