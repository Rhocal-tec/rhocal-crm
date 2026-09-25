'use client'

import { useEffect, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'

// Versão de impressão do Analítico por funcionário (A4 paisagem, papel
// branco). Não calcula nada: recebe as células já formatadas pela tela, só
// das métricas ligadas nas pills e das linhas visíveis no momento.
//
// Renderizada via portal direto no <body> e escondida na tela; no
// @media print (globals.css, bloco "Impressão do Analítico"), é a única coisa
// que aparece — o resto da página some com display:none, então não sobra
// página em branco nem o tema escuro. As regras só valem quando este
// elemento existe na página (:has), então imprimir qualquer outra tela
// continua funcionando normalmente.

export interface CelulaImpressao {
  principal: string
  secundario: string | null
}

export interface LinhaImpressao {
  id: string
  nome: string
  inativo: boolean
  celulas: CelulaImpressao[]
}

function agora(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  const [montado, setMontado] = useState(false)
  const [impressoEm, setImpressoEm] = useState('')

  // Portal só depois de montar (document não existe no render do servidor).
  // A data/hora é atualizada no beforeprint com flushSync, pra sair a hora
  // em que a impressão foi de fato pedida (botão ou Ctrl+P).
  useEffect(() => {
    setMontado(true)
    setImpressoEm(agora())
    const antesDeImprimir = () => flushSync(() => setImpressoEm(agora()))
    window.addEventListener('beforeprint', antesDeImprimir)
    return () => window.removeEventListener('beforeprint', antesDeImprimir)
  }, [])

  if (!montado) return null

  return createPortal(
    <div className="analitico-impressao">
      <header className="analitico-impressao-cabecalho">
        {/* <img> simples em vez de next/image: o elemento fica escondido na
            tela, e o lazy-load do next/image poderia nunca carregar a logo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoPath} alt={empresaNome} className="analitico-impressao-logo" />
        <div>
          <h1>Analítico por Funcionário</h1>
          <p className="analitico-impressao-empresa">{empresaNome}</p>
          <p>Período: {periodoTexto}</p>
          {buscaTexto && <p>Funcionários filtrados por: &ldquo;{buscaTexto}&rdquo;</p>}
        </div>
      </header>

      <table className="analitico-impressao-tabela">
        <thead>
          <tr>
            <th className="analitico-impressao-nome">Funcionário</th>
            {colunas.map((coluna) => (
              <th key={coluna}>{coluna}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.id}>
              <td className="analitico-impressao-nome">
                {linha.nome}
                {linha.inativo && <span className="analitico-impressao-secundario"> (inativo)</span>}
              </td>
              {linha.celulas.map((celula, i) => (
                <td key={colunas[i]}>
                  <span className="analitico-impressao-principal">{celula.principal}</span>
                  {celula.secundario && <span className="analitico-impressao-secundario">{celula.secundario}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="analitico-impressao-nome">TOTAL</td>
            {total.map((celula, i) => (
              <td key={colunas[i]}>
                <span className="analitico-impressao-principal">{celula.principal}</span>
                {celula.secundario && <span className="analitico-impressao-secundario">{celula.secundario}</span>}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      <footer className="analitico-impressao-rodape">Impresso em {impressoEm}</footer>
    </div>,
    document.body,
  )
}
