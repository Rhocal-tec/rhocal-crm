'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { OPORTUNIDADE_KANBAN_COLUMNS } from '@/lib/oportunidades/status'
import type { Database } from '@/types/database'

type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

// Fase 31: cria um novo pedido (fluxo já existente, status inicial PEDIDO)
// pré-preenchido com os dados do cliente da oportunidade, vinculado via
// oportunidades.pedido_id, e move a oportunidade automaticamente para GANHO.
export function ConverterEmOrcamentoSection({
  oportunidade,
  onAtualizada,
}: {
  oportunidade: Oportunidade
  onAtualizada: (oportunidade: Oportunidade) => void
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [convertendo, setConvertendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pedidoNumero, setPedidoNumero] = useState<number | null>(null)

  const podeConverter = OPORTUNIDADE_KANBAN_COLUMNS.includes(oportunidade.status)
  const jaConvertida = oportunidade.status === 'GANHO' && oportunidade.pedido_id !== null

  if (!podeConverter && !jaConvertida) return null

  async function converter() {
    if (!user) return
    const confirmado = window.confirm(
      'Criar um novo Orçamento a partir desta oportunidade? Ela será movida para "Convertida em Orçamento".',
    )
    if (!confirmado) return

    setConvertendo(true)
    setErro(null)

    const { data: pedido, error: erroPedido } = await supabase
      .from('pedidos')
      .insert({
        cliente_nome: oportunidade.cliente_nome,
        cliente_cnpj: oportunidade.cliente_cnpj,
        cliente_telefone: oportunidade.cliente_telefone,
        cliente_contato: oportunidade.cliente_contato,
        criado_por: user.id,
        empresa_id: oportunidade.empresa_id,
      })
      .select()
      .single()

    if (erroPedido || !pedido) {
      setErro('Não foi possível criar o orçamento. Tente novamente.')
      setConvertendo(false)
      return
    }

    const { error: erroOportunidade } = await supabase
      .from('oportunidades')
      .update({ status: 'GANHO', pedido_id: pedido.id })
      .eq('id', oportunidade.id)

    setConvertendo(false)

    if (erroOportunidade) {
      setErro(
        `Orçamento #${pedido.numero} criado, mas houve um erro ao vincular a oportunidade. Atualize a página.`,
      )
      return
    }

    setPedidoNumero(pedido.numero)
    onAtualizada({
      ...oportunidade,
      status: 'GANHO',
      pedido_id: pedido.id,
      movido_por: user.id,
    })
  }

  return (
    <div className="mt-4">
      {jaConvertida ? (
        <div className="rounded-md border border-accent-success/30 bg-accent-success/10 px-3 py-2 text-sm text-accent-success">
          ✓ Convertida —{' '}
          <Link href="/dashboard" className="underline">
            {pedidoNumero !== null ? `Orçamento #${pedidoNumero}` : 'ver no Kanban'}
          </Link>{' '}
          criado no Kanban.
        </div>
      ) : (
        podeConverter && (
          <button
            onClick={converter}
            disabled={convertendo}
            className="rounded-md bg-accent-success px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-success/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {convertendo ? 'Convertendo…' : 'Converter em Orçamento'}
          </button>
        )
      )}
      {erro && <p className="mt-2 text-xs text-accent-danger">{erro}</p>}
    </div>
  )
}
