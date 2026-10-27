'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { AREAS_RESPONSAVEIS, CATEGORIAS_RECLAMACAO } from '@/lib/cs/constantes'

// Abre uma reclamação a partir do atendimento (ou sozinha). O prazo de retorno
// vem de cs_config (padrão 48 h) e o alerta da área sai 12 h antes do fim.
export function ReclamacaoForm({
  open,
  onClose,
  empresaId,
  usuarioId,
  clienteNome,
  clienteCnpj,
  prazoHoras,
  garantirContato,
  onCriada,
}: {
  open: boolean
  onClose: () => void
  empresaId: string
  usuarioId: string
  clienteNome: string
  clienteCnpj: string | null
  prazoHoras: number
  // Devolve o id do contato do atendimento (cria o rascunho se ainda não existe).
  garantirContato?: () => Promise<string | null>
  onCriada: () => void
}) {
  const [supabase] = useState(() => createClient())
  const [categoria, setCategoria] = useState(CATEGORIAS_RECLAMACAO[0])
  const [area, setArea] = useState(AREAS_RESPONSAVEIS[0])
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!descricao.trim()) {
      setErro('Descreva a reclamação.')
      return
    }
    setSalvando(true)
    const contatoId = garantirContato ? await garantirContato() : null
    const agora = new Date()
    const prazo = new Date(agora.getTime() + prazoHoras * 3_600_000)
    const { error } = await supabase.from('cs_reclamacoes').insert({
      empresa_id: empresaId,
      contato_id: contatoId,
      cliente_nome: clienteNome,
      cliente_cnpj: clienteCnpj,
      categoria,
      descricao: descricao.trim(),
      area_responsavel: area,
      aberta_em: agora.toISOString(),
      prazo_em: prazo.toISOString(),
      criado_por: usuarioId,
    })
    if (!error && contatoId) {
      await supabase.from('cs_contatos').update({ status: 'reclamacao_aberta' }).eq('id', contatoId)
    }
    setSalvando(false)
    if (error) {
      setErro(`Não foi possível abrir a reclamação: ${error.message}`)
      return
    }
    setDescricao('')
    onCriada()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Reclamação — ${clienteNome}`}>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          Prazo de retorno ao cliente: {prazoHoras} h. A área responsável é avisada antes do prazo acabar.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted">Categoria</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            >
              {CATEGORIAS_RECLAMACAO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted">Área responsável</label>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            >
              {AREAS_RESPONSAVEIS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted">O que aconteceu</label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
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
            className="rounded-md bg-accent-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Abrir reclamação'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
