'use client'

import { useState } from 'react'
import { lerEnquete, lerQuiz, type Comunicado, type Resposta } from '@/lib/newsroom/tipos'

// Enquete (voto) e treinamento com perguntas (quiz) dentro do aviso.
export function Interacao({
  comunicado,
  resposta,
  onEnviar,
}: {
  comunicado: Comunicado
  resposta?: Resposta
  onEnviar: (dados: Record<string, number[]>, acertos: number | null, total: number | null) => Promise<boolean>
}) {
  const enquete = lerEnquete(comunicado)
  const quiz = lerQuiz(comunicado)
  const [marcadas, setMarcadas] = useState<number[]>([])
  const [respostasQuiz, setRespostasQuiz] = useState<number[]>([])
  const [enviando, setEnviando] = useState(false)

  if (!enquete && !quiz) return null

  if (enquete) {
    const votos = ((resposta?.dados as { opcoes?: number[] } | undefined)?.opcoes ?? []) as number[]
    return (
      <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="text-sm font-semibold text-primary">📊 {enquete.pergunta || 'Enquete'}</p>
        <div className="mt-2 space-y-1.5">
          {enquete.opcoes.map((o, i) => (
            <label key={i} className="flex items-center gap-2 text-sm text-primary">
              <input
                type={enquete.multipla ? 'checkbox' : 'radio'}
                name={`enq-${comunicado.id}`}
                disabled={!!resposta}
                checked={resposta ? votos.includes(i) : marcadas.includes(i)}
                onChange={() =>
                  setMarcadas((atual) =>
                    enquete.multipla
                      ? atual.includes(i)
                        ? atual.filter((x) => x !== i)
                        : [...atual, i]
                      : [i],
                  )
                }
              />
              {o}
            </label>
          ))}
        </div>
        {resposta ? (
          <p className="mt-2 text-xs text-accent-success">✓ Voto registrado. Obrigado!</p>
        ) : (
          <button
            disabled={marcadas.length === 0 || enviando}
            onClick={async () => {
              setEnviando(true)
              await onEnviar({ opcoes: marcadas }, null, null)
              setEnviando(false)
            }}
            className="mt-3 rounded-md bg-accent-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : 'Votar'}
          </button>
        )}
      </div>
    )
  }

  const perguntas = quiz!
  const salvas = ((resposta?.dados as { respostas?: number[] } | undefined)?.respostas ?? []) as number[]
  const completo = perguntas.every((_, i) => respostasQuiz[i] !== undefined)

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-sm font-semibold text-primary">🎓 Perguntas de entendimento</p>
      {perguntas.map((p, qi) => (
        <div key={qi}>
          <p className="text-sm text-primary">
            {qi + 1}. {p.pergunta}
          </p>
          <div className="mt-1.5 space-y-1">
            {p.opcoes.map((o, oi) => {
              const escolhida = resposta ? salvas[qi] === oi : respostasQuiz[qi] === oi
              const certa = resposta && p.correta === oi
              const errada = resposta && escolhida && p.correta !== oi
              return (
                <label
                  key={oi}
                  className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                    certa ? 'bg-accent-success/15 text-accent-success' : errada ? 'bg-accent-danger/15 text-accent-danger' : 'text-primary'
                  }`}
                >
                  <input
                    type="radio"
                    name={`quiz-${comunicado.id}-${qi}`}
                    disabled={!!resposta}
                    checked={escolhida}
                    onChange={() =>
                      setRespostasQuiz((atual) => {
                        const novo = [...atual]
                        novo[qi] = oi
                        return novo
                      })
                    }
                  />
                  {o} {certa ? '✓' : errada ? '✗' : ''}
                </label>
              )
            })}
          </div>
        </div>
      ))}
      {resposta ? (
        <p className="text-sm font-semibold text-primary">
          Você acertou {resposta.acertos ?? 0} de {resposta.total ?? perguntas.length}.
        </p>
      ) : (
        <button
          disabled={!completo || enviando}
          onClick={async () => {
            setEnviando(true)
            const acertos = perguntas.reduce((s, p, i) => s + (respostasQuiz[i] === p.correta ? 1 : 0), 0)
            await onEnviar({ respostas: respostasQuiz }, acertos, perguntas.length)
            setEnviando(false)
          }}
          className="rounded-md bg-accent-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : 'Enviar respostas'}
        </button>
      )}
    </div>
  )
}
