'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useNewsroom } from '@/contexts/NewsroomContext'
import { ComunicadoCorpo } from './ComunicadoCorpo'
import { Interacao } from './Interacao'
import { Reacoes } from './Reacoes'
import { PlacarMetas } from './PlacarMetas'
import { CaixaSugestoes } from './CaixaSugestoes'
import { createClient } from '@/lib/supabase/client'
import { TIPOS_DATA, proximosDias } from '@/lib/newsroom/agenda'
import { podeGerenciarNewsroom, vigente } from '@/lib/newsroom/regras'
import { TIPOS, tipoDe, type Comunicado, type Meta, type TipoComunicado } from '@/lib/newsroom/tipos'
import type { SetorTipo } from '@/types/database'

export function NewsroomPagina({ setor }: { setor: SetorTipo }) {
  const { profile } = useAuth()
  const { comunicados, anexosDe, leituraDe, respostaDe, responder, marcarLido, carregando, datas, nomes } = useNewsroom()
  const [aba, setAba] = useState<'avisos' | 'placar' | 'base' | 'sugestoes'>('avisos')
  const [metas, setMetas] = useState<Meta[]>([])
  const [busca, setBusca] = useState('')
  const [categoriaBase, setCategoriaBase] = useState('')

  useEffect(() => {
    const supabase = createClient()
    const hoje = new Date().toISOString().slice(0, 10)
    supabase
      .from('newsroom_metas')
      .select('*')
      .eq('ativa', true)
      .gte('fim', hoje)
      .order('inicio')
      .then(({ data }) => setMetas((data ?? []).filter((m) => !m.setor || m.setor === setor || podeGerenciarNewsroom(setor))))
  }, [setor])

  const base = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return comunicados
      .filter((c) => c.na_base)
      .filter((c) => !categoriaBase || c.categoria === categoriaBase)
      .filter((c) => !q || `${c.titulo} ${c.corpo} ${c.categoria ?? ''}`.toLowerCase().includes(q))
  }, [comunicados, busca, categoriaBase])
  const categoriasBase = useMemo(
    () => Array.from(new Set(comunicados.filter((c) => c.na_base && c.categoria).map((c) => c.categoria as string))).sort(),
    [comunicados],
  )
  const proximos = useMemo(() => proximosDias(datas, 7), [datas])
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
          destaqueNome={c.destaque_usuario_id ? nomes[c.destaque_usuario_id] : null}
        />
        <Interacao comunicado={c} resposta={respostaDe(c)} onEnviar={(d, a, t) => responder(c, d, a, t)} />
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
        <Reacoes comunicadoId={c.id} />
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

      <div className="flex flex-wrap gap-1 border-b border-white/10">
        {(
          [
            ['avisos', 'Avisos'],
            ['placar', 'Placar e agenda'],
            ['base', 'Base de conhecimento'],
            ['sugestoes', 'Sugestões'],
          ] as const
        ).map(([k, r]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`px-3 py-2 text-sm ${aba === k ? 'border-b-2 border-accent-primary font-medium text-primary' : 'text-muted hover:text-primary'}`}
          >
            {r}
          </button>
        ))}
      </div>

      {aba === 'placar' && (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 font-heading text-lg font-semibold text-primary">Metas da equipe</h2>
            {metas.length === 0 ? <p className="text-sm text-muted">Nenhuma meta ativa no momento.</p> : <PlacarMetas metas={metas} />}
          </section>
          <section>
            <h2 className="mb-2 font-heading text-lg font-semibold text-primary">Próximos 7 dias</h2>
            {proximos.length === 0 ? (
              <p className="text-sm text-muted">Nada marcado para os próximos dias.</p>
            ) : (
              <ul className="space-y-2">
                {proximos.map(({ dia, eventos }) => (
                  <li key={dia.toISOString()} className="rounded-lg border border-white/10 bg-surface p-3">
                    <p className="text-xs font-semibold uppercase text-muted">
                      {dia.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                    </p>
                    {eventos.map((e) => (
                      <p key={e.id} className="text-sm text-primary">
                        {(TIPOS_DATA[e.tipo] ?? TIPOS_DATA.evento).icone} {e.titulo}
                        {e.hora ? ` · ${e.hora}` : ''}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {aba === 'sugestoes' && <CaixaSugestoes />}

      {aba === 'base' && (
        <div className="space-y-3">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar: regra de preço, script, procedimento…"
            className="input-field w-full rounded-md px-3 py-2 text-sm text-primary"
          />
          {categoriasBase.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {['', ...categoriasBase].map((c) => (
                <button
                  key={c || 'todas'}
                  onClick={() => setCategoriaBase(c)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${categoriaBase === c ? 'bg-accent-primary text-white' : 'bg-white/5 text-muted hover:text-primary'}`}
                >
                  {c || 'Todas'}
                </button>
              ))}
            </div>
          )}
          {base.length === 0 ? (
            <p className="rounded-lg border border-white/10 bg-surface p-6 text-center text-sm text-muted">
              Nada na base de conhecimento ainda. O gestor marca um comunicado como Base de conhecimento ao criá-lo.
            </p>
          ) : (
            base.map((c) => (
              <div key={c.id}>{renderCartao(c)}</div>
            ))
          )}
        </div>
      )}

      {aba === 'avisos' && (<>
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
      </>)}
    </div>
  )
}
