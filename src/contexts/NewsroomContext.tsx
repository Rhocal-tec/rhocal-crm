'use client'

import Link from 'next/link'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { ComunicadoCorpo } from '@/components/newsroom/ComunicadoCorpo'
import { destinadoA, jaLeu, ordenar, vigente } from '@/lib/newsroom/regras'
import { emLotes } from '@/lib/newsroom/paginar'
import type { Anexo, Comunicado, Destino, Leitura } from '@/lib/newsroom/tipos'

interface NewsroomContextValue {
  carregando: boolean
  // Comunicados que o usuário pode ver (destinados a ele), vigentes ou históricos.
  comunicados: Comunicado[]
  anexosDe: (id: string) => Anexo[]
  leituraDe: (c: Comunicado) => Leitura | undefined
  vigentes: Comunicado[]
  pendentes: Comunicado[]
  naoLidos: number
  marcarLido: (c: Comunicado) => Promise<boolean>
  recarregar: () => Promise<void>
}

const NewsroomContext = createContext<NewsroomContextValue | null>(null)

export function useNewsroom(): NewsroomContextValue {
  const ctx = useContext(NewsroomContext)
  if (!ctx) throw new Error('useNewsroom deve ser usado dentro de NewsroomProvider')
  return ctx
}

export function NewsroomProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const [supabase] = useState(() => createClient())
  const [carregando, setCarregando] = useState(false)
  const [lista, setLista] = useState<Comunicado[]>([])
  const [destinos, setDestinos] = useState<Destino[]>([])
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [leituras, setLeituras] = useState<Leitura[]>([])
  const [agora, setAgora] = useState(() => new Date())
  const [salvandoLeitura, setSalvandoLeitura] = useState(false)
  const [erroLeitura, setErroLeitura] = useState<string | null>(null)

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
      const { data: leit } = await supabase.from('newsroom_leituras').select('*').eq('usuario_id', usuarioId)

      setLista(comunicados)
      setDestinos(dest)
      setAnexos(anx)
      setLeituras(leit ?? [])
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
    }
  }, [usuarioId, recarregar])

  // Relógio (ativa avisos agendados) + recarga periódica e ao voltar para a aba.
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

  const pendentes = useMemo(
    () => (usuarioId ? vigentes.filter((c) => !jaLeu(c, leituras, usuarioId)) : []),
    [vigentes, leituras, usuarioId],
  )

  const marcarLido = useCallback(
    async (c: Comunicado): Promise<boolean> => {
      if (!usuarioId) return false
      setSalvandoLeitura(true)
      setErroLeitura(null)
      const { data, error } = await supabase
        .from('newsroom_leituras')
        .insert({ comunicado_id: c.id, usuario_id: usuarioId, versao: c.versao })
        .select()
        .single()
      setSalvandoLeitura(false)
      // Duplicidade (já registrada em outra aba) conta como lida.
      if (error && error.code !== '23505') {
        setErroLeitura('Não foi possível registrar. Tente novamente.')
        return false
      }
      setLeituras((atual) =>
        data ? [...atual, data] : [...atual, { id: `${c.id}-${c.versao}`, comunicado_id: c.id, usuario_id: usuarioId, versao: c.versao, lido_em: new Date().toISOString() }],
      )
      return true
    },
    [supabase, usuarioId],
  )

  const valor: NewsroomContextValue = {
    carregando,
    comunicados: destinadosAMim,
    anexosDe: (id) => anexos.filter((a) => a.comunicado_id === id),
    leituraDe: (c) => (usuarioId ? leituras.find((l) => l.comunicado_id === c.id && l.usuario_id === usuarioId && l.versao === c.versao) : undefined),
    vigentes,
    pendentes,
    naoLidos: pendentes.length,
    marcarLido,
    recarregar,
  }

  const popups = pendentes.filter((c) => c.exibicao === 'popup')
  const atual = popups[0]
  const faixas = pendentes.filter((c) => c.exibicao === 'faixa')

  return (
    <NewsroomContext.Provider value={valor}>
      {faixas.length > 0 && (
        <div className="space-y-px">
          {faixas.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-accent-primary/30 bg-accent-primary/15 px-6 py-2 text-sm text-primary">
              <span className="min-w-0 flex-1">
                <strong>{c.titulo.replace(/\{nome\}/gi, (profile?.nome ?? '').split(' ')[0] || 'pessoal')}</strong>
                {' — '}
                {c.corpo.replace(/\{nome\}/gi, (profile?.nome ?? '').split(' ')[0] || 'pessoal').replace(/\{setor\}/gi, setor ?? 'equipe').split('\n')[0]}
              </span>
              <Link href="/newsroom" className="text-xs underline">Ver completo</Link>
              <button
                onClick={() => marcarLido(c)}
                className="rounded-md bg-accent-primary px-3 py-1 text-xs font-medium text-white"
              >
                Entendi
              </button>
            </div>
          ))}
        </div>
      )}

      {children}

      {atual && (
        <div
          role="dialog"
          aria-modal="true"
          className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${
            atual.tipo === 'urgente' ? 'bg-black' : 'bg-black/75'
          }`}
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
            />
            {erroLeitura && <p className="mt-3 text-sm text-accent-danger">{erroLeitura}</p>}
            <div className="mt-6 flex items-center justify-between gap-3">
              <span className="text-xs text-muted">
                {popups.length > 1 ? `Faltam ${popups.length - 1} aviso(s) depois deste` : ''}
              </span>
              <button
                onClick={() => marcarLido(atual)}
                disabled={salvandoLeitura}
                className="rounded-md bg-accent-success px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {salvandoLeitura ? 'Registrando…' : 'Entendi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </NewsroomContext.Provider>
  )
}
