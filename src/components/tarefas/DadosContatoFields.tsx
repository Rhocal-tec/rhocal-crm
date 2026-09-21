'use client'

import { formatarTelefoneInput } from '@/lib/kanban/formatacao'

// Bloco de campos de contato reaproveitado em TarefaModal.tsx (tarefa
// "solta", sem oportunidade/pedido pai) e no formulário de "Criar
// Oportunidade" dentro de ConcluirTarefaModal.tsx — mesmos 9 campos nos dois
// lugares, controlado por um único objeto de estado (value/onChange), pra não
// duplicar os inputs quando um terceiro lugar precisar do mesmo bloco no
// futuro.
export interface DadosContato {
  clienteNome: string
  clienteTelefone: string
  clienteCnpj: string
  contatoNome: string
  contatoCargo: string
  contatoEmail: string
  contatoTelefone: string
  whatsappEmpresa: string
  whatsappComprador: string
}

export const DADOS_CONTATO_VAZIO: DadosContato = {
  clienteNome: '',
  clienteTelefone: '',
  clienteCnpj: '',
  contatoNome: '',
  contatoCargo: '',
  contatoEmail: '',
  contatoTelefone: '',
  whatsappEmpresa: '',
  whatsappComprador: '',
}

export function DadosContatoFields({
  value,
  onChange,
  disabled,
  titulo = 'Dados de contato (opcional)',
}: {
  value: DadosContato
  onChange: (patch: Partial<DadosContato>) => void
  disabled?: boolean
  titulo?: string
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-white/10 bg-surface-alt p-3">
      <p className="text-xs font-medium text-primary/80">{titulo}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted">Nome do cliente</label>
          <input
            type="text"
            value={value.clienteNome}
            onChange={(e) => onChange({ clienteNome: e.target.value })}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            placeholder="Ex: Cliente Teste LTDA"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="block text-xs text-muted">Telefone da empresa</label>
          <input
            type="tel"
            value={value.clienteTelefone}
            onChange={(e) => onChange({ clienteTelefone: formatarTelefoneInput(e.target.value) })}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            placeholder="(11) 91234-5678"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted">CNPJ</label>
          <input
            type="text"
            inputMode="numeric"
            value={value.clienteCnpj}
            onChange={(e) => onChange({ clienteCnpj: e.target.value })}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 font-mono text-sm"
            placeholder="00.000.000/0000-00"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="block text-xs text-muted">Nome do contato</label>
          <input
            type="text"
            value={value.contatoNome}
            onChange={(e) => onChange({ contatoNome: e.target.value })}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            placeholder="Ex: Maria Compras"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted">Cargo do contato</label>
          <input
            type="text"
            value={value.contatoCargo}
            onChange={(e) => onChange({ contatoCargo: e.target.value })}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            placeholder="Ex: Comprador"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="block text-xs text-muted">Telefone do contato</label>
          <input
            type="tel"
            value={value.contatoTelefone}
            onChange={(e) => onChange({ contatoTelefone: formatarTelefoneInput(e.target.value) })}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            placeholder="(11) 91234-5678"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted">E-mail do contato</label>
          <input
            type="email"
            value={value.contatoEmail}
            onChange={(e) => onChange({ contatoEmail: e.target.value })}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            placeholder="nome@empresa.com"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="block text-xs text-muted">WhatsApp da empresa</label>
          <input
            type="tel"
            value={value.whatsappEmpresa}
            onChange={(e) => onChange({ whatsappEmpresa: formatarTelefoneInput(e.target.value) })}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            placeholder="(11) 91234-5678"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted">WhatsApp do comprador</label>
          <input
            type="tel"
            value={value.whatsappComprador}
            onChange={(e) => onChange({ whatsappComprador: formatarTelefoneInput(e.target.value) })}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            placeholder="(11) 91234-5678"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  )
}
