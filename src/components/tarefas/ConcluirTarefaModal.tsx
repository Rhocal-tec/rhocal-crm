'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { contatoDaTarefa } from '@/lib/tarefas/contato'
import { DadosContatoFields, DADOS_CONTATO_VAZIO, type DadosContato } from '@/components/tarefas/DadosContatoFields'
import { TIPO_INTERACAO_OPCOES } from '@/lib/interacoes/opcoes'
import type { CanalContato, DadosNovaOportunidade } from '@/lib/tarefas/useConclusaoTarefa'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']

type View = 'opcoes' | 'semInteresse' | 'oportunidade' | 'registrarContato'

// Pré-seleciona o canal a partir do tipo planejado da tarefa, quando ele é
// um dos canais da lista (tipos vindos do Omie, como códigos numéricos, ou
// "Outro" ficam sem pré-seleção).
function canalInicial(tipo: string | null): CanalContato | null {
  return (TIPO_INTERACAO_OPCOES as readonly string[]).includes(tipo ?? '') ? (tipo as CanalContato) : null
}

// Ao concluir uma tarefa, em vez de só marcar "Realizada" sem rastro,
// registra explicitamente o que aconteceu — fecha o loop entre tarefa
// (tentativa de contato) e o resultado real dela. Usado tanto no kanban
// /tarefas (TarefaCard) quanto na aba Tarefas embutida em oportunidade/pedido
// (TarefasTab), via o hook compartilhado useConclusaoTarefa.
//
// "Criar Oportunidade" abre um formulário (view 'oportunidade') em vez de
// criar direto: o funcionário confirma/completa os dados de contato e relata
// o que foi conversado com o cliente antes da oportunidade nascer de fato —
// só quando a tarefa ainda não tem oportunidade vinculada (jaTemOportunidade
// continua sendo um atalho direto, sem formulário, já que nesse caso não há
// nada novo a criar).
//
// "Como foi o contato?" (canal: Ligação/WhatsApp/E-mail/Reunião/Visita) fica
// no topo e é obrigatório pras 4 conclusões — cada uma grava uma linha em
// `interacoes` com esse canal (ver useConclusaoTarefa).
export function ConcluirTarefaModal({
  tarefa,
  onClose,
  onPrepararOportunidade,
  onVirouOportunidade,
  onAgendarNovoContato,
  onSemInteresse,
  onSoRegistrarContato,
  salvando,
  erro,
}: {
  tarefa: Tarefa | null
  onClose: () => void
  onPrepararOportunidade: (tarefa: Tarefa) => Promise<DadosNovaOportunidade>
  onVirouOportunidade: (tarefa: Tarefa, canal: CanalContato, dados?: DadosNovaOportunidade) => void
  onAgendarNovoContato: (tarefa: Tarefa, canal: CanalContato) => void
  onSemInteresse: (tarefa: Tarefa, canal: CanalContato, motivo: string | null) => void
  onSoRegistrarContato: (tarefa: Tarefa, canal: CanalContato, observacao: string | null) => void
  salvando?: boolean
  erro?: string | null
}) {
  const [view, setView] = useState<View>('opcoes')
  const [motivo, setMotivo] = useState('')
  const [carregandoFormulario, setCarregandoFormulario] = useState(false)
  const [dadosOportunidade, setDadosOportunidade] = useState<DadosContato>(DADOS_CONTATO_VAZIO)
  const [necessidadeCliente, setNecessidadeCliente] = useState('')
  const [historicoConversa, setHistoricoConversa] = useState('')
  const [canal, setCanal] = useState<CanalContato | null>(null)
  const [observacaoRegistro, setObservacaoRegistro] = useState('')

  // Reseta só quando a tarefa em edição muda de fato (id diferente) — não a
  // cada patch de campo nela (ex: quando o hook atualiza tarefaConcluindo com
  // o oportunidade_id recém-criado após uma falha ao marcar Realizada), pra
  // não perder o que já foi digitado no formulário numa retentativa.
  useEffect(() => {
    if (tarefa) {
      setView('opcoes')
      setMotivo('')
      setDadosOportunidade(DADOS_CONTATO_VAZIO)
      setNecessidadeCliente('')
      setHistoricoConversa('')
      setCanal(canalInicial(tarefa.tipo))
      setObservacaoRegistro('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefa?.id])

  if (!tarefa) return null

  const jaTemOportunidade = tarefa.oportunidade_id !== null
  const contato = contatoDaTarefa(tarefa)

  const semCanal = canal === null

  async function abrirFormularioOportunidade() {
    if (!tarefa || !canal) return
    if (jaTemOportunidade) {
      onVirouOportunidade(tarefa, canal)
      return
    }

    setCarregandoFormulario(true)
    const dados = await onPrepararOportunidade(tarefa)
    setCarregandoFormulario(false)
    setDadosOportunidade(dados)
    setNecessidadeCliente(dados.necessidadeCliente)
    setHistoricoConversa(dados.historicoConversa)
    setView('oportunidade')
  }

  function confirmarCriarOportunidade() {
    if (!tarefa || !canal) return
    onVirouOportunidade(tarefa, canal, { ...dadosOportunidade, necessidadeCliente, historicoConversa })
  }

  const podeConfirmarOportunidade =
    dadosOportunidade.clienteNome.trim() !== '' && historicoConversa.trim() !== ''

  return (
    <Modal open onClose={onClose} title="Concluir tarefa" widthClassName="max-w-md">
      <p className="mb-2 text-sm text-muted">{tarefa.descricao}</p>

      {(contato.cliente || contato.detalhes) && (
        <div className="mb-4 rounded-md border border-white/10 bg-surface-alt px-3 py-2">
          {contato.cliente && <p className="text-sm font-medium text-primary">{contato.cliente}</p>}
          {contato.detalhes && <p className="mt-0.5 text-xs text-muted">{contato.detalhes}</p>}
        </div>
      )}

      {erro && (
        <div className="mb-4 rounded-md border border-accent-danger/30 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erro}
        </div>
      )}

      <div className="mb-4">
        <p className="text-xs text-muted">Como foi o contato?</p>
        <div role="radiogroup" aria-label="Como foi o contato?" className="mt-1.5 flex flex-wrap gap-1.5">
          {TIPO_INTERACAO_OPCOES.map((opcao) => (
            <button
              key={opcao}
              type="button"
              role="radio"
              aria-checked={canal === opcao}
              disabled={salvando}
              onClick={() => setCanal(opcao)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                canal === opcao
                  ? 'bg-accent-primary text-white'
                  : 'bg-white/5 text-muted hover:bg-white/10 hover:text-primary'
              }`}
            >
              {opcao}
            </button>
          ))}
        </div>
        {semCanal && <p className="mt-1.5 text-[11px] text-muted/80">Selecione o canal para concluir.</p>}
      </div>

      {view === 'opcoes' && (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={salvando || carregandoFormulario || semCanal}
            onClick={abrirFormularioOportunidade}
            className="flex flex-col items-start gap-0.5 rounded-md border border-accent-success/40 bg-accent-success/10 px-4 py-3 text-left transition-colors hover:bg-accent-success/20 disabled:opacity-50"
          >
            <span className="text-sm font-medium text-accent-success">Criar Oportunidade</span>
            <span className="text-xs text-muted">
              {jaTemOportunidade
                ? 'Abre a oportunidade já vinculada a esta tarefa.'
                : carregandoFormulario
                  ? 'Carregando dados…'
                  : 'Informa o que foi conversado com o cliente antes de criar a oportunidade.'}
            </span>
          </button>

          <button
            type="button"
            disabled={salvando || carregandoFormulario || semCanal}
            onClick={() => canal && onAgendarNovoContato(tarefa, canal)}
            className="flex flex-col items-start gap-0.5 rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-3 text-left transition-colors hover:bg-accent-compras/20 disabled:opacity-50"
          >
            <span className="text-sm font-medium text-accent-compras">Agendar novo contato</span>
            <span className="text-xs text-muted">Cria a próxima tarefa de acompanhamento.</span>
          </button>

          <button
            type="button"
            disabled={salvando || carregandoFormulario || semCanal}
            onClick={() => setView('registrarContato')}
            className="flex flex-col items-start gap-0.5 rounded-md border border-accent-alert/40 bg-accent-alert/10 px-4 py-3 text-left transition-colors hover:bg-accent-alert/20 disabled:opacity-50"
          >
            <span className="text-sm font-medium text-accent-alert">Só registrar contato</span>
            <span className="text-xs text-muted">
              Ex: enviou um e-mail e ainda não teve retorno. Conclui a tarefa sem criar nada novo.
            </span>
          </button>

          <button
            type="button"
            disabled={salvando || carregandoFormulario || semCanal}
            onClick={() => setView('semInteresse')}
            className="flex flex-col items-start gap-0.5 rounded-md border border-white/15 px-4 py-3 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            <span className="text-sm font-medium text-primary/80">Sem interesse</span>
            <span className="text-xs text-muted">Encerra a tarefa, com motivo opcional.</span>
          </button>
        </div>
      )}

      {view === 'semInteresse' && (
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
              onClick={() => setView('opcoes')}
              disabled={salvando}
              className="rounded-md border border-white/15 px-4 py-2 text-sm text-primary/80 hover:bg-white/5"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => canal && onSemInteresse(tarefa, canal, motivo.trim() || null)}
              disabled={salvando || semCanal}
              className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {view === 'registrarContato' && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium text-primary/80">Observação (opcional)</label>
            <input
              type="text"
              value={observacaoRegistro}
              onChange={(e) => setObservacaoRegistro(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="Ex: Enviado catálogo de luvas por e-mail"
              disabled={salvando}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setView('opcoes')}
              disabled={salvando}
              className="rounded-md border border-white/15 px-4 py-2 text-sm text-primary/80 hover:bg-white/5"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => canal && onSoRegistrarContato(tarefa, canal, observacaoRegistro.trim() || null)}
              disabled={salvando || semCanal}
              className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : 'Registrar e concluir'}
            </button>
          </div>
        </div>
      )}

      {view === 'oportunidade' && (
        <div className="flex flex-col gap-3">
          <DadosContatoFields
            value={dadosOportunidade}
            onChange={(patch) => setDadosOportunidade((atual) => ({ ...atual, ...patch }))}
            disabled={salvando}
            titulo="Dados de contato"
          />

          <div>
            <label className="block text-xs text-muted">O que o cliente deseja/precisa</label>
            <textarea
              value={necessidadeCliente}
              onChange={(e) => setNecessidadeCliente(e.target.value)}
              rows={2}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="Ex: 50 capacetes Classe A, com urgência para entrega até sexta"
              disabled={salvando}
            />
          </div>

          <div>
            <label className="block text-xs text-muted">O que foi conversado com o cliente</label>
            <textarea
              value={historicoConversa}
              onChange={(e) => setHistoricoConversa(e.target.value)}
              rows={4}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="Relate o que foi discutido na ligação/conversa: interesse, necessidades, objeções, próximos passos combinados…"
              disabled={salvando}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setView('opcoes')}
              disabled={salvando}
              className="rounded-md border border-white/15 px-4 py-2 text-sm text-primary/80 hover:bg-white/5"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={confirmarCriarOportunidade}
              disabled={salvando || semCanal || !podeConfirmarOportunidade}
              className="rounded-md bg-accent-success px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
            >
              {salvando ? 'Criando…' : 'Criar Oportunidade'}
            </button>
          </div>
        </div>
      )}

      {view === 'opcoes' && (
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
