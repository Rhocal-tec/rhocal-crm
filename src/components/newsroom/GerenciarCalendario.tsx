'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { TIPOS_DATA } from '@/lib/newsroom/agenda'
import type { DataEquipe } from '@/lib/newsroom/tipos'
import type { PessoaOpcao } from './ComunicadoForm'

function fmt(d: string): string {
  const [a, m, di] = d.split('-')
  return `${di}/${m}/${a}`
}

export function GerenciarCalendario({ pessoas }: { pessoas: PessoaOpcao[] }) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [datas, setDatas] = useState<DataEquipe[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [tipo, setTipo] = useState('reuniao')
  const [titulo, setTitulo] = useState('')
  const [data, setData] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [hora, setHora] = useState('')
  const [pessoa, setPessoa] = useState('')
  const [anual, setAnual] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data: d, error } = await supabase.from('newsroom_datas').select('*').order('data')
    if (error) setErro('Não foi possível carregar o calendário. Confira se a migration 0042 foi executada.')
    setDatas(d ?? [])
  }, [supabase])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function criar() {
    if (!user) return
    const nome = pessoas.find((p) => p.id === pessoa)?.nome
    const tituloFinal = titulo.trim() || (tipo === 'aniversario' && nome ? `Aniversário de ${nome}` : '')
    if (!tituloFinal || !data) {
      setErro('Informe título e data.')
      return
    }
    if (tipo === 'aniversario' && !pessoa) {
      setErro('Escolha a pessoa do aniversário.')
      return
    }
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.from('newsroom_datas').insert({
      tipo,
      titulo: tituloFinal,
      data,
      data_fim: dataFim || null,
      hora: hora || null,
      usuario_id: pessoa || null,
      anual: tipo === 'aniversario' ? true : anual,
      criado_por: user.id,
    })
    setSalvando(false)
    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`)
      return
    }
    setTitulo('')
    setData('')
    setDataFim('')
    setHora('')
    carregar()
  }

  async function remover(id: string) {
    if (!window.confirm('Remover este item do calendário?')) return
    await supabase.from('newsroom_datas').delete().eq('id', id)
    carregar()
  }

  const input = 'input-field rounded-md px-2 py-1.5 text-sm text-primary'
  const rotulo = 'flex flex-col gap-1 text-xs text-muted'

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border border-white/10 bg-surface p-4">
        <h2 className="font-heading text-lg font-semibold text-primary">Novo item no calendário</h2>
        <p className="text-xs text-muted">
          No dia, a equipe vê um aviso ao abrir o CRM. Aniversários se repetem todo ano sozinhos.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={rotulo}>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={input}>
              {Object.entries(TIPOS_DATA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.icone} {v.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className={`${rotulo} sm:col-span-2`}>
            Título {tipo === 'aniversario' ? '(opcional)' : ''}
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={input} />
          </label>
          <label className={rotulo}>
            {tipo === 'aniversario' ? 'Data de nascimento' : 'Data'}
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={input} />
          </label>
          {(tipo === 'ferias' || tipo === 'feriado' || tipo === 'evento') && (
            <label className={rotulo}>
              Até (opcional)
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className={input} />
            </label>
          )}
          {(tipo === 'reuniao' || tipo === 'evento') && (
            <label className={rotulo}>
              Hora
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={input} />
            </label>
          )}
          {(tipo === 'aniversario' || tipo === 'ferias') && (
            <label className={rotulo}>
              Pessoa
              <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={input}>
                <option value="">Selecione…</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tipo !== 'aniversario' && (
            <label className="flex items-center gap-2 text-sm text-primary">
              <input type="checkbox" checked={anual} onChange={(e) => setAnual(e.target.checked)} />
              Repete todo ano
            </label>
          )}
        </div>
        {erro && <p className="text-sm text-accent-danger">{erro}</p>}
        <button onClick={criar} disabled={salvando} className="rounded-md bg-accent-success px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">
          {salvando ? 'Salvando…' : 'Adicionar'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-muted">
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Título</th>
              <th className="px-3 py-2 font-medium">Pessoa</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {datas.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">Nada no calendário ainda.</td></tr>
            ) : (
              datas.map((d) => {
                const t = TIPOS_DATA[d.tipo] ?? TIPOS_DATA.evento
                return (
                  <tr key={d.id} className="border-b border-white/5">
                    <td className="px-3 py-2 text-muted">
                      {d.anual ? `${d.data.slice(8, 10)}/${d.data.slice(5, 7)} (todo ano)` : fmt(d.data)}
                      {d.data_fim ? ` a ${fmt(d.data_fim)}` : ''}
                      {d.hora ? ` · ${d.hora}` : ''}
                    </td>
                    <td className="px-3 py-2 text-primary">{t.icone} {t.rotulo}</td>
                    <td className="px-3 py-2 text-primary">{d.titulo}</td>
                    <td className="px-3 py-2 text-muted">{pessoas.find((p) => p.id === d.usuario_id)?.nome ?? '—'}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => remover(d.id)} className="text-xs text-accent-danger hover:underline">Remover</button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
