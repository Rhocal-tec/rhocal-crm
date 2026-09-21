'use client'

import { useState } from 'react'
import type { createClient } from '@/lib/supabase/client'
import { sincronizarTarefaComOmie } from '@/lib/tarefas/sincronizar'
import { DADOS_CONTATO_VAZIO, type DadosContato } from '@/components/tarefas/DadosContatoFields'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']
type SupabaseClient = ReturnType<typeof createClient>

// Dados do formulário exibido antes de criar a oportunidade de fato (ver
// ConcluirTarefaModal) — os mesmos 9 campos de contato reaproveitados de
// DadosContatoFields, mais a necessidade identificada do cliente (o que ele
// quer/precisa) e o relato livre da conversa que já rolou — dois campos
// distintos de propósito.
export interface DadosNovaOportunidade extends DadosContato {
  necessidadeCliente: string
  historicoConversa: string
}

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

  // Monta o preenchimento inicial do formulário de "Criar Oportunidade"
  // (ver ConcluirTarefaModal) a partir dos dados já existentes na tarefa; se
  // ela pertence a um pedido (upsell — tarefa de pedido nunca tem
  // cliente_nome preenchido, já que TarefasTab não coleta isso) e não tem
  // nome preenchido, busca no pedido — mesmo dado que o comercial já
  // digitaria manualmente. O funcionário ainda pode editar tudo antes de
  // confirmar.
  async function prepararDadosOportunidade(tarefa: Tarefa): Promise<DadosNovaOportunidade> {
    let clienteNome = tarefa.cliente_nome ?? ''
    let clienteTelefone = tarefa.cliente_telefone ?? ''
    let clienteCnpj = tarefa.cliente_cnpj ?? ''

    if (!clienteNome && tarefa.pedido_id) {
      const { data: pedido } = await supabase
        .from('pedidos')
        .select('cliente_nome, cliente_telefone, cliente_cnpj')
        .eq('id', tarefa.pedido_id)
        .single()
      if (pedido) {
        clienteNome = pedido.cliente_nome ?? ''
        clienteTelefone = clienteTelefone || (pedido.cliente_telefone ?? '')
        clienteCnpj = clienteCnpj || (pedido.cliente_cnpj ?? '')
      }
    }

    return {
      ...DADOS_CONTATO_VAZIO,
      clienteNome,
      clienteTelefone,
      clienteCnpj,
      contatoNome: tarefa.contato_nome ?? '',
      contatoCargo: tarefa.contato_cargo ?? '',
      contatoEmail: tarefa.contato_email ?? '',
      contatoTelefone: tarefa.contato_telefone ?? '',
      whatsappEmpresa: tarefa.whatsapp_empresa ?? '',
      whatsappComprador: tarefa.whatsapp_comprador ?? '',
      necessidadeCliente: tarefa.necessidade_cliente ?? '',
      historicoConversa: tarefa.historico_conversa ?? '',
    }
  }

  async function confirmarVirouOportunidade(tarefa: Tarefa, dados?: DadosNovaOportunidade) {
    if (tarefa.oportunidade_id) {
      setErro(null)
      setSalvando(true)
      const { error } = await marcarRealizada(tarefa)
      setSalvando(false)

      if (error) {
        setErro('Não foi possível concluir a tarefa. Tente novamente.')
        return
      }

      setTarefaConcluindo(null)
      onAbrirOportunidade?.(tarefa.oportunidade_id)
      return
    }

    if (!userId || !empresaId) {
      setErro('Não foi possível identificar o usuário/empresa ativa. Recarregue a página.')
      return
    }

    if (!dados) {
      setErro('Preencha os dados da oportunidade antes de confirmar.')
      return
    }

    const clienteNome = dados.clienteNome.trim()
    if (!clienteNome) {
      setErro('Informe o nome do cliente para criar a oportunidade.')
      return
    }

    setErro(null)
    setSalvando(true)

    const clienteTelefone = dados.clienteTelefone.trim() || null
    const clienteCnpj = dados.clienteCnpj.trim() || null
    const contatoNome = dados.contatoNome.trim() || null
    const contatoCargo = dados.contatoCargo.trim() || null
    const contatoEmail = dados.contatoEmail.trim() || null
    const contatoTelefone = dados.contatoTelefone.trim() || null
    const whatsappEmpresa = dados.whatsappEmpresa.trim() || null
    const whatsappComprador = dados.whatsappComprador.trim() || null
    const necessidadeCliente = dados.necessidadeCliente.trim() || null
    const historicoConversa = dados.historicoConversa.trim() || null

    const { data: novaOportunidade, error: erroOportunidade } = await supabase
      .from('oportunidades')
      .insert({
        cliente_nome: clienteNome,
        cliente_telefone: clienteTelefone,
        cliente_cnpj: clienteCnpj,
        contato_nome: contatoNome,
        contato_cargo: contatoCargo,
        contato_email: contatoEmail,
        contato_telefone: contatoTelefone,
        whatsapp_empresa: whatsappEmpresa,
        whatsapp_comprador: whatsappComprador,
        necessidade_cliente: necessidadeCliente,
        historico_conversa: historicoConversa,
        origem_tarefa_id: tarefa.id,
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

    // Grava os mesmos dados (possivelmente corrigidos/completados no
    // formulário) de volta na tarefa original, além de marcar Realizada e
    // vincular a oportunidade recém-criada — assim a tarefa fica com o
    // registro completo também, não só a oportunidade.
    const { error: erroVinculo } = await marcarRealizada(tarefa, {
      oportunidade_id: novaOportunidade.id,
      cliente_nome: clienteNome,
      cliente_telefone: clienteTelefone,
      cliente_cnpj: clienteCnpj,
      contato_nome: contatoNome,
      contato_cargo: contatoCargo,
      contato_email: contatoEmail,
      contato_telefone: contatoTelefone,
      whatsapp_empresa: whatsappEmpresa,
      whatsapp_comprador: whatsappComprador,
      necessidade_cliente: necessidadeCliente,
      historico_conversa: historicoConversa,
    })

    setSalvando(false)

    if (erroVinculo) {
      // A oportunidade já foi criada nesse ponto — só o vínculo/conclusão da
      // tarefa falhou. Mantém o modal aberto (não fecha como se tivesse dado
      // tudo certo) pra não perder o vínculo em silêncio. Atualiza a tarefa
      // em edição com o oportunidade_id que já existe, pra um novo clique em
      // "Criar Oportunidade" cair no branch de tarefa-já-vinculada (só
      // retenta marcar Realizada) em vez de criar uma segunda oportunidade
      // duplicada.
      setTarefaConcluindo({ ...tarefa, oportunidade_id: novaOportunidade.id })
      setErro('Oportunidade criada, mas não foi possível concluir a tarefa. Tente novamente.')
      return
    }

    setTarefaConcluindo(null)
    onOportunidadeCriada?.()
  }

  // "Agendar novo contato" só troca qual modal está aberto — a tarefa
  // original NUNCA é marcada Realizada aqui. Ela só fecha depois que a
  // próxima tarefa é de fato criada em EncadearTarefaModal (via
  // `marcarRealizada`, exposto abaixo), pra nunca deixar a original presa
  // como "concluída" sem nenhuma tarefa nova em seu lugar caso o usuário
  // cancele o formulário de agendamento ou o insert falhe.
  function confirmarAgendar(tarefa: Tarefa) {
    setTarefaConcluindo(null)
    setTarefaEncadeando(tarefa)
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
    prepararDadosOportunidade,
    confirmarVirouOportunidade,
    confirmarAgendar,
    confirmarSemInteresse,
    // Exposto pra EncadearTarefaModal chamar depois (e só depois) de criar a
    // próxima tarefa com sucesso — ver comentário em confirmarAgendar.
    marcarRealizada,
  }
}
