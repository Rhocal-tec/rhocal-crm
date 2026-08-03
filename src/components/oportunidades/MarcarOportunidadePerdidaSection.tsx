'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MOTIVO_PERDA_OPCOES } from '@/lib/kanban/status'
import { OPORTUNIDADE_KANBAN_COLUMNS } from '@/lib/oportunidades/status'
import { podeAcessarOportunidades } from '@/lib/oportunidades/permissions'
import type { Database, SetorTipo } from '@/types/database'

type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

// Mesmo padrão da Fase 13 (MarcarPerdidoSection), aplicado à oportunidade:
// motivo obrigatório (select + detalhe opcional).
export function MarcarOportunidadePerdidaSection({
  oportunidade,
  setor,
  onAtualizada,
}: {
  oportunidade: Oportunidade
  setor: SetorTipo
  onAtualizada: (oportunidade: Oportunidade) => void
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [detalhes, setDetalhes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const podeMarcar = podeAcessarOportunidades(setor)
  const statusPermite = OPORTUNIDADE_KANBAN_COLUMNS.includes(oportunidade.status)

  if (!podeMarcar || !statusPermite) return null

  function cancelar() {
    setAberto(false)
    setMotivo('')
    setDetalhes('')
    setErro(null)
  }

  async function confirmar() {
    if (!motivo) {
      setErro('Selecione o motivo da perda.')
      return
    }

    setSalvando(true)
    setErro(null)

    const motivoFinal = detalhes.trim() ? `${motivo} — ${detalhes.trim()}` : motivo

    const { error } = await supabase
      .from('oportunidades')
      .update({ status: 'PERDIDO', motivo_perda: motivoFinal })
      .eq('id', oportunidade.id)

    setSalvando(false)

    if (error) {
      setErro('Não foi possível marcar a oportunidade como perdida. Tente novamente.')
      return
    }

    onAtualizada({
      ...oportunidade,
      status: 'PERDIDO',
      motivo_perda: motivoFinal,
      movido_por: user?.id ?? oportunidade.movido_por,
    })
    cancelar()
  }

  if (!aberto) {
    return (
      <div className="mt-4">
        <button
          onClick={() => setAberto(true)}
          className="rounded-md border border-accent-danger/30 px-3 py-1.5 text-xs font-medium text-accent-danger/80 transition-colors hover:bg-accent-danger/10 hover:text-accent-danger"
        >
          Marcar como perdida
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-md border border-accent-danger/30 bg-accent-danger/5 p-3">
      <p className="text-sm font-medium text-primary">Marcar oportunidade como perdida</p>

      <div className="mt-2 flex flex-col gap-2">
        <select
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="input-field rounded-md px-3 py-2 text-sm"
        >
          <option value="">Selecione o motivo…</option>
          {MOTIVO_PERDA_OPCOES.map((opcao) => (
            <option key={opcao} value={opcao}>
              {opcao}
            </option>
          ))}
        </select>
        <textarea
          value={detalhes}
          onChange={(e) => setDetalhes(e.target.value)}
          placeholder="Detalhes (opcional)"
          rows={2}
          className="input-field rounded-md px-3 py-2 text-sm"
        />
      </div>

      {erro && <p className="mt-2 text-xs text-accent-danger">{erro}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={confirmar}
          disabled={salvando}
          className="rounded-md bg-accent-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {salvando ? 'Salvando…' : 'Confirmar perda'}
        </button>
        <button
          onClick={cancelar}
          disabled={salvando}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-primary"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
