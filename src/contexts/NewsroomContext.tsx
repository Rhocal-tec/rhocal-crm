'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { ComunicadoCorpo } from '@/components/newsroom/ComunicadoCorpo'
import { Interacao } from '@/components/newsroom/Interacao'
import { contextoOk, destinadoA, jaLeu, ordenar, vigente } from '@/lib/newsroom/regras'
import { ocorrenciaAtual } from '@/lib/newsroom/ocorrencias'
import { emLotes } from '@/lib/newsroom/paginar'
import { contarIndicador, INDICADORES, type Indicador } from '@/lib/newsroom/indicadores'
import { eventosDoDia, TIPOS_DATA } from '@/lib/newsroom/agenda'
import type { Anexo, Comunicado, DataEquipe, Destino, Leitura, Resposta } from '@/lib/newsroom/tipos'

interface NewsroomContextValue {
  carregando: boolean
  comunicados: Comunicado[]
  anexosDe: (id: string) => Anexo[]
  leituraDe: (c: Comunicado) => Leitura | undefined
  respostaDe: (c: Comunicado) => Resposta | undefined
  vigentes: Comunicado[]
  pendentes: Comunicado[]
  naoLidos: number
  datas: DataEquipe[]
  nomes: Record<string, string>
  marcarLido: (c: Comunicado) => Promise<boolean>
  responder: (
    c: Comunicado,
    dados: Record<string, number[]>,
    acertos: number | null,
    total: number | null,
  ) => Promise<boolean>
  recarregar: () => Promise<void>
}

const NewsroomContext = createContext<NewsroomContextValue | null>(null)

export function useNewsroom(): NewsroomContextValue {
  const ctx = useContext(NewsroomContext)
  if (!ctx) throw new Error('useNewsroom deve ser usado dentro de NewsroomProvider')
  return ctx
}

function guardado(chave: string): boolean {
  try {
    return window.localStorage.getItem(chave) === '1'
  } catch {
    return false
  }
}

