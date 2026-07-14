// Gráfico de barras horizontal em HTML puro (sem libs externas): magnitude por
// categoria, cada barra com rótulo direto (nome + valor) — não precisa de
// legenda separada porque a identidade nunca depende só da cor.
export interface BarraDado {
  chave: string
  rotulo: string
  valor: number
  rotuloValor: string
  corVar?: string
}

export function GraficoBarras({
  dados,
  corPadrao,
  vazioTexto,
}: {
  dados: BarraDado[]
  corPadrao: string
  vazioTexto: string
}) {
  if (dados.length === 0) {
    return <p className="text-sm text-muted">{vazioTexto}</p>
  }

  const max = Math.max(1, ...dados.map((d) => d.valor))

  return (
    <div className="flex flex-col gap-2.5">
      {dados.map((d) => (
        <div key={d.chave} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate text-xs text-muted" title={d.rotulo}>
            {d.rotulo}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(2, (d.valor / max) * 100)}%`,
                background: d.corVar ? `var(${d.corVar})` : corPadrao,
              }}
              title={`${d.rotulo}: ${d.rotuloValor}`}
            />
          </div>
          <span className="w-28 shrink-0 text-right font-mono text-xs text-primary">
            {d.rotuloValor}
          </span>
        </div>
      ))}
    </div>
  )
}
