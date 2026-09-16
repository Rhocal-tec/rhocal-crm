'use client'

import { useState } from 'react'
import type { createClient } from '@/lib/supabase/client'
import { sincronizarTarefaComOmie } from '@/lib/tarefas/sincronizar'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']
type SupabaseClient = ReturnType<typeof createClient>

// Lógica compartilhada do fluxo de conclusão de tarefa com 3 opções (virou
// oportunidade / agendar novo contato / sem interesse) — usada tanto pelo
// kanban único /tarefas (FunilBoard) quanto pela aba Tarefas embutida em
// oportunidade/pedido (TarefasTab), pra não duplicar os 3 branches nos dois
// lugares. `onAbrirOportunidade` é opcional: só faz sentido em contextos que
// conseguem abrir o modal de detalhe da oportunidade (ver comentários nos
// pontos de uso).
export function useConclusaoTarefa({
  supabase,
  userId,
  empresaId,
  onTarefaAtualizada,
  onAbrirOportunidade,
  onOportunidadeCriada,
}: {
  supabase: SupabaseClient
  // Necessários só pro branch "virou oportunidade" sem oportunidade_id ainda
  // (cria a oportunidade direto, sem formulário) — criado_por/empresa_id são
  // colunas not null em `oportunidades`.
  userId: string | null | undefined
  empresaId: string | null | undefined
  onTarefaAtualizada: (tarefa: Tarefa) => void
  onAbrirOportunidade?: (oportunidadeId: string) => void
  // Disparado depois que a oportunidade nasce direto (sem formulário) —
  // usado pelo chamador pra mostrar o toast "Oportunidade criada com sucesso".
  onOportunidadeCriada?: () => void
}) {
  const [tarefaConcluindo, setTarefaConcluindo] = useState<Tarefa | null>(null)
  const [tarefaEncadeando, setTarefaEncadeando] = useState<Tarefa | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function abrirConcluir(tarefa: Tarefa) {
    setErro(null)
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

    if (!userId || !empresaId) {
      setErro('Não foi possível identificar o usuário/empresa ativa. Recarregue a página.')
      return
    }

    setErro(null)
    setSalvando(true)

    // Dados de contato: usa os da própria tarefa; se ela pertence a um
    // pedido (upsell — tarefa de pedido nunca tem cliente_nome preenchido,
    // já que TarefasTab não coleta isso) e não tem nome preenchido, busca no
    // pedido — mesmo dado que o comercial já digitaria manualmente.
    let clienteNome = tarefa.cliente_nome
    let clienteTelefone = tarefa.cliente_telefone
    let clienteCnpj = tarefa.cliente_cnpj
    let clienteContato: string | null = null

    if (!clienteNome && tarefa.pedido_id) {
      const { data: pedido } = await supabase
        .from('pedidos')
        .select('cliente_nome, cliente_telefone, cliente_cnpj, cliente_contato')
        .eq('id', tarefa.pedido_id)
        .single()
      if (pedido) {
        clienteNome = pedido.cliente_nome
        clienteTelefone = clienteTelefone ?? pedido.cliente_telefone
        clienteCnpj = clienteCnpj ?? pedido.cliente_cnpj
        clienteContato = pedido.cliente_contato
      }
    }

    if (!clienteNome) {
      setSalvando(false)
      setErro('Não foi possível criar a oportunidade: a tarefa não tem o nome do cliente preenchido.')
      return
    }

    const { data: novaOportunidade, error: erroOportunidade } = await supabase
      .from('oportunidades')
      .insert({
        cliente_nome: clienteNome,
        cliente_telefone: clienteTelefone,
        cliente_cnpj: clienteCnpj,
        cliente_contato: clienteContato,
        contato_nome: tarefa.contato_nome,
        contato_cargo: tarefa.contato_cargo,
        contato_email: tarefa.contato_email,
        criado_por: userId,
        empresa_id: empresaId,
      })
      .select()
      .single()

    if (erroOportunidade || !novaOportunidade) {
      setSalvando(false)
      setErro('Não foi possível criar a oportunidade. Tente novamente.')
      return
    }

    await marcarRealizada(tarefa, { oportunidade_id: novaOportunidade.id })

    setSalvando(false)
    setTarefaConcluindo(null)
    onOportunidadeCriada?.()
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

  return {
    tarefaConcluindo,
    tarefaEncadeando,
    salvando,
    erro,
    abrirConcluir,
    fecharConcluir: () => setTarefaConcluindo(null),
    fecharEncadear: () => setTarefaEncadeando(null),
    confirmarVirouOportunidade,
    confirmarAgendar,
    confirmarSemInteresse,
  }
}
