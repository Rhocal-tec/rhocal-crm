'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useNewsroom } from '@/contexts/NewsroomContext'
import { ComunicadoCorpo } from './ComunicadoCorpo'
import { podeGerenciarNewsroom, vigente } from '@/lib/newsroom/regras'
import { TIPOS, tipoDe, type Comunicado, type TipoComunicado } from '@/lib/newsroom/tipos'
import type { SetorTipo } from '@/types/database'

export function NewsroomPagina({ setor }: { setor: SetorTipo }) {
  const { profile } = useAuth()
  const { comunicados, anexosDe, leituraDe, marcarLido, carregando } = useNewsroom()
  const [filtro, setFiltro] = useState<TipoComunicado | 'todos'>('todos')
  const [verHistorico, setVerHistorico] = useState(false)

  const { ativos, historico } = useMemo(() => {
    const ordenados = [...comunicados].sort((a, b) => {
      if (a.fixado !== b.fixado) return a.fixado ? -1 : 1
      return new Date(b.inicio_em).getTime() - new Date(a.inicio_em).getTime()
    })
    const filtrados = ordenados.filter((c) => filtro === 'todos' || c.tipo === filtro)
    return {
      ativos: filtrados.filter((c) => vigente(c)),
      historico: filtrados.filter((c) => !vigente(c) && new Date(c.inicio_em) <= new Date()),
    }
  }, [comunicados, filtro])

  function renderCartao(c: Comunicado) {
    const leitura = leituraDe(c)
    const t = tipoDe(c)
    return (
      <article className={`rounded-lg border bg-surface p-4 ${t.borda}`}>
        <ComunicadoCorpo
          comunicado={c}
          anexos={anexosDe(c.id)}
          nomeUsuario={profile?.nome}
          setorUsuario={setor}
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3 text-xs text-muted">
          <span>
            Publicado em {new Date(c.inicio_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
          {leitura ? (
            <span className="text-accent-success">
              ✓ Lido em {new Date(leitura.lido_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          ) : vigente(c) ? (
            <button
              onClick={() => marcarLido(c)}
              className="rounded-md bg-accent-success px-3 py-1 text-xs font-medium text-white"
            >
              Entendi
            </button>
          ) : null}
        </div>
      </article>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold text-primary">Newsroom</h1>
          <p className="text-xs text-muted">Comunicados e novidades da gestão para a equipe.</p>
        </div>
        {podeGerenciarNewsroom(setor) && (
          <Link href="/newsroom/gerenciar" className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white">
            Gerenciar comunicados
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['todos', ...Object.keys(TIPOS)] as (TipoComunicado | 'todos')[]).map((v) => (
          <button
            key={v}
            onClick={() => setFiltro(v)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filtro === v ? 'bg-accent-primary text-white' : 'bg-white/5 text-muted hover:text-primary'
            }`}
          >
            {v === 'todos' ? 'Todos' : `${TIPOS[v].icone} ${TIPOS[v].rotulo}`}
          </button>
        ))}
      </div>

      {carregando && comunicados.length === 0 ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : ativos.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-surface p-6 text-center text-sm text-muted">
          Nenhum comunicado ativo no momento.
        </p>
      ) : (
        <div className="space-y-3">
          {ativos.map((c) => (
            <div key={c.id}>{renderCartao(c)}</div>
          ))}
        </div>
      )}

      {historico.length > 0 && (
        <div>
          <button onClick={() => setVerHistorico((v) => !v)} className="text-sm text-muted hover:text-primary">
            {verHistorico ? 'Ocultar histórico ▲' : `Ver histórico (${historico.length}) ▼`}
          </button>
          {verHistorico && (
            <div className="mt-3 space-y-3 opacity-80">
              {historico.map((c) => (
                <div key={c.id}>{renderCartao(c)}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
