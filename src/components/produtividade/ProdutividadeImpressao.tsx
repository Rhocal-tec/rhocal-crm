'use client'

import {
  FolhaImpressao,
  TabelaImpressao,
  type CelulaImpressao,
  type LinhaImpressao,
} from '@/components/impressao/FolhaImpressao'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import type { MetricasProdutividade, MetricasTarefas } from '@/lib/produtividade/calculo'

// Versão de impressão da aba Produtividade (A4 paisagem, papel branco) —
// mesma folha compartilhada do Analítico por funcionário, na variante
// "relatorio" (fonte e espaçamentos maiores). Não calcula nada: recebe as
// métricas já agregadas pela tela. Só dados: sem pills, botões nem edição
// de metas.
//
// Diagramação pensada pra paisagem, uma grade 2×2:
//   em cima, resultado da empresa (indicadores 2×2) ao lado das metas por
//   vendedora; embaixo, os dois grupos de contadores LADO A LADO,
//   transpostos (um contador por linha, uma vendedora por coluna) —
//   preenche a folha em vez de empilhar tabelas baixinhas e deixar metade
//   da página em branco. Cada faixa da grade muda de página inteira.
// Com muitas vendedoras (mais de LIMITE_TRANSPOSTA colunas), a transposta
// ficaria estreita demais: os grupos voltam a uma linha por vendedora,
// empilhados. Se não couber numa página, quebra com o cabeçalho repetido —
// a fonte nunca diminui.

export interface VendedoraImpressao {
  id: string
  nome: string
  metaPessoal: number
  m: MetricasProdutividade
  t: MetricasTarefas
}

const LIMITE_TRANSPOSTA = 4

function pctTexto(valor: number, meta: number): string {
  return meta > 0 ? `${Math.round((valor / meta) * 100)}%` : '—'
}

function celula(principal: string | number): CelulaImpressao {
  return { principal: String(principal), secundario: null }
}

const ROTULOS_TAREFAS = [
  'Nova Tarefa',
  'Hoje',
  'Tarefas Futuras',
  'Concluídas',
  'Atrasadas',
  'Oportunidades',
  'Oport. Concluídas',
]

const ROTULOS_PEDIDOS = ['Orçamentos', 'Orçamentos Cotados', 'Pedidos Aprovados', 'Pedidos Efetuados', 'Pedidos Entregues']

function valoresTarefas(t: MetricasTarefas): CelulaImpressao[] {
  return [t.novaTarefa, t.hoje, t.futuras, t.concluidas, t.atrasadas, t.oportunidades, t.oportunidadesConcluidas].map(
    (n) => celula(n),
  )
}

// Sem os marcos completos (migração 0033 pendente), Cotados/Aprovados/
// Entregues saem "—", igual na tela.
function valoresPedidos(m: MetricasProdutividade, marcosCompletos: boolean): CelulaImpressao[] {
  const marco = (n: number) => celula(marcosCompletos ? n : '—')
  return [celula(m.propostas), marco(m.cotados), marco(m.aprovados), celula(m.faturados), marco(m.entregues)]
}

interface Serie {
  id: string
  nome: string
  valores: CelulaImpressao[]
}

// Um grupo de contadores em qualquer das duas orientações.
function GrupoContadores({
  titulo,
  rotulos,
  series,
  equipe,
  transposta,
}: {
  titulo: string
  rotulos: string[]
  series: Serie[]
  equipe: CelulaImpressao[] | null
  transposta: boolean
}) {
  if (transposta) {
    const colunas = [...series.map((s) => s.nome), ...(equipe ? ['Equipe'] : [])]
    const linhas: LinhaImpressao[] = rotulos.map((rotulo, i) => ({
      id: rotulo,
      nome: rotulo,
      celulas: [...series.map((s) => s.valores[i]), ...(equipe ? [equipe[i]] : [])],
    }))
    return (
      <section className="folha-impressao-secao relatorio-transposta">
        <h2>{titulo}</h2>
        <TabelaImpressao colunaNome="Indicador" colunas={colunas} linhas={linhas} />
      </section>
    )
  }
  return (
    <section className="folha-impressao-secao relatorio-empilhada">
      <h2>{titulo}</h2>
      <TabelaImpressao
        colunaNome="Vendedora"
        colunas={rotulos}
        linhas={series.map((s) => ({ id: s.id, nome: s.nome, celulas: s.valores }))}
        total={equipe ? { rotulo: 'EQUIPE', celulas: equipe } : null}
      />
    </section>
  )
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
  // Gestor imprime também a equipe; o comercial, que na tela só vê o
  // próprio resultado, imprime só a própria coluna/linha.
  mostrarEquipe: boolean
  marcosCompletos: boolean
}) {
  const transposta = vendedoras.length <= LIMITE_TRANSPOSTA

  const indicadores = [
    { rotulo: 'Meta global', valor: metaGlobal > 0 ? formatarMoeda(metaGlobal) : '—' },
    { rotulo: 'Faturado', valor: formatarMoeda(equipe.faturadoValor) },
    { rotulo: '% atingida', valor: pctTexto(equipe.faturadoValor, metaGlobal) },
    { rotulo: 'Não faturado', valor: formatarMoeda(equipe.naoFaturadoValor) },
  ]

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

  const grupoTarefas = (
    <GrupoContadores
      titulo="Tarefas e Oportunidades"
      rotulos={ROTULOS_TAREFAS}
      series={vendedoras.map((v) => ({ id: v.id, nome: v.nome, valores: valoresTarefas(v.t) }))}
      equipe={mostrarEquipe ? valoresTarefas(equipeTarefas) : null}
      transposta={transposta}
    />
  )
  const grupoPedidos = (
    <GrupoContadores
      titulo="Orçamentos e Pedidos"
      rotulos={ROTULOS_PEDIDOS}
      series={vendedoras.map((v) => ({ id: v.id, nome: v.nome, valores: valoresPedidos(v.m, marcosCompletos) }))}
      equipe={mostrarEquipe ? valoresPedidos(equipe, marcosCompletos) : null}
      transposta={transposta}
    />
  )

  return (
    <FolhaImpressao
      titulo="Produtividade Comercial"
      empresaNome={empresaNome}
      logoPath={logoPath}
      subtitulos={[mesTexto]}
      variante="relatorio"
    >
      <div className="relatorio-duas-colunas relatorio-topo">
        <section className="folha-impressao-secao">
          <h2>Resultado da empresa</h2>
          <div className="relatorio-indicadores">
            {indicadores.map((i) => (
              <div key={i.rotulo} className="relatorio-indicador">
                <span className="relatorio-indicador-rotulo">{i.rotulo}</span>
                <span className="relatorio-indicador-valor">{i.valor}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="folha-impressao-secao">
          <h2>Metas por vendedora</h2>
          <TabelaImpressao
            colunaNome="Vendedora"
            colunas={['Meta pessoal', 'Faturado', '% meta pessoal', '% meta global']}
            linhas={linhasMetas}
            larguras={['24%', '23%', '23%', '15%', '15%']}
          />
        </section>
      </div>

      {transposta ? (
        <div className="relatorio-duas-colunas">
          {grupoTarefas}
          {grupoPedidos}
        </div>
      ) : (
        <>
          {grupoTarefas}
          {grupoPedidos}
        </>
      )}
    </FolhaImpressao>
  )
}
