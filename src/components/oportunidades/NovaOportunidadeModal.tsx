'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { Modal } from '@/components/ui/Modal'
import { formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { ORIGEM_OPCOES } from '@/lib/oportunidades/status'
import { buscarClientesLocalPorNome, type ClienteSugestao } from '@/lib/clientes/buscar'

// Mesmo mínimo/debounce usados na busca por nome de Novo Orçamento (fase 18.2).
const MIN_CARACTERES_BUSCA_CLIENTE = 3
const DEBOUNCE_BUSCA_CLIENTE_MS = 400

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

  // Fase 34: autocomplete contra a tabela `clientes` local — mais rápido que
  // consultar o Omie a cada lead novo, e já traz telefone/contato junto.
  const [sugestoesCliente, setSugestoesCliente] = useState<ClienteSugestao[]>([])
  const [dropdownClienteAberto, setDropdownClienteAberto] = useState(false)
  const debounceClienteRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function atualizarClienteNome(valor: string) {
    setClienteNome(valor)
    setDropdownClienteAberto(true)

    if (debounceClienteRef.current) clearTimeout(debounceClienteRef.current)

    const termo = valor.trim()
    if (termo.length < MIN_CARACTERES_BUSCA_CLIENTE) {
      setSugestoesCliente([])
      return
    }

    debounceClienteRef.current = setTimeout(async () => {
      setSugestoesCliente(await buscarClientesLocalPorNome(supabase, termo))
    }, DEBOUNCE_BUSCA_CLIENTE_MS)
  }

  function selecionarCliente(cliente: ClienteSugestao) {
    setClienteNome(cliente.razaoSocial)
    if (cliente.cnpj) setClienteCnpj(cliente.cnpj)
    if (cliente.telefone) setClienteTelefone(formatarTelefoneInput(cliente.telefone))
    if (cliente.contato) setClienteContato(cliente.contato)
    setSugestoesCliente([])
    setDropdownClienteAberto(false)
  }

  function resetar() {
    setClienteNome('')
    setClienteCnpj('')
    setClienteTelefone('')
    setClienteContato('')
    setOrigem('')
    setTemperatura('')
    setValorEstimado('')
    setSugestoesCliente([])
    setDropdownClienteAberto(false)
    if (debounceClienteRef.current) clearTimeout(debounceClienteRef.current)
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
        <div className="relative">
          <label className="block text-sm font-medium text-primary/80">Nome do cliente</label>
          <input
            type="text"
            value={clienteNome}
            onChange={(e) => atualizarClienteNome(e.target.value)}
            onFocus={() => setDropdownClienteAberto(true)}
            onBlur={() => setTimeout(() => setDropdownClienteAberto(false), 150)}
            autoComplete="off"
            className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
            placeholder="Ex: Cliente Teste LTDA"
            disabled={salvando}
          />
          {dropdownClienteAberto && sugestoesCliente.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-white/10 bg-surface-alt py-1 shadow-lg">
              {sugestoesCliente.map((cliente) => (
                <li key={cliente.id}>
                  <button
                    type="button"
                    onMouseDown={() => selecionarCliente(cliente)}
                    className="block w-full truncate px-3 py-1.5 text-left text-sm text-primary hover:bg-white/10"
                  >
                    {cliente.razaoSocial}
                    {cliente.cnpj && <span className="ml-1.5 text-xs text-muted">— {cliente.cnpj}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
