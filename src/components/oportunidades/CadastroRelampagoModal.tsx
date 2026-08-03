'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { Modal } from '@/components/ui/Modal'
import { formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { ORIGEM_OPCOES } from '@/lib/oportunidades/status'

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

  function resetar() {
    setClienteNome('')
    setClienteTelefone('')
    setOrigem('')
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

        <div>
          <label className="block text-sm font-medium text-primary/80">Nome do cliente</label>
          <input
            type="text"
            value={clienteNome}
            onChange={(e) => setClienteNome(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
            placeholder="Ex: Cliente Teste LTDA"
            disabled={salvando}
            autoFocus
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
