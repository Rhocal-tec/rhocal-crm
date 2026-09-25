'use client'

import { FolhaImpressao, TabelaImpressao, type LinhaImpressao } from '@/components/impressao/FolhaImpressao'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import type { MetricasProdutividade, MetricasTarefas } from '@/lib/produtividade/calculo'

// Versão de impressão da aba Produtividade (A4 paisagem, papel branco) —
// mesma folha compartilhada do Analítico por funcionário. Não calcula nada:
// recebe as métricas já agregadas pela tela. Só dados: sem pills, botões nem
// edição de metas. Três seções (resultado da empresa, metas por vendedora,
// os dois grupos de contadores); a que não couber na página vai inteira pra
// próxima, com o cabeçalho repetido — a fonte nunca diminui.

export interface VendedoraImpressao {
  id: string
  nome: string
  metaPessoal: number
  m: MetricasProdutividade
  t: MetricasTarefas
}

function pctTexto(valor: number, meta: number): string {
  return meta > 0 ? `${Math.round((valor / meta) * 100)}%` : '—'
}

function celula(principal: string | number, secundario: string | null = null) {
  return { principal: String(principal), secundario }
}

const COLUNAS_TAREFAS = [
  'Nova Tarefa',
  'Hoje',
  'Tarefas Futuras',
  'Concluídas',
  'Atrasadas',
  'Oportunidades',
  'Oport. Concluídas',
]

const COLUNAS_PEDIDOS = ['Orçamentos', 'Orçamentos Cotados', 'Pedidos Aprovados', 'Pedidos Efetuados', 'Pedidos Entregues']

function celulasTarefas(t: MetricasTarefas) {
  return [t.novaTarefa, t.hoje, t.futuras, t.concluidas, t.atrasadas, t.oportunidades, t.oportunidadesConcluidas].map(
    (n) => celula(n),
  )
}

// Sem os marcos completos (migração 0033 pendente), Cotados/Aprovados/
// Entregues saem "—", igual na tela.
function celulasPedidos(m: MetricasProdutividade, marcosCompletos: boolean) {
  const marco = (n: number) => celula(marcosCompletos ? n : '—')
  return [celula(m.propostas), marco(m.cotados), marco(m.aprovados), celula(m.faturados), marco(m.entregues)]
}

export function ProdutividadeImpressao({
  empresaNome,
  logoPath,
  mesTexto,
  metaGlobal,
  equipe,
  equipeTarefas,
  vendedoras,
  mostrarEquipe,
  marcosCompletos,
}: {
  empresaNome: string
  logoPath: string
  mesTexto: string
  metaGlobal: number
  equipe: MetricasProdutividade
  equipeTarefas: MetricasTarefas
  vendedoras: VendedoraImpressao[]
  // Gestor imprime também a linha TOTAL (equipe); o comercial, que na tela
  // só vê o próprio resultado, imprime só a própria linha.
  mostrarEquipe: boolean
  marcosCompletos: boolean
}) {
  const linhasMetas: LinhaImpressao[] = vendedoras.map((v) => ({
    id: v.id,
    nome: v.nome,
    celulas: [
      celula(v.metaPessoal > 0 ? formatarMoeda(v.metaPessoal) : '—'),
      celula(formatarMoeda(v.m.faturadoValor)),
      celula(pctTexto(v.m.faturadoValor, v.metaPessoal)),
      celula(pctTexto(v.m.faturadoValor, metaGlobal)),
    ],
  }))

  return (
    <FolhaImpressao
      titulo="Produtividade Comercial"
      empresaNome={empresaNome}
      logoPath={logoPath}
      subtitulos={[mesTexto]}
    >
      <section className="folha-impressao-secao">
        <h2>Resultado da empresa</h2>
        <TabelaImpressao
          colunaNome="Empresa"
          colunas={['Meta global', 'Faturado', '% da meta atingida', 'Não faturado']}
          linhas={[
            {
              id: 'empresa',
              nome: empresaNome,
              celulas: [
                celula(metaGlobal > 0 ? formatarMoeda(metaGlobal) : '—'),
                celula(formatarMoeda(equipe.faturadoValor)),
                celula(pctTexto(equipe.faturadoValor, metaGlobal)),
                celula(formatarMoeda(equipe.naoFaturadoValor)),
              ],
            },
          ]}
        />
      </section>

      <section className="folha-impressao-secao">
        <h2>Metas por vendedora</h2>
        <TabelaImpressao
          colunaNome="Vendedora"
          colunas={['Meta pessoal', 'Faturado', '% meta pessoal', '% da meta global']}
          linhas={linhasMetas}
        />
      </section>

      <section className="folha-impressao-secao">
        <h2>Tarefas e Oportunidades</h2>
        <TabelaImpressao
          colunaNome="Vendedora"
          colunas={COLUNAS_TAREFAS}
          linhas={vendedoras.map((v) => ({ id: v.id, nome: v.nome, celulas: celulasTarefas(v.t) }))}
          total={mostrarEquipe ? { rotulo: 'EQUIPE', celulas: celulasTarefas(equipeTarefas) } : null}
        />
      </section>

      <section className="folha-impressao-secao">
        <h2>Orçamentos e Pedidos</h2>
        <TabelaImpressao
          colunaNome="Vendedora"
          colunas={COLUNAS_PEDIDOS}
          linhas={vendedoras.map((v) => ({ id: v.id, nome: v.nome, celulas: celulasPedidos(v.m, marcosCompletos) }))}
          total={mostrarEquipe ? { rotulo: 'EQUIPE', celulas: celulasPedidos(equipe, marcosCompletos) } : null}
        />
      </section>
    </FolhaImpressao>
  )
}
