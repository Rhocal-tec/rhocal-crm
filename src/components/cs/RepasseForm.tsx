'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { DESTINOS_REPASSE } from '@/lib/cs/constantes'

// Encaminha o cliente a outra área com o resumo da conversa. Pedido de preço,
// desconto ou condição só pode ir para a closer — a CS nunca negocia preço.
export function RepasseForm({
  open,
  onClose,
  empresaId,
  usuarioId,
  clienteNome,
  clienteCnpj,
  garantirContato,
  onCriado,
}: {
  open: boolean
  onClose: () => void
  empresaId: string
  usuarioId: string
  clienteNome: string
  clienteCnpj: string | null
  garantirContato?: () => Promise<string | null>
  onCriado: () => void
}) {
  const [supabase] = useState(() => createClient())
  const [destino, setDestino] = useState('vendedora')
  const [pedidoDePreco, setPedidoDePreco] = useState(false)
  const [resumo, setResumo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const destinoFinal = pedidoDePreco ? 'closer' : destino

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!resumo.trim()) {
      setErro('Escreva o resumo da conversa para quem vai receber.')
      return
    }
    setSalvando(true)
    const contatoId = garantirContato ? await garantirContato() : null
    const { error } = await supabase.from('cs_repasses').insert({
      empresa_id: empresaId,
      contato_id: contatoId,
      cliente_nome: clienteNome,
      cliente_cnpj: clienteCnpj,
      destino: destinoFinal,
      resumo: resumo.trim(),
      criado_por: usuarioId,
    })
    setSalvando(false)
    if (error) {
      setErro(`Não foi possível criar o repasse: ${error.message}`)
      return
    }
    setResumo('')
    setPedidoDePreco(false)
    onCriado()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Repasse — ${clienteNome}`}>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm text-primary/90">
          <input
            type="checkbox"
            checked={pedidoDePreco}
            onChange={(e) => setPedidoDePreco(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-accent-primary"
          />
          <span>
            O cliente pediu preço, desconto ou condição
            <span className="block text-xs text-muted">Nesse caso o repasse vai obrigatoriamente para a closer.</span>
          </span>
        </label>
        <div>
          <label className="block text-xs text-muted">Destino</label>
          <select
            value={destinoFinal}
            onChange={(e) => setDestino(e.target.value)}
            disabled={pedidoDePreco}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm disabled:opacity-60"
          >
            {DESTINOS_REPASSE.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted">Resumo da conversa</label>
          <textarea
            value={resumo}
            onChange={(e) => setResumo(e.target.value)}
            rows={4}
            autoFocus
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          />
        </div>
        {erro && <p className="text-xs text-accent-danger">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-primary/80 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {salvando ? 'Enviando…' : 'Enviar repasse'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
