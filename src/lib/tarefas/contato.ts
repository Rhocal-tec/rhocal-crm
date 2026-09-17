// Monta as linhas de exibição dos campos de contato de uma tarefa "solta"
// (migration 0022) — cliente_nome/cliente_telefone/cliente_cnpj/contato_nome/
// contato_cargo/contato_email. Tarefa vinculada a oportunidade/pedido tem
// esses campos vazios (o contato já vive lá), então as duas linhas saem
// `null` naturalmente nesse caso, sem precisar checar oportunidade_id/
// pedido_id aqui. Mesmo padrão de "combina os campos presentes, omite os
// vazios sem deixar espaço estranho" já usado em outros lugares do projeto
// (ex: Tam./Nº/Cor dos itens de pedido).
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']

export interface ContatoTarefa {
  cliente: string | null
  detalhes: string | null
}

export function contatoDaTarefa(
  tarefa: Pick<
    Tarefa,
    'cliente_nome' | 'cliente_telefone' | 'cliente_cnpj' | 'contato_nome' | 'contato_cargo' | 'contato_email'
  >,
): ContatoTarefa {
  const cliente = tarefa.cliente_nome
    ? [tarefa.cliente_nome, tarefa.cliente_cnpj ? `CNPJ ${tarefa.cliente_cnpj}` : null]
        .filter(Boolean)
        .join(' · ')
    : null

  const nomeCargo = [tarefa.contato_nome, tarefa.contato_cargo].filter(Boolean).join(' — ')
  const detalhes =
    [nomeCargo || null, tarefa.cliente_telefone, tarefa.contato_email].filter(Boolean).join(' · ') || null

  return { cliente, detalhes }
}
