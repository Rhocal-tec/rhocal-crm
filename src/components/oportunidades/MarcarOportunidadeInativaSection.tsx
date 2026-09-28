'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { OPORTUNIDADE_KANBAN_COLUMNS } from '@/lib/oportunidades/status'
import { podeAcessarOportunidades } from '@/lib/oportunidades/permissions'
import type { Database, SetorTipo } from '@/types/database'

type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

// Fase 42.4: equivalente do "Sem retorno" do card (OportunidadeCard), só que
// dentro do modal de detalhe — pro caso de o vendedor já estar com a
// oportunidade aberta e preferir encerrar por aqui em vez de fechar e usar o
// atalho do card. Mesmo destino final (status INATIVA) do job automático de
// 3 dias (0034_oportunidades_inatividade.sql), só que manual e imediato — sem
// motivo obrigatório, porque não é uma decisão de negócio perdido.
export function MarcarOportunidadeInativaSection({
  oportunidade,
  setor,
  onAtualizada,
}: {
  oportunidade: Oportunidade
  setor: SetorTipo
  onAtualizada: (oportunidade: Oportunidade) => void
}) {
  const [supabase] = useState(() => createClient())
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const podeMarcar = podeAcessarOportunidades(setor)
  const statusPermite = OPORTUNIDADE_KANBAN_COLUMNS.includes(oportunidade.status)

  if (!podeMarcar || !statusPermite) return null

  function cancelar() {
    setAberto(false)
    setErro(null)
  }

  async function confirmar() {
    setSalvando(true)
    setErro(null)

    const { error } = await supabase
      .from('oportunidades')
      .update({ status: 'INATIVA' })
      .eq('id', oportunidade.id)

    setSalvando(false)

    if (error) {
      setErro('Não foi possível marcar a oportunidade como inativa. Tente novamente.')
      return
    }

    onAtualizada({ ...oportunidade, status: 'INATIVA' })
    setAberto(false)
  }

  if (!aberto) {
    return (
      <div className="mt-2">
        <button
          onClick={() => setAberto(true)}
          className="rounded-md border border-accent-alert/30 px-3 py-1.5 text-xs font-medium text-accent-alert/90 transition-colors hover:bg-accent-alert/10 hover:text-accent-alert"
        >
          Sem retorno do cliente
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-md border border-accent-alert/30 bg-accent-alert/5 p-3">
      <p className="text-sm font-medium text-primary">Marcar oportunidade como inativa</p>
      <p className="mt-1 text-xs text-muted">
        Contato foi feito, mas o cliente parou de responder — sai do funil ativo sem contar como
        negócio perdido.
      </p>

      {erro && <p className="mt-2 text-xs text-accent-danger">{erro}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={confirmar}
          disabled={salvando}
          className="rounded-md bg-accent-alert px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-accent-alert/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {salvando ? 'Salvando…' : 'Confirmar'}
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
