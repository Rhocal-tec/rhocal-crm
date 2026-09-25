'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'

// Folha de impressão A4 paisagem, papel branco — base compartilhada das
// versões de impressão (Analítico por funcionário, Produtividade). Não
// calcula nada: recebe o conteúdo já formatado pela tela.
//
// Renderizada via portal direto no <body> e escondida na tela; no
// @media print (globals.css, bloco "Folha de impressão"), é a única coisa
// que aparece — o resto da página some com display:none, então não sobra
// página em branco nem o tema escuro. As regras só valem quando este
// elemento existe na página (:has), então imprimir qualquer outra tela
// continua funcionando normalmente.
//
// O conteúdo vai dentro de uma tabela-moldura: o <thead> dela (cabeçalho
// com logo/título) e o <tfoot> (data/hora) se repetem em toda página
// quando o conteúdo quebra — é o jeito confiável de repetir cabeçalho no
// Chrome sem position: fixed.

export interface CelulaImpressao {
  principal: string
  secundario: string | null
}

export interface LinhaImpressao {
  id: string
  nome: string
  // Texto pequeno ao lado do nome (ex: "(inativo)").
  sufixo?: string | null
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

export function FolhaImpressao({
  titulo,
  empresaNome,
  logoPath,
  subtitulos,
  children,
}: {
  titulo: string
  empresaNome: string
  logoPath: string
  subtitulos: string[]
  children: ReactNode
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
    <div className="folha-impressao">
      <table className="folha-impressao-moldura">
        <thead>
          <tr>
            <td>
              <header className="folha-impressao-cabecalho">
                {/* <img> simples em vez de next/image: o elemento fica
                    escondido na tela, e o lazy-load do next/image poderia
                    nunca carregar a logo. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPath} alt={empresaNome} className="folha-impressao-logo" />
                <div>
                  <h1>{titulo}</h1>
                  <p className="folha-impressao-empresa">{empresaNome}</p>
                  {subtitulos.map((s) => (
                    <p key={s}>{s}</p>
                  ))}
                </div>
              </header>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{children}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>
              <footer className="folha-impressao-rodape">Impresso em {impressoEm}</footer>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>,
    document.body,
  )
}

function Celula({ celula }: { celula: CelulaImpressao }) {
  return (
    <>
      <span className="folha-impressao-principal">{celula.principal}</span>
      {celula.secundario && <span className="folha-impressao-secundario">{celula.secundario}</span>}
    </>
  )
}

// Tabela da folha: primeira coluna com o nome, uma coluna por métrica, e
// linha de total opcional no fim. O cabeçalho dela também se repete se a
// tabela quebrar de página.
export function TabelaImpressao({
  colunaNome,
  colunas,
  linhas,
  total,
}: {
  colunaNome: string
  colunas: string[]
  linhas: LinhaImpressao[]
  total?: { rotulo: string; celulas: CelulaImpressao[] } | null
}) {
  return (
    <table className="folha-impressao-tabela">
      <thead>
        <tr>
          <th className="folha-impressao-nome">{colunaNome}</th>
          {colunas.map((coluna) => (
            <th key={coluna}>{coluna}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha) => (
          <tr key={linha.id}>
            <td className="folha-impressao-nome">
              {linha.nome}
              {linha.sufixo && <span className="folha-impressao-secundario"> {linha.sufixo}</span>}
            </td>
            {linha.celulas.map((celula, i) => (
              <td key={colunas[i]}>
                <Celula celula={celula} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {total && (
        <tfoot>
          <tr>
            <td className="folha-impressao-nome">{total.rotulo}</td>
            {total.celulas.map((celula, i) => (
              <td key={colunas[i]}>
                <Celula celula={celula} />
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  )
}
