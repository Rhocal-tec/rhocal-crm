'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { MoedaInput } from '@/components/ui/MoedaInput'
import { formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { TarefasTab } from '@/components/tarefas/TarefasTab'
import { TarefaModal } from '@/components/tarefas/TarefaModal'
import { HistoricoContatoTab } from '@/components/interacoes/HistoricoContatoTab'
import BotaoLigar from '@/components/mobcall/BotaoLigar'
import HistoricoChamadas from '@/components/mobcall/HistoricoChamadas'
import { ConverterEmOrcamentoSection } from './ConverterEmOrcamentoSection'
import { MarcarOportunidadePerdidaSection } from './MarcarOportunidadePerdidaSection'
import type { Database, SetorTipo } from '@/types/database'

type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

type CampoTexto =
  | 'contato_nome'
  | 'contato_cargo'
  | 'contato_email'
  | 'produto_servico'
  | 'concorrentes'
  | 'cliente_telefone'

type Aba = 'dados' | 'tarefas' | 'historico'

export function OportunidadeDetalheModal({
  oportunidadeId,
  onClose,
  setor,
}: {
  oportunidadeId: string | null
  onClose: () => void
  setor: SetorTipo
}) {
  const [supabase] = useState(() => createClient())
  const [aba, setAba] = useState<Aba>('dados')
  const [oportunidade, setOportunidade] = useState<Oportunidade | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [tarefaModalAberto, setTarefaModalAberto] = useState(false)

  // Fase 38: estado local dos campos editáveis inline (mesmo padrão de
  // input controlado + salvar no blur já usado no modal de Pedido).
  const [previsaoFechamentoInput, setPrevisaoFechamentoInput] = useState('')
  const [produtoServicoInput, setProdutoServicoInput] = useState('')
  const [concorrentesInput, setConcorrentesInput] = useState('')
  const [contatoNomeInput, setContatoNomeInput] = useState('')
  const [contatoCargoInput, setContatoCargoInput] = useState('')
  const [contatoEmailInput, setContatoEmailInput] = useState('')
  const [clienteTelefoneInput, setClienteTelefoneInput] = useState('')
  const [valorEstimadoInput, setValorEstimadoInput] = useState('')

  useEffect(() => {
    if (!oportunidadeId) {
      setOportunidade(null)
      setAba('dados')
      return
    }

    let ativo = true
    setCarregando(true)

    supabase
      .from('oportunidades')
      .select('*')
      .eq('id', oportunidadeId)
      .single()
      .then(({ data }) => {
        if (!ativo) return
        setOportunidade(data ?? null)
        setPrevisaoFechamentoInput(data?.previsao_fechamento ?? '')
        setProdutoServicoInput(data?.produto_servico ?? '')
        setConcorrentesInput(data?.concorrentes ?? '')
        setContatoNomeInput(data?.contato_nome ?? '')
        setContatoCargoInput(data?.contato_cargo ?? '')
        setContatoEmailInput(data?.contato_email ?? '')
        setClienteTelefoneInput(data?.cliente_telefone ?? '')
        setValorEstimadoInput(
          data?.valor_estimado !== undefined && data?.valor_estimado !== null
            ? String(data.valor_estimado)
            : '',
        )
        setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [oportunidadeId, supabase])

  async function salvarCampoTexto(campo: CampoTexto, valor: string) {
    if (!oportunidade) return
    const novoValor = valor.trim() || null
    const atualizacao: Partial<Oportunidade> = { [campo]: novoValor }
    const { error } = await supabase
      .from('oportunidades')
      .update(atualizacao)
      .eq('id', oportunidade.id)
    if (!error) setOportunidade({ ...oportunidade, ...atualizacao })
  }

  async function salvarPrevisaoFechamento(valor: string) {
    if (!oportunidade) return
    const novoValor = valor || null
    const { error } = await supabase
      .from('oportunidades')
      .update({ previsao_fechamento: novoValor })
      .eq('id', oportunidade.id)
    if (!error) setOportunidade({ ...oportunidade, previsao_fechamento: novoValor })
  }

  async function salvarValorEstimado(valor: string) {
    if (!oportunidade) return
    const numero = valor.trim() === '' ? null : Number(valor)
    if (numero !== null && !Number.isFinite(numero)) return
    const { error } = await supabase
      .from('oportunidades')
      .update({ valor_estimado: numero })
      .eq('id', oportunidade.id)
    if (!error) {
      setOportunidade({ ...oportunidade, valor_estimado: numero })
      setValorEstimadoInput(numero !== null ? String(numero) : '')
    }
  }

  return (
    <Modal
      open={oportunidadeId !== null}
      onClose={onClose}
      title={oportunidade ? `Oportunidade #${oportunidade.numero}` : 'Oportunidade'}
      widthClassName="max-w-2xl"
    >
      {carregando || !oportunidade ? (
        <div className="py-8 text-center text-sm text-muted">Carregando…</div>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-3 border-b border-white/10">
            <div className="flex gap-5">
            <button
              onClick={() => setAba('dados')}
              className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                aba === 'dados'
                  ? 'border-accent-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary/80'
              }`}
            >
              Dados
            </button>
            <button
              onClick={() => setAba('tarefas')}
              className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                aba === 'tarefas'
                  ? 'border-accent-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary/80'
              }`}
            >
              Tarefas
            </button>
            <button
              onClick={() => setAba('historico')}
              className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                aba === 'historico'
                  ? 'border-accent-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary/80'
              }`}
            >
              Histórico de contato
            </button>
            </div>
            <button
              type="button"
              onClick={() => setTarefaModalAberto(true)}
              className="mb-2 shrink-0 rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary-dark"
            >
              + Nova Tarefa
            </button>
          </div>

          {aba === 'dados' && (
            <div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-muted">Cliente</dt>
                  <dd className="mt-0.5 flex flex-wrap items-center gap-3 font-medium text-primary">
                    {oportunidade.cliente_nome}
                    <BotaoLigar
                      numeroDestino={oportunidade.cliente_telefone}
                      oportunidadeId={oportunidade.id}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Status</dt>
                  <dd className="font-medium text-primary">
                    {OPORTUNIDADE_STATUS_LABELS[oportunidade.status]}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">CNPJ do cliente</dt>
                  <dd className="font-medium text-primary">{oportunidade.cliente_cnpj ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Contato do cliente</dt>
                  <dd className="font-medium text-primary">
                    {oportunidade.cliente_contato ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Origem</dt>
                  <dd className="font-medium text-primary">{oportunidade.origem ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Temperatura</dt>
                  <dd className="font-medium text-primary">{oportunidade.temperatura ?? '—'}</dd>
                </div>
                {oportunidade.status === 'PERDIDO' && (
                  <div className="col-span-2">
                    <dt className="text-muted">Motivo da perda</dt>
                    <dd className="font-medium text-accent-danger">
                      {oportunidade.motivo_perda ?? '—'}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-5 border-t border-white/10 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Dados do negócio
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted">Valor estimado</dt>
                    <dd className="mt-0.5">
                      <MoedaInput
                        value={valorEstimadoInput}
                        onChange={setValorEstimadoInput}
                        onBlurSalvar={salvarValorEstimado}
                        className="input-field w-full rounded-md px-2 py-1 font-mono text-sm"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Previsão de fechamento</dt>
                    <dd className="mt-0.5">
                      <input
                        type="date"
                        value={previsaoFechamentoInput}
                        onChange={(e) => setPrevisaoFechamentoInput(e.target.value)}
                        onBlur={() => salvarPrevisaoFechamento(previsaoFechamentoInput)}
                        className="input-field w-full rounded-md px-2 py-1 text-sm"
                      />
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted">Produto/serviço de interesse</dt>
                    <dd className="mt-0.5">
                      <input
                        type="text"
                        value={produtoServicoInput}
                        onChange={(e) => setProdutoServicoInput(e.target.value)}
                        onBlur={() => salvarCampoTexto('produto_servico', produtoServicoInput)}
                        placeholder="Ex: Capacetes Classe A, Luvas de Raspa..."
                        className="input-field w-full rounded-md px-2 py-1 text-sm"
                      />
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted">Concorrentes</dt>
                    <dd className="mt-0.5">
                      <input
                        type="text"
                        value={concorrentesInput}
                        onChange={(e) => setConcorrentesInput(e.target.value)}
                        onBlur={() => salvarCampoTexto('concorrentes', concorrentesInput)}
                        placeholder="Ex: Fornecedor X, Fornecedor Y"
                        className="input-field w-full rounded-md px-2 py-1 text-sm"
                      />
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-5 border-t border-white/10 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Contato
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted">Nome</dt>
                    <dd className="mt-0.5">
                      <input
                        type="text"
                        value={contatoNomeInput}
                        onChange={(e) => setContatoNomeInput(e.target.value)}
                        onBlur={() => salvarCampoTexto('contato_nome', contatoNomeInput)}
                        placeholder="Nome do contato"
                        className="input-field w-full rounded-md px-2 py-1 text-sm"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Cargo</dt>
                    <dd className="mt-0.5">
                      <input
                        type="text"
                        value={contatoCargoInput}
                        onChange={(e) => setContatoCargoInput(e.target.value)}
                        onBlur={() => salvarCampoTexto('contato_cargo', contatoCargoInput)}
                        placeholder="Ex: Comprador, Gerente de SSMA..."
                        className="input-field w-full rounded-md px-2 py-1 text-sm"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">E-mail</dt>
                    <dd className="mt-0.5">
                      <input
                        type="email"
                        value={contatoEmailInput}
                        onChange={(e) => setContatoEmailInput(e.target.value)}
                        onBlur={() => salvarCampoTexto('contato_email', contatoEmailInput)}
                        placeholder="nome@empresa.com"
                        className="input-field w-full rounded-md px-2 py-1 text-sm"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Telefone</dt>
                    <dd className="mt-0.5">
                      <input
                        type="tel"
                        value={clienteTelefoneInput}
                        onChange={(e) =>
                          setClienteTelefoneInput(formatarTelefoneInput(e.target.value))
                        }
                        onBlur={() =>
                          salvarCampoTexto('cliente_telefone', clienteTelefoneInput)
                        }
                        placeholder="(11) 91234-5678"
                        className="input-field w-full rounded-md px-2 py-1 text-sm"
                      />
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-5 border-t border-white/10 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Histórico de chamadas
                </h3>
                <div className="mt-3">
                  <HistoricoChamadas oportunidadeId={oportunidade.id} />
                </div>
              </div>

              <ConverterEmOrcamentoSection
                oportunidade={oportunidade}
                onAtualizada={setOportunidade}
              />
              <MarcarOportunidadePerdidaSection
                oportunidade={oportunidade}
                setor={setor}
                onAtualizada={setOportunidade}
              />
            </div>
          )}

          {aba === 'tarefas' && (
            <TarefasTab oportunidadeId={oportunidade.id} empresaId={oportunidade.empresa_id} />
          )}

          {aba === 'historico' && <HistoricoContatoTab oportunidadeId={oportunidade.id} />}
        </div>
      )}

      {tarefaModalAberto && oportunidade && (
        <TarefaModal
          oportunidadeId={oportunidade.id}
          empresaId={oportunidade.empresa_id}
          onClose={() => setTarefaModalAberto(false)}
        />
      )}
    </Modal>
  )
}
