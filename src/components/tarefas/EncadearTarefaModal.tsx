'use client'

import { useEffect, useState } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/ui/Modal'
import { sincronizarTarefaComOmie } from '@/lib/tarefas/sincronizar'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']

const DIAS_SUGERIDOS = 3

function dataSugerida(): string {
  const data = new Date()
  data.setDate(data.getDate() + DIAS_SUGERIDOS)
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

// Encadeamento (fase 33): oferecido ao escolher "Agendar novo contato" —
// "Criar próxima tarefa?" vinculada à mesma oportunidade/pedido, com data
// sugerida de hoje + 3 dias. Totalmente opcional, fecha sem criar nada se o
// usuário só quiser seguir em frente.
//
// A tarefa original (`tarefaConcluida`) só é marcada Realizada DEPOIS que a
// próxima tarefa é criada com sucesso (via `onConcluirTarefaOriginal`, o
// `marcarRealizada` do hook useConclusaoTarefa) — nunca antes. Cancelar este
// modal ("Não, obrigado") ou fechar sem submeter não toca na original, que
// continua exatamente como estava (pendente, na coluna de prazo que já era
// dela). Isso evita o caso em que a original ficava presa como "concluída"
// sem nenhuma tarefa nova em seu lugar.
export function EncadearTarefaModal({
  tarefaConcluida,
  onClose,
  onCriada,
  onConcluirTarefaOriginal,
}: {
  tarefaConcluida: Tarefa | null
  onClose: () => void
  onCriada: (tarefa: Tarefa) => void
  onConcluirTarefaOriginal: (
    tarefa: Tarefa,
  ) => Promise<{ data: Tarefa | null; error: PostgrestError | null }>
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [descricao, setDescricao] = useState('')
  const [dataPrevista, setDataPrevista] = useState(dataSugerida())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (tarefaConcluida) {
      setDescricao('')
      setDataPrevista(dataSugerida())
      setErro(null)
    }
  }, [tarefaConcluida])

  async function criarProxima(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!user || !tarefaConcluida) return
    if (!descricao.trim()) {
      setErro('Informe a descrição da próxima tarefa.')
      return
    }

    setSalvando(true)

    const { data, error } = await supabase
      .from('tarefas')
      .insert({
        oportunidade_id: tarefaConcluida.oportunidade_id,
        pedido_id: tarefaConcluida.pedido_id,
        empresa_id: tarefaConcluida.empresa_id,
        descricao: descricao.trim(),
        responsavel: tarefaConcluida.responsavel,
        data_prevista: dataPrevista || null,
        // Copia os dados de contato da tarefa original (fase 0022/0028) —
        // sem isso, uma tarefa solta (sem oportunidade_id/pedido_id) perdia
        // toda identificação de qual cliente/lead a próxima tarefa era sobre.
        cliente_nome: tarefaConcluida.cliente_nome,
        cliente_telefone: tarefaConcluida.cliente_telefone,
        cliente_cnpj: tarefaConcluida.cliente_cnpj,
        contato_nome: tarefaConcluida.contato_nome,
        contato_cargo: tarefaConcluida.contato_cargo,
        contato_email: tarefaConcluida.contato_email,
        contato_telefone: tarefaConcluida.contato_telefone,
        whatsapp_empresa: tarefaConcluida.whatsapp_empresa,
        whatsapp_comprador: tarefaConcluida.whatsapp_comprador,
        necessidade_cliente: tarefaConcluida.necessidade_cliente,
        criado_por: user.id,
      })
      .select()
      .single()

    if (error || !data) {
      setSalvando(false)
      setErro('Não foi possível criar a próxima tarefa. Tente novamente.')
      return
    }

    // Só agora, com a próxima tarefa garantidamente criada, marca a
    // original como Realizada — nunca antes (ver comentário no topo do
    // arquivo). Se isso falhar, a tarefa nova já existe e fica de pé; só
    // avisa que a original não fechou, sem desfazer o que já deu certo.
    const { error: erroOriginal } = await onConcluirTarefaOriginal(tarefaConcluida)

    setSalvando(false)

    onCriada(data)
    if (data.oportunidade_id) sincronizarTarefaComOmie(data.id)

    if (erroOriginal) {
      setErro('Próxima tarefa criada, mas não foi possível concluir a tarefa atual. Tente novamente.')
      return
    }

    onClose()
  }

  return (
    <Modal
      open={tarefaConcluida !== null}
      onClose={onClose}
      title="Criar próxima tarefa?"
      widthClassName="max-w-sm"
    >
      <form onSubmit={criarProxima} className="flex flex-col gap-4">
        <p className="text-xs text-muted">
          Opcional — só se fizer sentido dar sequência a este contato/oportunidade. Cancelar aqui
          não altera a tarefa atual: ela continua como estava.
        </p>

        <div>
          <label className="block text-sm font-medium text-primary/80">Descrição</label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
            placeholder="Ex: Retornar ligação"
            disabled={salvando}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-primary/80">Data prevista</label>
          <input
            type="date"
            value={dataPrevista}
            onChange={(e) => setDataPrevista(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
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
            onClick={onClose}
            disabled={salvando}
            className="rounded-md border border-white/15 px-4 py-2 text-sm text-primary/80 hover:bg-white/5"
          >
            Não, obrigado
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
          >
            {salvando ? 'Criando…' : 'Criar tarefa'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
