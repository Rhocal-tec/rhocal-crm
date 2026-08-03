'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { Modal } from '@/components/ui/Modal'
import { formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { ORIGEM_OPCOES } from '@/lib/oportunidades/status'

export function NovaOportunidadeModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { user } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [clienteNome, setClienteNome] = useState('')
  const [clienteCnpj, setClienteCnpj] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [clienteContato, setClienteContato] = useState('')
  const [origem, setOrigem] = useState('')
  const [temperatura, setTemperatura] = useState('')
  const [valorEstimado, setValorEstimado] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function resetar() {
    setClienteNome('')
    setClienteCnpj('')
    setClienteTelefone('')
    setClienteContato('')
    setOrigem('')
    setTemperatura('')
    setValorEstimado('')
    setErro(null)
  }

  function fechar() {
    if (salvando) return
    resetar()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!user) return
    if (!empresaAtiva) {
      setErro('Não foi possível identificar a empresa ativa. Recarregue a página.')
      return
    }
    if (!clienteNome.trim()) {
      setErro('Informe o nome do cliente.')
      return
    }

    const valorEstimadoNumero = valorEstimado.trim() === '' ? null : Number(valorEstimado)
    if (valorEstimadoNumero !== null && !Number.isFinite(valorEstimadoNumero)) {
      setErro('Valor estimado inválido.')
      return
    }

    setSalvando(true)

    const { error } = await supabase.from('oportunidades').insert({
      cliente_nome: clienteNome.trim(),
      cliente_cnpj: clienteCnpj.trim() || null,
      cliente_telefone: clienteTelefone.trim() || null,
      cliente_contato: clienteContato.trim() || null,
      origem: origem.trim() || null,
      temperatura: temperatura.trim() || null,
      valor_estimado: valorEstimadoNumero,
      criado_por: user.id,
      empresa_id: empresaAtiva.id,
    })

    setSalvando(false)

    if (error) {
      setErro('Não foi possível criar a oportunidade. Tente novamente.')
      return
    }

    resetar()
    onClose()
  }

  return (
    <Modal open={open} onClose={fechar} title="Novo Lead" widthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-primary/80">Nome do cliente</label>
          <input
            type="text"
            value={clienteNome}
            onChange={(e) => setClienteNome(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
            placeholder="Ex: Cliente Teste LTDA"
            disabled={salvando}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-primary/80">CNPJ (opcional)</label>
            <input
              type="text"
              inputMode="numeric"
              value={clienteCnpj}
              onChange={(e) => setClienteCnpj(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 font-mono text-sm"
              placeholder="00.000.000/0000-00"
              disabled={salvando}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary/80">
              Telefone (opcional)
            </label>
            <input
              type="tel"
              value={clienteTelefone}
              onChange={(e) => setClienteTelefone(formatarTelefoneInput(e.target.value))}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="(11) 91234-5678"
              disabled={salvando}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-primary/80">
            Nome do contato (opcional)
          </label>
          <input
            type="text"
            value={clienteContato}
            onChange={(e) => setClienteContato(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
            placeholder="Ex: Maria Compras"
            disabled={salvando}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-primary/80">
              Origem (opcional)
            </label>
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              disabled={salvando}
            >
              <option value="">—</option>
              {ORIGEM_OPCOES.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary/80">
              Temperatura (opcional)
            </label>
            <input
              type="text"
              value={temperatura}
              onChange={(e) => setTemperatura(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="Ex: Frio, morno, quente…"
              disabled={salvando}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-primary/80">
            Valor estimado (opcional)
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={valorEstimado}
            onChange={(e) => setValorEstimado(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-3 py-2 font-mono text-sm"
            placeholder="0,00"
            disabled={salvando}
          />
        </div>

        {erro && (
          <div className="rounded-md border border-accent-danger/30 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={fechar}
            disabled={salvando}
            className="rounded-md border border-white/15 px-4 py-2 text-sm text-primary/80 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando || !empresaAtiva}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
          >
            {salvando ? 'Criando…' : 'Criar Lead'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
