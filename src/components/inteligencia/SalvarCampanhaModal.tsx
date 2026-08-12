'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { ClienteInteligencia } from '@/lib/inteligencia/agregar'
import { serializarFiltros, type FiltrosState } from './FiltrosInteligencia'

// Fase 36.3: "Salvar como campanha" — mesma base de clientes já usada pelo
// Exportar CSV (selecionados, ou todos os filtrados se nada estiver
// selecionado). Grava o snapshot dos filtros e a lista de clientes.
export function SalvarCampanhaModal({
  aberto,
  clientes,
  filtros,
  empresaId,
  onClose,
  onSalva,
}: {
  aberto: boolean
  clientes: ClienteInteligencia[]
  filtros: FiltrosState
  empresaId: string | null
  onClose: () => void
  onSalva: () => void
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function fechar() {
    setNome('')
    setDescricao('')
    setErro(null)
    onClose()
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!user || !empresaId) return
    if (!nome.trim()) {
      setErro('Informe um nome pra campanha.')
      return
    }
    if (clientes.length === 0) {
      setErro('Nenhum cliente pra salvar — ajuste os filtros ou a seleção primeiro.')
      return
    }

    setSalvando(true)

    const { data: campanha, error: erroCampanha } = await supabase
      .from('campanhas')
      .insert({
        empresa_id: empresaId,
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        filtros_aplicados: serializarFiltros(filtros),
        total_clientes: clientes.length,
        criado_por: user.id,
      })
      .select()
      .single()

    if (erroCampanha || !campanha) {
      setSalvando(false)
      setErro('Não foi possível salvar a campanha. Tente novamente.')
      return
    }

    const linhas = clientes.map((c) => ({
      campanha_id: campanha.id,
      cliente_omie_codigo: c.omieClienteId !== null ? String(c.omieClienteId) : null,
      cliente_nome: c.nome,
      cliente_cnpj: c.cnpj,
    }))

    const { error: erroClientes } = await supabase.from('campanha_clientes').insert(linhas)

    setSalvando(false)

    if (erroClientes) {
      setErro('Campanha criada, mas houve um erro ao registrar os clientes. Confira em "Campanhas".')
      return
    }

    fechar()
    onSalva()
  }

  return (
    <Modal open={aberto} onClose={fechar} title="Salvar como campanha">
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          {clientes.length} cliente(s) serão registrados nesta campanha.
        </p>
        <div>
          <label className="block text-xs text-muted">Nome da campanha</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            placeholder="Ex: Reativação clientes frios — agosto"
            disabled={salvando}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-muted">Descrição (opcional)</label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            rows={2}
            disabled={salvando}
          />
        </div>
        {erro && <p className="text-xs text-accent-danger">{erro}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={fechar}
            disabled={salvando}
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-primary/80 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Salvar campanha'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
