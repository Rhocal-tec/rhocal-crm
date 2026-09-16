'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { NOTIFICAR_EM_OPCOES } from '@/lib/tarefas/opcoes'
import { sincronizarTarefaComOmie } from '@/lib/tarefas/sincronizar'
import { TipoTarefaSelect } from '@/components/tarefas/TipoTarefaSelect'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']
type Tarefa = Database['public']['Tables']['tarefas']['Row']

// Modal avulso de criação rápida de tarefa — recebe oportunidadeId OU
// pedidoId (mesmo par aceito por TarefasTab), pra ser aberto direto de uma
// tela de detalhe sem precisar navegar até a aba Tarefas. Mesmo padrão de
// formulário/insert já usado em TarefasTab e CriarTarefaClienteModal.
export function TarefaModal({
  oportunidadeId,
  pedidoId,
  empresaId,
  onClose,
  onCriada,
}: {
  oportunidadeId?: string
  pedidoId?: string
  empresaId?: string | null
  onClose: () => void
  onCriada?: (tarefa: Tarefa) => void
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [descricao, setDescricao] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [dataPrevista, setDataPrevista] = useState('')
  const [tipo, setTipo] = useState('')
  const [notificarEm, setNotificarEm] = useState('nao_notificar')
  const [importante, setImportante] = useState(false)
  const [urgente, setUrgente] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Dados de contato (opcional) — só fazem sentido pra tarefa "solta", sem
  // oportunidade/pedido pai (o contato já vive lá quando há um dos dois).
  const [clienteNome, setClienteNome] = useState('')
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [clienteCnpj, setClienteCnpj] = useState('')
  const [contatoNome, setContatoNome] = useState('')
  const [contatoCargo, setContatoCargo] = useState('')
  const [contatoEmail, setContatoEmail] = useState('')
  const semVinculo = !oportunidadeId && !pedidoId

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('ativo', true)
      .then(({ data }) => setProfiles(data ?? []))
  }, [supabase])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!user) return
    if (!descricao.trim()) {
      setErro('Informe a descrição da tarefa.')
      return
    }

    setSalvando(true)

    const { data, error } = await supabase
      .from('tarefas')
      .insert({
        oportunidade_id: oportunidadeId ?? null,
        pedido_id: pedidoId ?? null,
        empresa_id: empresaId ?? null,
        descricao: descricao.trim(),
        responsavel: responsavel || null,
        data_prevista: dataPrevista || null,
        tipo: tipo || null,
        notificar_em: notificarEm,
        importante,
        urgente,
        cliente_nome: clienteNome.trim() || null,
        cliente_telefone: clienteTelefone.trim() || null,
        cliente_cnpj: clienteCnpj.trim() || null,
        contato_nome: contatoNome.trim() || null,
        contato_cargo: contatoCargo.trim() || null,
        contato_email: contatoEmail.trim() || null,
        criado_por: user.id,
      })
      .select()
      .single()

    setSalvando(false)

    if (error || !data) {
      setErro('Não foi possível criar a tarefa. Tente novamente.')
      return
    }

    if (data.oportunidade_id) sincronizarTarefaComOmie(data.id)
    onCriada?.(data)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Nova tarefa">
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <div>
          <label className="block text-xs text-muted">Descrição</label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            placeholder="Ex: Ligar para confirmar interesse"
            disabled={salvando}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted">Responsável (opcional)</label>
            <select
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
              disabled={salvando}
            >
              <option value="">—</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted">Data prevista (opcional)</label>
            <input
              type="date"
              value={dataPrevista}
              onChange={(e) => setDataPrevista(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
              disabled={salvando}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted">Tipo (opcional)</label>
            <TipoTarefaSelect value={tipo} onChange={setTipo} disabled={salvando} />
          </div>
          <div>
            <label className="block text-xs text-muted">Lembrete</label>
            <select
              value={notificarEm}
              onChange={(e) => setNotificarEm(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
              disabled={salvando}
            >
              {NOTIFICAR_EM_OPCOES.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-end gap-3 pb-1.5">
            <label className="flex items-center gap-1.5 text-xs text-primary/80">
              <input
                type="checkbox"
                checked={importante}
                onChange={(e) => setImportante(e.target.checked)}
                disabled={salvando}
                className="h-4 w-4 accent-accent-primary"
              />
              Importante
            </label>
            <label className="flex items-center gap-1.5 text-xs text-primary/80">
              <input
                type="checkbox"
                checked={urgente}
                onChange={(e) => setUrgente(e.target.checked)}
                disabled={salvando}
                className="h-4 w-4 accent-accent-danger"
              />
              Urgente
            </label>
          </div>
        </div>

        {semVinculo && (
          <div className="flex flex-col gap-2 rounded-md border border-white/10 bg-surface-alt p-3">
            <p className="text-xs font-medium text-primary/80">Dados de contato (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted">Nome do cliente</label>
                <input
                  type="text"
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
                  placeholder="Ex: Cliente Teste LTDA"
                  disabled={salvando}
                />
              </div>
              <div>
                <label className="block text-xs text-muted">Telefone</label>
                <input
                  type="tel"
                  value={clienteTelefone}
                  onChange={(e) => setClienteTelefone(formatarTelefoneInput(e.target.value))}
                  className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
                  placeholder="(11) 91234-5678"
                  disabled={salvando}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted">CNPJ</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={clienteCnpj}
                  onChange={(e) => setClienteCnpj(e.target.value)}
                  className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 font-mono text-sm"
                  placeholder="00.000.000/0000-00"
                  disabled={salvando}
                />
              </div>
              <div>
                <label className="block text-xs text-muted">Nome do contato</label>
                <input
                  type="text"
                  value={contatoNome}
                  onChange={(e) => setContatoNome(e.target.value)}
                  className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
                  placeholder="Ex: Maria Compras"
                  disabled={salvando}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted">Cargo do contato</label>
                <input
                  type="text"
                  value={contatoCargo}
                  onChange={(e) => setContatoCargo(e.target.value)}
                  className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
                  placeholder="Ex: Comprador"
                  disabled={salvando}
                />
              </div>
              <div>
                <label className="block text-xs text-muted">E-mail do contato</label>
                <input
                  type="email"
                  value={contatoEmail}
                  onChange={(e) => setContatoEmail(e.target.value)}
                  className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
                  placeholder="nome@empresa.com"
                  disabled={salvando}
                />
              </div>
            </div>
          </div>
        )}

        {erro && <p className="text-xs text-accent-danger">{erro}</p>}
        <div className="mt-1 flex justify-end gap-2">
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
            className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Criar tarefa'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
