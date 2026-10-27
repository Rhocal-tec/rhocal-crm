'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { DESTINOS_REPASSE } from '@/lib/cs/constantes'
import type { SetorTipo } from '@/types/database'

interface PessoaDestino {
  id: string
  nome: string
  setor: SetorTipo
}

// Setor que recebe cada destino do repasse (vira tarefa para alguém desse setor).
const SETOR_DO_DESTINO: Record<string, SetorTipo> = {
  closer: 'comercial',
  vendedora: 'comercial',
  compras: 'compras',
  logistica: 'compras',
  diretoria: 'gestor',
}

// Encaminha o cliente a outra área com o resumo da conversa. Pedido de preço,
// desconto ou condição só pode ir para a closer — a CS nunca negocia preço.
export function RepasseForm({
  open,
  onClose,
  empresaId,
  usuarioId,
  clienteNome,
  clienteCnpj,
  vendedorId,
  garantirContato,
  onCriado,
}: {
  open: boolean
  onClose: () => void
  empresaId: string
  usuarioId: string
  clienteNome: string
  clienteCnpj: string | null
  // Vendedora do cliente (profiles.id), quando conhecida — sugerida no destino "vendedora".
  vendedorId?: string | null
  garantirContato?: () => Promise<string | null>
  onCriado: () => void
}) {
  const [supabase] = useState(() => createClient())
  const [destino, setDestino] = useState('vendedora')
  const [pedidoDePreco, setPedidoDePreco] = useState(false)
  const [resumo, setResumo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pessoas, setPessoas] = useState<PessoaDestino[]>([])
  const [responsavel, setResponsavel] = useState('')

  const destinoFinal = pedidoDePreco ? 'closer' : destino
  const setorDestino = SETOR_DO_DESTINO[destinoFinal]
  const candidatos = useMemo(() => pessoas.filter((p) => p.setor === setorDestino), [pessoas, setorDestino])

  useEffect(() => {
    if (!open) return
    supabase
      .from('profiles')
      .select('id, nome, setor')
      .eq('ativo', true)
      .then(({ data }) => setPessoas((data ?? []) as PessoaDestino[]))
  }, [open, supabase])

  // Sugere a vendedora do cliente; se só houver uma pessoa no setor, já escolhe.
  useEffect(() => {
    if (destinoFinal === 'vendedora' && vendedorId && candidatos.some((c) => c.id === vendedorId)) {
      setResponsavel(vendedorId)
    } else if (candidatos.length === 1) {
      setResponsavel(candidatos[0].id)
    } else {
      setResponsavel((atual) => (candidatos.some((c) => c.id === atual) ? atual : ''))
    }
  }, [destinoFinal, vendedorId, candidatos])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!resumo.trim()) {
      setErro('Escreva o resumo da conversa para quem vai receber.')
      return
    }
    if (!responsavel) {
      setErro('Escolha quem vai receber a tarefa deste repasse.')
      return
    }
    setSalvando(true)
    const contatoId = garantirContato ? await garantirContato() : null
    const { data: repasse, error } = await supabase
      .from('cs_repasses')
      .insert({
        empresa_id: empresaId,
        contato_id: contatoId,
        cliente_nome: clienteNome,
        cliente_cnpj: clienteCnpj,
        destino: destinoFinal,
        destinatario_id: responsavel,
        resumo: resumo.trim(),
        criado_por: usuarioId,
      })
      .select('id')
      .single()
    if (error || !repasse) {
      setSalvando(false)
      setErro(`Não foi possível criar o repasse: ${error?.message ?? 'sem resposta'}`)
      return
    }

    // O repasse vira tarefa para a pessoa do setor responsável.
    const hoje = new Date()
    const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    const { error: erroTarefa } = await supabase.from('tarefas').insert({
      empresa_id: empresaId,
      descricao: `Repasse da CS — ${clienteNome}: ${resumo.trim()}`,
      responsavel,
      data_prevista: dataHoje,
      cliente_nome: clienteNome,
      cliente_cnpj: clienteCnpj,
      importante: true,
      urgente: pedidoDePreco,
      notificar_em: 'nao_notificar',
      criado_por: usuarioId,
    })
    setSalvando(false)
    if (erroTarefa) {
      setErro(`O repasse foi enviado, mas a tarefa não foi criada: ${erroTarefa.message}`)
      onCriado()
      return
    }
    setResumo('')
    setPedidoDePreco(false)
    onCriado()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Repasse — ${clienteNome}`}>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <label className="flex items-start gap-2 text-sm text-primary/90">
          <input
            type="checkbox"
            checked={pedidoDePreco}
            onChange={(e) => setPedidoDePreco(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-accent-primary"
          />
          <span>
            O cliente pediu preço, desconto ou condição
            <span className="block text-xs text-muted">Nesse caso o repasse vai obrigatoriamente para a closer.</span>
          </span>
        </label>
        <div>
          <label className="block text-xs text-muted">Destino</label>
          <select
            value={destinoFinal}
            onChange={(e) => setDestino(e.target.value)}
            disabled={pedidoDePreco}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm disabled:opacity-60"
          >
            {DESTINOS_REPASSE.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted">Quem recebe a tarefa</label>
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          >
            <option value="">Selecione…</option>
            {candidatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          {candidatos.length === 0 && pessoas.length > 0 && (
            <p className="mt-1 text-xs text-amber-300">Nenhum usuário ativo neste setor.</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-muted">Resumo da conversa</label>
          <textarea
            value={resumo}
            onChange={(e) => setResumo(e.target.value)}
            rows={4}
            autoFocus
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          />
        </div>
        {erro && <p className="text-xs text-accent-danger">{erro}</p>}
        <div className="flex justify-end gap-2">
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
            className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {salvando ? 'Enviando…' : 'Enviar repasse e criar tarefa'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
