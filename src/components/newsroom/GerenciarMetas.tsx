'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { PlacarMetas } from './PlacarMetas'
import { INDICADORES, type Indicador } from '@/lib/newsroom/indicadores'
import { SETORES, type Meta } from '@/lib/newsroom/tipos'
import type { SetorTipo } from '@/types/database'

export function GerenciarMetas() {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [metas, setMetas] = useState<Meta[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [indicador, setIndicador] = useState<Indicador>('pedidos_efetuados')
  const [valor, setValor] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [setor, setSetor] = useState<SetorTipo | ''>('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('newsroom_metas').select('*').order('criado_em', { ascending: false })
    if (error) setErro('Não foi possível carregar as metas. Confira se a migration 0042 foi executada.')
    setMetas(data ?? [])
  }, [supabase])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function criar() {
    if (!user) return
    const n = Number(valor.replace(',', '.'))
    if (!titulo.trim() || !Number.isFinite(n) || n <= 0 || !inicio || !fim) {
      setErro('Informe título, valor da meta e as duas datas.')
      return
    }
    if (fim < inicio) {
      setErro('A data final precisa ser depois da inicial.')
      return
    }
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.from('newsroom_metas').insert({
      titulo: titulo.trim(),
      indicador,
      meta_valor: n,
      inicio,
      fim,
      setor: setor || null,
      criado_por: user.id,
    })
    setSalvando(false)
    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`)
      return
    }
    setTitulo('')
    setValor('')
    carregar()
  }

  async function alternar(m: Meta) {
    await supabase.from('newsroom_metas').update({ ativa: !m.ativa }).eq('id', m.id)
    carregar()
  }

  const input = 'input-field rounded-md px-2 py-1.5 text-sm text-primary'
  const rotulo = 'flex flex-col gap-1 text-xs text-muted'

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-white/10 bg-surface p-4">
        <h2 className="font-heading text-lg font-semibold text-primary">Nova meta (placar ao vivo)</h2>
        <p className="text-xs text-muted">
          O progresso é calculado automaticamente com os dados reais do CRM da empresa selecionada no topo.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={`${rotulo} sm:col-span-2`}>
            Título
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Meta de pedidos da semana" className={input} />
          </label>
          <label className={rotulo}>
            O que medir
            <select value={indicador} onChange={(e) => setIndicador(e.target.value as Indicador)} className={input}>
              {Object.entries(INDICADORES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className={rotulo}>
            Meta (quantidade)
            <input value={valor} onChange={(e) => setValor(e.target.value)} className={input} />
          </label>
          <label className={rotulo}>
            De
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={input} />
          </label>
          <label className={rotulo}>
            Até
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={input} />
          </label>
          <label className={rotulo}>
            Aparece para
            <select value={setor} onChange={(e) => setSetor(e.target.value as SetorTipo | '')} className={input}>
              <option value="">Todos</option>
              {SETORES.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>
        {erro && <p className="text-sm text-accent-danger">{erro}</p>}
        <button onClick={criar} disabled={salvando} className="rounded-md bg-accent-success px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {salvando ? 'Salvando…' : 'Criar meta'}
        </button>
      </div>

      <div>
        <h2 className="mb-2 font-heading text-lg font-semibold text-primary">Metas cadastradas</h2>
        {metas.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma meta ainda.</p>
        ) : (
          <div className="space-y-3">
            {metas.map((m) => (
              <div key={m.id} className={m.ativa ? '' : 'opacity-50'}>
                <PlacarMetas metas={[m]} />
                <button onClick={() => alternar(m)} className="mt-1 text-xs text-muted hover:text-primary">
                  {m.ativa ? 'Desativar meta' : 'Reativar meta'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
