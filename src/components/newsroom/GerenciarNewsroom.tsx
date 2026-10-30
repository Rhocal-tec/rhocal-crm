'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useNewsroom } from '@/contexts/NewsroomContext'
import { ComunicadoForm, type PessoaOpcao } from './ComunicadoForm'
import { destinadoA, situacao } from '@/lib/newsroom/regras'
import { emLotes, paginar } from '@/lib/newsroom/paginar'
import { tipoDe, type Anexo, type Comunicado, type Destino, type Leitura } from '@/lib/newsroom/tipos'
import type { SetorTipo } from '@/types/database'

interface Pessoa extends PessoaOpcao {
  ativo: boolean
}

const SITUACAO_COR: Record<string, string> = {
  rascunho: 'bg-white/10 text-muted',
  agendado: 'bg-accent-alert/15 text-accent-alert',
  ativo: 'bg-accent-success/15 text-accent-success',
  encerrado: 'bg-white/5 text-muted',
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

export function GerenciarNewsroom() {
  const { user } = useAuth()
  const { recarregar: recarregarGlobal } = useNewsroom()
  const [supabase] = useState(() => createClient())
  const [comunicados, setComunicados] = useState<Comunicado[]>([])
  const [destinos, setDestinos] = useState<Destino[]>([])
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [leituras, setLeituras] = useState<Leitura[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<Comunicado | 'novo' | null>(null)
  const [relatorioId, setRelatorioId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const { data: coms, error } = await supabase
        .from('newsroom_comunicados')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(300)
      if (error) throw error
      const lista = coms ?? []
      const ids = lista.map((c) => c.id)
      const dest: Destino[] = []
      const anx: Anexo[] = []
      const leit: Leitura[] = []
      for (const lote of emLotes(ids, 80)) {
        const [d, a] = await Promise.all([
          supabase.from('newsroom_destinos').select('*').in('comunicado_id', lote),
          supabase.from('newsroom_anexos').select('*').in('comunicado_id', lote),
        ])
        dest.push(...(d.data ?? []))
        anx.push(...(a.data ?? []))
        leit.push(
          ...(await paginar<Leitura>((de, ate) =>
            supabase.from('newsroom_leituras').select('*').in('comunicado_id', lote).order('id').range(de, ate),
          )),
        )
      }
      const { data: perfis } = await supabase.from('profiles').select('id, nome, setor, ativo').order('nome')
      setComunicados(lista)
      setDestinos(dest)
      setAnexos(anx)
      setLeituras(leit)
      setPessoas((perfis ?? []) as Pessoa[])
    } catch (e) {
      console.error(e)
      setErro('Não foi possível carregar. Confira se a migration 0041 foi executada.')
    } finally {
      setCarregando(false)
    }
  }, [supabase])

  useEffect(() => {
    carregar()
  }, [carregar])

  const ativos = useMemo(() => pessoas.filter((p) => p.ativo), [pessoas])

  function destinatarios(c: Comunicado): Pessoa[] {
    const d = destinos.filter((x) => x.comunicado_id === c.id)
    return ativos.filter((p) => destinadoA(d, p.id, p.setor as SetorTipo))
  }

  function leram(c: Comunicado): Set<string> {
    return new Set(leituras.filter((l) => l.comunicado_id === c.id && l.versao === c.versao).map((l) => l.usuario_id))
  }

  function resumoPublico(c: Comunicado): string {
    const d = destinos.filter((x) => x.comunicado_id === c.id)
    if (d.some((x) => x.tipo === 'todos') || d.length === 0) return 'Todos'
    const setores = d.filter((x) => x.tipo === 'setor').map((x) => x.setor)
    const pess = d.filter((x) => x.tipo === 'pessoa').length
    return [setores.length ? `Setores: ${setores.join(', ')}` : null, pess ? `${pess} pessoa(s)` : null]
      .filter(Boolean)
      .join(' · ')
  }

  async function encerrar(c: Comunicado) {
    if (!window.confirm(`Encerrar o comunicado "${c.titulo}"? Ele deixa de aparecer para a equipe.`)) return
    const { error } = await supabase
      .from('newsroom_comunicados')
      .update({ status: 'encerrado', atualizado_em: new Date().toISOString() })
      .eq('id', c.id)
    if (error) {
      setErro(`Não foi possível encerrar: ${error.message}`)
      return
    }
    await Promise.all([carregar(), recarregarGlobal()])
  }

  async function duplicar(c: Comunicado) {
    if (!user) return
    const { data, error } = await supabase
      .from('newsroom_comunicados')
      .insert({
        titulo: `${c.titulo} (cópia)`,
        corpo: c.corpo,
        tipo: c.tipo,
        exibicao: c.exibicao,
        exige_confirmacao: c.exige_confirmacao,
        fixado: false,
        inicio_em: new Date().toISOString(),
        fim_em: null,
        prazo_ciencia_em: null,
        link_video: c.link_video,
        status: 'rascunho',
        criado_por: user.id,
      })
      .select()
      .single()
    if (error || !data) {
      setErro(`Não foi possível duplicar: ${error?.message ?? ''}`)
      return
    }
    const dest = destinos
      .filter((d) => d.comunicado_id === c.id)
      .map((d) => ({ comunicado_id: data.id, tipo: d.tipo, setor: d.setor, usuario_id: d.usuario_id }))
    if (dest.length) await supabase.from('newsroom_destinos').insert(dest)
    const anx = anexos
      .filter((a) => a.comunicado_id === c.id)
      .map((a) => ({ comunicado_id: data.id, nome: a.nome, caminho: a.caminho, mime: a.mime, tamanho: a.tamanho }))
    if (anx.length) await supabase.from('newsroom_anexos').insert(anx)
    await carregar()
  }

  if (editando) {
    const c = editando === 'novo' ? null : editando
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 p-6">
        <ComunicadoForm
          inicial={c}
          destinosIniciais={c ? destinos.filter((d) => d.comunicado_id === c.id) : []}
          anexosExistentes={c ? anexos.filter((a) => a.comunicado_id === c.id) : []}
          pessoas={ativos.map((p) => ({ id: p.id, nome: p.nome, setor: p.setor }))}
          onSalvo={async () => {
            setEditando(null)
            await Promise.all([carregar(), recarregarGlobal()])
          }}
          onCancelar={() => setEditando(null)}
        />
      </div>
    )
  }

  const relatorioCom = comunicados.find((c) => c.id === relatorioId) ?? null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold text-primary">Gerenciar Newsroom</h1>
          <p className="text-xs text-muted">Crie, agende, edite e acompanhe quem leu cada comunicado.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/newsroom" className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-primary hover:bg-white/5">
            Ver como equipe
          </Link>
          <button onClick={() => setEditando('novo')} className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white">
            + Novo comunicado
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-accent-danger">{erro}</p>}

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-muted">
              <th className="px-3 py-2 font-medium">Comunicado</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2 font-medium">Público</th>
              <th className="px-3 py-2 font-medium">Período</th>
              <th className="px-3 py-2 font-medium">Leituras</th>
              <th className="px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">Carregando…</td></tr>
            ) : comunicados.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">Nenhum comunicado ainda.</td></tr>
            ) : (
              comunicados.map((c) => {
                const s = situacao(c)
                const dest = destinatarios(c)
                const lidos = leram(c)
                const qtdLidos = dest.filter((p) => lidos.has(p.id)).length
                const t = tipoDe(c)
                return (
                  <tr key={c.id} className="border-b border-white/5 align-top">
                    <td className="px-3 py-2">
                      <p className="text-primary">
                        {t.icone} {c.titulo} {c.fixado && <span title="Fixado">📌</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {t.rotulo} · {c.exibicao === 'popup' ? 'pop-up' : c.exibicao === 'faixa' ? 'faixa' : 'só no Newsroom'}
                        {c.exige_confirmacao ? ' · confirmação' : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SITUACAO_COR[s]}`}>{s}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{resumoPublico(c)}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {fmt(c.inicio_em)}
                      <br />até {fmt(c.fim_em)}
                    </td>
                    <td className="px-3 py-2 text-xs text-primary">
                      {c.status === 'rascunho' ? '—' : `${qtdLidos}/${dest.length}`}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setEditando(c)} className="text-accent-primary hover:underline">Editar</button>
                        <button onClick={() => duplicar(c)} className="text-muted hover:text-primary">Duplicar</button>
                        {c.status !== 'rascunho' && (
                          <button onClick={() => setRelatorioId(c.id === relatorioId ? null : c.id)} className="text-accent-compras hover:underline">
                            Relatório
                          </button>
                        )}
                        {c.status !== 'encerrado' && (
                          <button onClick={() => encerrar(c)} className="text-accent-danger hover:underline">Encerrar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {relatorioCom && (
        <RelatorioLeitura
          comunicado={relatorioCom}
          destinatarios={destinatarios(relatorioCom)}
          leituras={leituras.filter((l) => l.comunicado_id === relatorioCom.id && l.versao === relatorioCom.versao)}
          onFechar={() => setRelatorioId(null)}
        />
      )}
    </div>
  )
}

function RelatorioLeitura({
  comunicado,
  destinatarios,
  leituras,
  onFechar,
}: {
  comunicado: Comunicado
  destinatarios: Pessoa[]
  leituras: Leitura[]
  onFechar: () => void
}) {
  const porUsuario = new Map(leituras.map((l) => [l.usuario_id, l]))
  const leram = destinatarios.filter((p) => porUsuario.has(p.id))
  const pendentes = destinatarios.filter((p) => !porUsuario.has(p.id))
  const prazoVencido = comunicado.prazo_ciencia_em ? new Date(comunicado.prazo_ciencia_em) < new Date() : false
  const pct = destinatarios.length ? Math.round((leram.length / destinatarios.length) * 100) : 0

  return (
    <div className="rounded-lg border border-white/10 bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-semibold text-primary">Relatório: {comunicado.titulo}</h2>
          <p className="text-xs text-muted">
            {leram.length} de {destinatarios.length} leram ({pct}%)
            {comunicado.prazo_ciencia_em ? ` · prazo ${fmt(comunicado.prazo_ciencia_em)}` : ''}
            {!comunicado.exige_confirmacao ? ' · este aviso não exige confirmação' : ''}
          </p>
        </div>
        <button onClick={onFechar} className="text-sm text-muted hover:text-primary">Fechar</button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className={`mb-1 text-xs font-semibold uppercase ${prazoVencido && pendentes.length ? 'text-accent-danger' : 'text-accent-alert'}`}>
            Não leram ({pendentes.length}){prazoVencido && pendentes.length ? ' — prazo vencido' : ''}
          </p>
          {pendentes.length === 0 ? (
            <p className="text-xs text-muted">Todos leram. 🎉</p>
          ) : (
            <ul className="space-y-1 text-sm text-primary">
              {pendentes.map((p) => (
                <li key={p.id}>
                  {p.nome} <span className="text-xs text-muted">({p.setor})</span>
                </li>
              ))}
            </ul>
          )}
          {pendentes.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Eles verão o aviso ao abrir o CRM. Para reforçar, avise no grupo da equipe.
            </p>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-accent-success">Leram ({leram.length})</p>
          <ul className="space-y-1 text-sm text-primary">
            {leram.map((p) => (
              <li key={p.id}>
                {p.nome} <span className="text-xs text-muted">· {fmt(porUsuario.get(p.id)?.lido_em ?? null)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