function guardar(chave: string): void {
  try {
    window.localStorage.setItem(chave, '1')
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

function segundaDaSemana(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
}

export function NewsroomProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const pathname = usePathname()
  const [supabase] = useState(() => createClient())
  const [carregando, setCarregando] = useState(false)
  const [lista, setLista] = useState<Comunicado[]>([])
  const [destinos, setDestinos] = useState<Destino[]>([])
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [leituras, setLeituras] = useState<Leitura[]>([])
  const [respostas, setRespostas] = useState<Resposta[]>([])
  const [datas, setDatas] = useState<DataEquipe[]>([])
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [agora, setAgora] = useState(() => new Date())
  const [salvandoLeitura, setSalvandoLeitura] = useState(false)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)
  const [agendaFechada, setAgendaFechada] = useState<Set<string>>(new Set())
  const [resumo, setResumo] = useState<{ chave: string; numeros: { rotulo: string; valor: number }[] } | null>(null)

  const usuarioId = user?.id ?? null
  const setor = profile?.setor ?? null

  const recarregar = useCallback(async () => {
    if (!usuarioId) return
    setCarregando(true)
    try {
      const { data: coms, error } = await supabase
        .from('newsroom_comunicados')
        .select('*')
        .in('status', ['publicado', 'encerrado'])
        .order('inicio_em', { ascending: false })
        .limit(300)
      if (error) throw error
      const comunicados = coms ?? []
      const ids = comunicados.map((c) => c.id)

      const dest: Destino[] = []
      const anx: Anexo[] = []
      for (const lote of emLotes(ids, 80)) {
        const [d, a] = await Promise.all([
          supabase.from('newsroom_destinos').select('*').in('comunicado_id', lote),
          supabase.from('newsroom_anexos').select('*').in('comunicado_id', lote),
        ])
        dest.push(...(d.data ?? []))
        anx.push(...(a.data ?? []))
      }
      const [leit, resp, dts, perfis] = await Promise.all([
        supabase.from('newsroom_leituras').select('*').eq('usuario_id', usuarioId),
        supabase.from('newsroom_respostas').select('*').eq('usuario_id', usuarioId),
        supabase.from('newsroom_datas').select('*').order('data'),
        supabase.from('profiles').select('id, nome'),
      ])

      setLista(comunicados)
      setDestinos(dest)
      setAnexos(anx)
      setLeituras(leit.data ?? [])
      setRespostas(resp.data ?? [])
      setDatas(dts.data ?? [])
      setNomes(Object.fromEntries((perfis.data ?? []).map((p) => [p.id, p.nome])))
    } catch (e) {
      // Newsroom nunca pode travar o CRM: em falha (ex.: migration ainda não rodou), segue sem avisos.
      console.error('Newsroom: erro ao carregar comunicados', e)
    } finally {
      setCarregando(false)
    }
  }, [supabase, usuarioId])

  useEffect(() => {
    if (usuarioId) recarregar()
    else {
      setLista([])
      setLeituras([])
      setRespostas([])
    }
  }, [usuarioId, recarregar])

  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 60_000)
    const recarga = setInterval(() => recarregar(), 5 * 60_000)
    const aoFocar = () => recarregar()
    window.addEventListener('focus', aoFocar)
    return () => {
      clearInterval(relogio)
      clearInterval(recarga)
      window.removeEventListener('focus', aoFocar)
    }
  }, [recarregar])

  const destinadosAMim = useMemo(() => {
    if (!usuarioId || !setor) return []
    return lista.filter((c) =>
      destinadoA(
        destinos.filter((d) => d.comunicado_id === c.id),
        usuarioId,
        setor,
      ),
    )
  }, [lista, destinos, usuarioId, setor])

  const vigentes = useMemo(
    () => destinadosAMim.filter((c) => vigente(c, agora)).sort(ordenar),
    [destinadosAMim, agora],
  )

  const pendentes = useMemo(() => {
    if (!usuarioId) return []
    return vigentes.filter((c) => {
      const occ = ocorrenciaAtual(c, agora)
      if (occ === null) return false
      return !jaLeu(c, leituras, usuarioId, occ)
    })
  }, [vigentes, leituras, usuarioId, agora])

  const ocorrenciaDe = useCallback((c: Comunicado) => ocorrenciaAtual(c, new Date()) ?? '', [])

  const marcarLido = useCallback(
    async (c: Comunicado): Promise<boolean> => {
      if (!usuarioId) return false
      const ocorrencia = ocorrenciaDe(c)
      setSalvandoLeitura(true)
      setErroLeitura(null)
      const { data, error } = await supabase
        .from('newsroom_leituras')
        .insert({ comunicado_id: c.id, usuario_id: usuarioId, versao: c.versao, ocorrencia })
        .select()
        .single()
      setSalvandoLeitura(false)
      if (error && error.code !== '23505') {
        setErroLeitura('Não foi possível registrar. Tente novamente.')
        return false
      }
      const nova: Leitura = data ?? {
        id: `${c.id}-${c.versao}-${ocorrencia}`,
        comunicado_id: c.id,
        usuario_id: usuarioId,
        versao: c.versao,
        lido_em: new Date().toISOString(),
        ocorrencia,
      }
      setLeituras((atual) => [...atual, nova])
      return true
    },
    [supabase, usuarioId, ocorrenciaDe],
  )

  const responder = useCallback(
    async (
      c: Comunicado,
      dados: Record<string, number[]>,
      acertos: number | null,
      total: number | null,
    ): Promise<boolean> => {
      if (!usuarioId) return false
      const ocorrencia = ocorrenciaDe(c)
      const { data, error } = await supabase
        .from('newsroom_respostas')
        .insert({ comunicado_id: c.id, usuario_id: usuarioId, versao: c.versao, ocorrencia, dados, acertos, total })
        .select()
        .single()
      if (error && error.code !== '23505') {
        setErroLeitura('Não foi possível enviar sua resposta. Tente novamente.')
        return false
      }
      const nova: Resposta = data ?? {
        id: `${c.id}-${c.versao}-${ocorrencia}`,
        comunicado_id: c.id,
        usuario_id: usuarioId,
        versao: c.versao,
        ocorrencia,
        dados,
        acertos,
        total,
        respondido_em: new Date().toISOString(),
      }
      setRespostas((atual) => [...atual, nova])
      return true
    },
    [supabase, usuarioId, ocorrenciaDe],
  )

  const respostaDe = useCallback(
    (c: Comunicado) =>
      usuarioId
        ? respostas.find(
            (r) =>
              r.comunicado_id === c.id &&
              r.usuario_id === usuarioId &&
              r.versao === c.versao &&
              (r.ocorrencia ?? '') === ocorrenciaDe(c),
          )
        : undefined,
    [respostas, usuarioId, ocorrenciaDe],
  )

  const valor: NewsroomContextValue = {
    carregando,
    comunicados: destinadosAMim,
    anexosDe: (id) => anexos.filter((a) => a.comunicado_id === id),
    leituraDe: (c) => {
      if (!usuarioId) return undefined
      const occ = ocorrenciaAtual(c, agora) ?? ''
      return leituras.find(
        (l) =>
          l.comunicado_id === c.id &&
          l.usuario_id === usuarioId &&
          l.versao === c.versao &&
          (l.ocorrencia ?? '') === occ,
      )
    },
    respostaDe,
    vigentes,
    pendentes,
    naoLidos: pendentes.length,
    datas,
    nomes,
    marcarLido,
    responder,
    recarregar,
  }

  const primeiroNome = (profile?.nome ?? '').split(' ')[0] || 'pessoal'
  const popups = pendentes.filter((c) => c.exibicao === 'popup' && contextoOk(c, pathname))
  const atual = popups[0]
  const faixas = pendentes.filter((c) => c.exibicao === 'faixa' && contextoOk(c, pathname))

  // Agenda do dia: aniversários e eventos de hoje, em faixa dispensável.
  const eventosHoje = useMemo(
    () => (usuarioId ? eventosDoDia(datas, agora).filter((e) => !agendaFechada.has(e.id)) : []),
    [datas, agora, usuarioId, agendaFechada],
  )

  // Resumo semanal: uma vez por semana, depois dos pop-ups.
  const semanaChave = segundaDaSemana(agora)
  const resumoChave = usuarioId ? `newsroom-resumo-${usuarioId}-${semanaChave}` : ''
  const resumoPendente = !!usuarioId && !!empresaAtiva && !atual && !guardado(resumoChave) && !!profile

  useEffect(() => {
    if (!resumoPendente || !empresaAtiva || resumo?.chave === resumoChave) return
    let ativo = true
    ;(async () => {
      try {
        const fim = new Date()
        const inicio = new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000)
        const itens: Indicador[] = ['pedidos_efetuados', 'oportunidades_criadas', 'tarefas_concluidas', 'contatos_cs']
        const numeros = await Promise.all(
          itens.map(async (i) => ({
            rotulo: INDICADORES[i].rotulo,
            valor: await contarIndicador(supabase, i, empresaAtiva.id, inicio.toISOString(), fim.toISOString()),
          })),
        )
        if (ativo) setResumo({ chave: resumoChave, numeros })
      } catch (e) {
        console.error('Newsroom: erro no resumo semanal', e)
        guardar(resumoChave)
      }
    })()
    return () => {
      ativo = false
    }
  }, [resumoPendente, empresaAtiva, resumoChave, resumo?.chave, supabase])

  const mostrarResumo = resumoPendente && resumo?.chave === resumoChave

  const interativo = !!atual && (!!atual.enquete || !!atual.quiz)
  const respondido = !!atual && !!respostaDe(atual)

  return (
    <NewsroomContext.Provider value={valor}>
      {eventosHoje.length > 0 && (
        <div className="space-y-px">
          {eventosHoje.map((e) => {
            const t = TIPOS_DATA[e.tipo] ?? TIPOS_DATA.evento
            const quem = e.usuario_id ? nomes[e.usuario_id] : null
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 border-b border-accent-success/30 bg-accent-success/10 px-6 py-2 text-sm text-primary">
                <span>
                  {t.icone}{' '}
                  {e.tipo === 'aniversario'
                    ? `Hoje é aniversário de ${quem ?? e.titulo}! Parabéns! 🎉`
                    : `Hoje: ${e.titulo}${e.hora ? ` às ${e.hora}` : ''}${quem ? ` (${quem})` : ''}`}
                </span>
                <button
                  onClick={() => setAgendaFechada((a) => new Set(a).add(e.id))}
                  className="text-xs text-muted hover:text-primary"
                >
                  Fechar
                </button>
              </div>
            )
          })}
        </div>
      )}

      {faixas.length > 0 && (
        <div className="space-y-px">
          {faixas.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-accent-primary/30 bg-accent-primary/15 px-6 py-2 text-sm text-primary">
              <span className="min-w-0 flex-1">
                <strong>{c.titulo.replace(/\{nome\}/gi, primeiroNome)}</strong>
                {' — '}
                {c.corpo.replace(/\{nome\}/gi, primeiroNome).replace(/\{setor\}/gi, setor ?? 'equipe').split('\n')[0]}
              </span>
              <Link href="/newsroom" className="text-xs underline">Ver completo</Link>
              {!c.enquete && !c.quiz && (
                <button onClick={() => marcarLido(c)} className="rounded-md bg-accent-primary px-3 py-1 text-xs font-medium text-white">
                  Entendi
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {children}

      {atual && (
        <div
          role="dialog"
          aria-modal="true"
          className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${atual.tipo === 'urgente' ? 'bg-black' : 'bg-black/75'}`}
        >
          <div
            className={`max-h-[90vh] w-full overflow-y-auto rounded-xl border-2 bg-surface p-6 shadow-2xl ${
              atual.tipo === 'urgente' ? 'max-w-2xl border-accent-danger' : 'max-w-xl border-white/15'
            }`}
          >
            {atual.tipo === 'urgente' && (
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-accent-danger">
                Comunicado urgente — é necessário confirmar para continuar
              </p>
            )}
            <ComunicadoCorpo
              comunicado={atual}
              anexos={anexos.filter((a) => a.comunicado_id === atual.id)}
              nomeUsuario={profile?.nome}
              setorUsuario={setor}
              destaqueNome={atual.destaque_usuario_id ? nomes[atual.destaque_usuario_id] : null}
            />
            <Interacao comunicado={atual} resposta={respostaDe(atual)} onEnviar={(d, a, t) => responder(atual, d, a, t)} />
            {erroLeitura && <p className="mt-3 text-sm text-accent-danger">{erroLeitura}</p>}
            <div className="mt-6 flex items-center justify-between gap-3">
              <span className="text-xs text-muted">
                {interativo && !respondido
                  ? 'Responda para poder continuar'
                  : popups.length > 1
                    ? `Faltam ${popups.length - 1} aviso(s) depois deste`
                    : ''}
              </span>
              <button
                onClick={() => marcarLido(atual)}
                disabled={salvandoLeitura || (interativo && !respondido)}
                className="rounded-md bg-accent-success px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {salvandoLeitura ? 'Registrando…' : 'Entendi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarResumo && resumo && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border-2 border-white/15 bg-surface p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Resumo da semana</p>
            <h2 className="mt-1 font-heading text-xl font-semibold text-primary">
              Bom começo de semana, {primeiroNome}! 📊
            </h2>
            <p className="mt-1 text-sm text-muted">
              Os números dos últimos 7 dias em {empresaAtiva?.nome_fantasia ?? 'sua empresa'}:
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {resumo.numeros.map((n) => (
                <div key={n.rotulo} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="font-mono text-2xl font-semibold text-primary">{n.valor}</p>
                  <p className="text-xs text-muted">{n.rotulo}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <Link href="/newsroom" onClick={() => guardar(resumoChave)} className="text-sm text-accent-primary underline">
                Ver o Newsroom
              </Link>
              <button
                onClick={() => {
                  guardar(resumoChave)
                  setResumo(null)
                  setAgora(new Date())
                }}
                className="rounded-md bg-accent-primary px-5 py-2 text-sm font-semibold text-white"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </NewsroomContext.Provider>
  )
}
