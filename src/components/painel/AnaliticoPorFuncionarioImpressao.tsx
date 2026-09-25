'use client'

import { FolhaImpressao, TabelaImpressao, type CelulaImpressao } from '@/components/impressao/FolhaImpressao'

// Versão de impressão do Analítico por funcionário (A4 paisagem, papel
// branco) — sobre a folha compartilhada (components/impressao). Não calcula
// nada: recebe as células já formatadas pela tela, só das métricas ligadas
// nas pills e das linhas visíveis no momento.

export type { CelulaImpressao }

export interface LinhaImpressao {
  id: string
  nome: string
  inativo: boolean
  celulas: CelulaImpressao[]
}

export function AnaliticoPorFuncionarioImpressao({
  empresaNome,
  logoPath,
  periodoTexto,
  buscaTexto,
  colunas,
  linhas,
  total,
}: {
  empresaNome: string
  logoPath: string
  periodoTexto: string
  buscaTexto: string | null
  colunas: string[]
  linhas: LinhaImpressao[]
  total: CelulaImpressao[]
}) {
  return (
    <FolhaImpressao
      titulo="Analítico por Funcionário"
      empresaNome={empresaNome}
      logoPath={logoPath}
      subtitulos={[
        `Período: ${periodoTexto}`,
        ...(buscaTexto ? [`Funcionários filtrados por: “${buscaTexto}”`] : []),
      ]}
    >
      <TabelaImpressao
        colunaNome="Funcionário"
        colunas={colunas}
        linhas={linhas.map((l) => ({ id: l.id, nome: l.nome, sufixo: l.inativo ? '(inativo)' : null, celulas: l.celulas }))}
        total={{ rotulo: 'TOTAL', celulas: total }}
      />
    </FolhaImpressao>
  )
}
