'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']

// Ao concluir uma tarefa, em vez de só marcar "Realizada" sem rastro,
// registra explicitamente o que aconteceu — fecha o loop entre tarefa
// (tentativa de contato) e o resultado real dela. Usado tanto no kanban
// /tarefas (TarefaCard) quanto na aba Tarefas embutida em oportunidade/pedido
// (TarefasTab), via o hook compartilhado useConclusaoTarefa.
export function ConcluirTarefaModal({
  tarefa,
  onClose,
  onVirouOportunidade,
  onAgendarNovoContato,
  onSemInteresse,
  salvando,
}: {
  tarefa: Tarefa | null
  onClose: () => void
  onVirouOportunidade: (tarefa: Tarefa) => void
  onAgendarNovoContato: (tarefa: Tarefa) => void
  onSemInteresse: (tarefa: Tarefa, motivo: string | null) => void
  salvando?: boolean
}) {
  const [modoSemInteresse, setModoSemInteresse] = useState(false)
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (tarefa) {
      setModoSemInteresse(false)
      setMotivo('')
    }
  }, [tarefa])

  if (!tarefa) return null

  const jaTemOportunidade = tarefa.oportunidade_id !== null

  return (
    <Modal open onClose={onClose} title="Concluir tarefa" widthClassName="max-w-md">
      <p className="mb-4 text-sm text-muted">{tarefa.descricao}</p>

      {!modoSemInteresse ? (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={salvando}
            onClick={() => onVirouOportunidade(tarefa)}
            className="flex flex-col items-start gap-0.5 rounded-md border border-accent-success/40 bg-accent-success/10 px-4 py-3 text-left transition-colors hover:bg-accent-success/20 disabled:opacity-50"
          >
            <span className="text-sm font-medium text-accent-success">Virou oportunidade</span>
            <span className="text-xs text-muted">
              {jaTemOportunidade
                ? 'Abre a oportunidade já vinculada a esta tarefa.'
                : 'Cria uma nova oportunidade com os dados de contato desta tarefa.'}
            </span>
          </button>

          <button
            type="button"
            disabled={salvando}
            onClick={() => onAgendarNovoContato(tarefa)}
            className="flex flex-col items-start gap-0.5 rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-3 text-left transition-colors hover:bg-accent-compras/20 disabled:opacity-50"
          >
            <span className="text-sm font-medium text-accent-compras">Agendar novo contato</span>
            <span className="text-xs text-muted">Cria a próxima tarefa de acompanhamento.</span>
          </button>

          <button
            type="button"
            disabled={salvando}
            onClick={() => setModoSemInteresse(true)}
            className="flex flex-col items-start gap-0.5 rounded-md border border-white/15 px-4 py-3 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            <span className="text-sm font-medium text-primary/80">Sem interesse</span>
            <span className="text-xs text-muted">Encerra a tarefa, com motivo opcional.</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium text-primary/80">
              Motivo (opcional)
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="Ex: Já compra de outro fornecedor fixo"
              disabled={salvando}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModoSemInteresse(false)}
              disabled={salvando}
              className="rounded-md border border-white/15 px-4 py-2 text-sm text-primary/80 hover:bg-white/5"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => onSemInteresse(tarefa, motivo.trim() || null)}
              disabled={salvando}
              className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {!modoSemInteresse && (
        <div className="mt-4 flex justify-end border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="rounded-md border border-white/15 px-4 py-2 text-sm text-primary/80 hover:bg-white/5"
          >
            Cancelar
          </button>
        </div>
      )}
    </Modal>
  )
}
