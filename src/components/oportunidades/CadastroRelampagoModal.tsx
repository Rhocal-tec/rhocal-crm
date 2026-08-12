'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { Modal } from '@/components/ui/Modal'
import { formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { ORIGEM_OPCOES } from '@/lib/oportunidades/status'
import { buscarClientesLocalPorNome, type ClienteSugestao } from '@/lib/clientes/buscar'

const MIN_CARACTERES_BUSCA_CLIENTE = 3
const DEBOUNCE_BUSCA_CLIENTE_MS = 400

// Fase 32.3: formulário compacto pro SDR cadastrar um lead em segundos —
// só nome, telefone e origem. Demais campos ficam vazios, completados depois
// abrindo a oportunidade normalmente (status nasce NOVO_LEAD, igual ao "Novo Lead" completo).
export function CadastroRelampagoModal({
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
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [origem, setOrigem] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Fase 34: autocomplete contra a tabela `clientes` local — vale até mais
  // aqui do que no Novo Lead completo, já que o cadastro relâmpago é
  // literalmente sobre digitar o mínimo possível.
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
    if (cliente.telefone) setClienteTelefone(formatarTelefoneInput(cliente.telefone))
    setSugestoesCliente([])
    setDropdownClienteAberto(false)
  }

  function resetar() {
    setClienteNome('')
    setClienteTelefone('')
    setOrigem('')
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

    setSalvando(true)

    const { error } = await supabase.from('oportunidades').insert({
      cliente_nome: clienteNome.trim(),
      cliente_telefone: clienteTelefone.trim() || null,
      origem: origem.trim() || null,
      criado_por: user.id,
      empresa_id: empresaAtiva.id,
    })

    setSalvando(false)

    if (error) {
      setErro('Não foi possível criar o lead. Tente novamente.')
      return
    }

    resetar()
    onClose()
  }

  return (
    <Modal open={open} onClose={fechar} title="Cadastro rápido" widthClassName="max-w-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          Só o essencial agora — complete o resto depois, abrindo o lead normalmente.
        </p>

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
            autoFocus
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
                  </button>
                </li>
              ))}
            </ul>
          )}
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

        <div>
          <label className="block text-sm font-medium text-primary/80">Origem (opcional)</label>
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
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
