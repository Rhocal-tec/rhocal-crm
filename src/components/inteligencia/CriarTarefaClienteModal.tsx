'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { NOTIFICAR_EM_OPCOES } from '@/lib/tarefas/opcoes'
import { sincronizarTarefaComOmie } from '@/lib/tarefas/sincronizar'
import { TipoTarefaSelect } from '@/components/tarefas/TipoTarefaSelect'
import type { ClienteInteligencia } from '@/lib/inteligencia/agregar'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

// Fase 36.2: "Criar tarefa" a partir do alerta de churn — mesmos campos da
// aba Tarefas (fase 32/33), mas sem lista (só o formulário de criação), já
// vinculada ao cliente via `vinculoTarefaTipo`/`vinculoTarefaId` calculados
// na agregação (oportunidade aberta mais recente, senão pedido mais recente).
export function CriarTarefaClienteModal({
  cliente,
  empresaId,
  onClose,
}: {
  cliente: ClienteInteligencia | null
  empresaId: string | null
  onClose: () => void
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
  const [sucesso, setSucesso] = useState(false)

  useEffect(() => {
    if (!cliente) return
    setDescricao(`Contatar ${cliente.nome} — risco de churn`)
    setResponsavel('')
    setDataPrevista('')
    setTipo('')
    setNotificarEm('nao_notificar')
    setImportante(false)
    setUrgente(false)
    setErro(null)
    setSucesso(false)

    supabase
      .from('profiles')
      .select('*')
      .then(({ data }) => setProfiles(data ?? []))
  }, [cliente, supabase])

  if (!cliente) return null

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!user || !cliente) return
    if (!descricao.trim()) {
      setErro('Informe a descrição da tarefa.')
      return
    }
    if (!cliente.vinculoTarefaId || !cliente.vinculoTarefaTipo) {
      setErro('Não foi possível vincular esta tarefa a uma oportunidade ou pedido deste cliente.')
      return
    }

    setSalvando(true)

    const { data, error } = await supabase
      .from('tarefas')
      .insert({
        oportunidade_id: cliente.vinculoTarefaTipo === 'oportunidade' ? cliente.vinculoTarefaId : null,
        pedido_id: cliente.vinculoTarefaTipo === 'pedido' ? cliente.vinculoTarefaId : null,
        empresa_id: empresaId,
        descricao: descricao.trim(),
        responsavel: responsavel || null,
        data_prevista: dataPrevista || null,
        tipo: tipo || null,
        notificar_em: notificarEm,
        importante,
        urgente,
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
    setSucesso(true)
  }

  return (
    <Modal open={cliente !== null} onClose={onClose} title={`Criar tarefa — ${cliente.nome}`}>
      {sucesso ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-sm text-accent-success">Tarefa criada com sucesso.</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:bg-accent-primary-dark"
          >
            Fechar
          </button>
        </div>
      ) : (
        <form onSubmit={salvar} className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            Vinculada {cliente.vinculoTarefaTipo === 'oportunidade' ? 'à oportunidade aberta' : 'ao pedido'} mais
            recente deste cliente.
          </p>
          <div>
            <label className="block text-xs text-muted">Descrição</label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
              disabled={salvando}
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
      )}
    </Modal>
  )
}
