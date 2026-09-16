'use client'

import { useState } from 'react'
import type { createClient } from '@/lib/supabase/client'
import { sincronizarTarefaComOmie } from '@/lib/tarefas/sincronizar'
import type { NovaOportunidadePrefill } from '@/components/oportunidades/NovaOportunidadeModal'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']
type Oportunidade = Database['public']['Tables']['oportunidades']['Row']
type SupabaseClient = ReturnType<typeof createClient>

// Lógica compartilhada do fluxo de conclusão de tarefa com 3 opções (virou
// oportunidade / agendar novo contato / sem interesse) — usada tanto pelo
// kanban /tarefas (TarefasBoard) quanto pela aba Tarefas embutida em
// oportunidade/pedido (TarefasTab), pra não duplicar os 3 branches nos dois
// lugares. `onAbrirOportunidade` é opcional: só faz sentido em contextos que
// conseguem navegar/abrir o modal de oportunidade (ver comentários nos
// pontos de uso).
export function useConclusaoTarefa({
  supabase,
  onTarefaAtualizada,
  onAbrirOportunidade,
}: {
  supabase: SupabaseClient
  onTarefaAtualizada: (tarefa: Tarefa) => void
  onAbrirOportunidade?: (oportunidadeId: string) => void
}) {
  const [tarefaConcluindo, setTarefaConcluindo] = useState<Tarefa | null>(null)
  const [tarefaEncadeando, setTarefaEncadeando] = useState<Tarefa | null>(null)
  const [pendenteNovaOportunidade, setPendenteNovaOportunidade] = useState<{
    tarefaId: string
    prefill: NovaOportunidadePrefill
  } | null>(null)
  const [salvando, setSalvando] = useState(false)

  function abrirConcluir(tarefa: Tarefa) {
    setTarefaConcluindo(tarefa)
  }

  async function marcarRealizada(tarefa: Tarefa, extra?: Partial<Tarefa>) {
    const { data, error } = await supabase
      .from('tarefas')
      .update({ situacao: 'Realizada', concluida: true, ...extra })
      .eq('id', tarefa.id)
      .select()
      .single()

    if (!error && data) {
      onTarefaAtualizada(data)
      if (data.oportunidade_id) sincronizarTarefaComOmie(data.id)
    }

    return { data, error }
  }

  async function confirmarVirouOportunidade(tarefa: Tarefa) {
    if (tarefa.oportunidade_id) {
      setSalvando(true)
      await marcarRealizada(tarefa)
      setSalvando(false)
      setTarefaConcluindo(null)
      onAbrirOportunidade?.(tarefa.oportunidade_id)
      return
    }

    // Sem oportunidade vinculada ainda: só marca a tarefa como Realizada
    // quando a oportunidade nova for de fato criada (ver
    // aoOportunidadeCriada) — cancelar o formulário não deve completar a
    // tarefa como se algo tivesse sido resolvido.
    setPendenteNovaOportunidade({
      tarefaId: tarefa.id,
      prefill: {
        clienteNome: tarefa.cliente_nome ?? undefined,
        clienteCnpj: tarefa.cliente_cnpj ?? undefined,
        clienteTelefone: tarefa.cliente_telefone ?? undefined,
        contatoNome: tarefa.contato_nome ?? undefined,
        contatoCargo: tarefa.contato_cargo ?? undefined,
        contatoEmail: tarefa.contato_email ?? undefined,
      },
    })
    setTarefaConcluindo(null)
  }

  async function confirmarAgendar(tarefa: Tarefa) {
    setSalvando(true)
    const { data } = await marcarRealizada(tarefa)
    setSalvando(false)
    setTarefaConcluindo(null)
    if (data) setTarefaEncadeando(data)
  }

  async function confirmarSemInteresse(tarefa: Tarefa, motivo: string | null) {
    setSalvando(true)
    await marcarRealizada(tarefa, { motivo_conclusao: motivo })
    setSalvando(false)
    setTarefaConcluindo(null)
  }

  async function aoOportunidadeCriada(oportunidade: Oportunidade) {
    const pendente = pendenteNovaOportunidade
    setPendenteNovaOportunidade(null)
    if (!pendente) return

    const { data, error } = await supabase
      .from('tarefas')
      .update({ situacao: 'Realizada', concluida: true, oportunidade_id: oportunidade.id })
      .eq('id', pendente.tarefaId)
      .select()
      .single()

    if (!error && data) {
      onTarefaAtualizada(data)
      sincronizarTarefaComOmie(data.id)
    }

    onAbrirOportunidade?.(oportunidade.id)
  }

  return {
    tarefaConcluindo,
    tarefaEncadeando,
    novaOportunidadeAberta: pendenteNovaOportunidade !== null,
    prefillNovaOportunidade: pendenteNovaOportunidade?.prefill,
    salvando,
    abrirConcluir,
    fecharConcluir: () => setTarefaConcluindo(null),
    fecharEncadear: () => setTarefaEncadeando(null),
    fecharNovaOportunidade: () => setPendenteNovaOportunidade(null),
    confirmarVirouOportunidade,
    confirmarAgendar,
    confirmarSemInteresse,
    aoOportunidadeCriada,
  }
}
