'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { AppHeader } from '@/components/layout/AppHeader'
import { FiltroData } from '@/components/busca/FiltroData'
import { PedidoDetalheModal } from '@/components/kanban/PedidoDetalheModal'
import { MOTIVO_ARQUIVAMENTO_LABELS } from '@/lib/kanban/status'
import { proximoDia, type ModoFiltroData } from '@/lib/kanban/filtro-data'
import type { ArquivoMotivo } from '@/types/database'

interface PedidoArquivadoResumo {
  id: string
  numero: number
  cliente_nome: string
  criado_em: string
  arquivado_motivo: ArquivoMotivo | null
}

export default function ArquivadosPage() {
  const { profile, loading } = useAuth()
  const [supabase] = useState(() => createClient())
  const [pedidoAbertoId, setPedidoAbertoId] = useState<string | null>(null)

  const [modoData, setModoData] = useState<ModoFiltroData>('nenhum')
  const [dataEspecifica, setDataEspecifica] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [numeroInput, setNumeroInput] = useState('')

  const [resultados, setResultados] = useState<PedidoArquivadoResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Carrega todos os arquivados ao entrar na página (sem filtros).
  useEffect(() => {
    let ativo = true

    async function carregarInicial() {
      const { data, error } = await supabase
        .from('pedidos')
        .select('id, numero, cliente_nome, criado_em, arquivado_motivo')
        .eq('status', 'ARQUIVADO')
        .order('criado_em', { ascending: false })

      if (!ativo) return
      if (!error) setResultados(data ?? [])
      setCarregando(false)
    }

    carregarInicial()

    return () => {
      ativo = false
    }
  }, [supabase])

  async function buscar(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    if (modoData === 'especifica' && !dataEspecifica) {
      setErro('Selecione a data do filtro.')
      return
    }
    if (modoData === 'intervalo' && !dataDe && !dataAte) {
      setErro('Selecione ao menos uma data no intervalo.')
      return
    }

    let numero: number | null = null
    const termo = numeroInput.trim()
    if (termo) {
      numero = Number(termo)
      if (!Number.isFinite(numero)) {
        setErro('Número de pedido inválido.')
        return
      }
    }

    setCarregando(true)
    let query = supabase
      .from('pedidos')
      .select('id, numero, cliente_nome, criado_em, arquivado_motivo')
      .eq('status', 'ARQUIVADO')
      .order('criado_em', { ascending: false })

    if (numero !== null) query = query.eq('numero', numero)

    if (modoData === 'especifica' && dataEspecifica) {
      query = query
        .gte('criado_em', `${dataEspecifica}T00:00:00`)
        .lt('criado_em', `${proximoDia(dataEspecifica)}T00:00:00`)
    } else if (modoData === 'intervalo') {
      if (dataDe) query = query.gte('criado_em', `${dataDe}T00:00:00`)
      if (dataAte) query = query.lt('criado_em', `${proximoDia(dataAte)}T00:00:00`)
    }

    const { data, error } = await query
    setCarregando(false)

    if (error) {
      setErro('Não foi possível buscar. Tente novamente.')
      return
    }
    setResultados(data ?? [])
  }

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base text-muted">
        Carregando…
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <AppHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <h1 className="font-heading text-2xl font-semibold tracking-wide text-primary">
          Arquivados
        </h1>

        <form onSubmit={buscar} className="mt-4 flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={numeroInput}
              onChange={(e) => setNumeroInput(e.target.value)}
              placeholder="Número do pedido (opcional)"
              className="input-field w-64 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={carregando}
              className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
            >
              {carregando ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          <FiltroData
            modo={modoData}
            onModoChange={setModoData}
            dataEspecifica={dataEspecifica}
            onDataEspecificaChange={setDataEspecifica}
            dataDe={dataDe}
            onDataDeChange={setDataDe}
            dataAte={dataAte}
            onDataAteChange={setDataAte}
          />
        </form>

        {erro && <p className="mt-3 text-sm text-accent-danger">{erro}</p>}

        <div className="mt-6 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-surface-alt text-muted">
                <th className="px-3 pb-2 pt-2.5 font-medium">Pedido</th>
                <th className="px-3 pb-2 pt-2.5 font-medium">Cliente</th>
                <th className="px-3 pb-2 pt-2.5 font-medium">Criado em</th>
                <th className="px-3 pb-2 pt-2.5 font-medium">Motivo do arquivamento</th>
              </tr>
            </thead>
            <tbody className="bg-surface">
              {resultados.map((p) => (
                <tr key={p.id} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setPedidoAbertoId(p.id)}
                      className="font-mono font-medium text-accent-compras hover:text-primary"
                    >
                      #{p.numero}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-primary">{p.cliente_nome}</td>
                  <td className="px-3 py-2 text-primary">
                    {new Date(p.criado_em).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-3 py-2 text-primary">
                    {p.arquivado_motivo ? MOTIVO_ARQUIVAMENTO_LABELS[p.arquivado_motivo] : '—'}
                  </td>
                </tr>
              ))}
              {!carregando && resultados.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted">
                    Nenhum pedido arquivado encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      <PedidoDetalheModal
        pedidoId={pedidoAbertoId}
        onClose={() => setPedidoAbertoId(null)}
        setor={profile.setor}
      />
    </div>
  )
}
