'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { MoedaInput } from '@/components/ui/MoedaInput'
import { formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { OPORTUNIDADE_KANBAN_COLUMNS, OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { podeMoverOportunidade } from '@/lib/oportunidades/permissions'
import { TarefasTab } from '@/components/tarefas/TarefasTab'
import { TarefaModal } from '@/components/tarefas/TarefaModal'
import { HistoricoContatoTab } from '@/components/interacoes/HistoricoContatoTab'
import HistoricoChamadas from '@/components/mobcall/HistoricoChamadas'
import { ConverterEmOrcamentoSection } from './ConverterEmOrcamentoSection'
import { MarcarOportunidadePerdidaSection } from './MarcarOportunidadePerdidaSection'
import type { Database, OportunidadeStatus, SetorTipo } from '@/types/database'

type Oportunidade = Database['public']['Tables']['oportunidades']['Row']
type Tarefa = Database['public']['Tables']['tarefas']['Row']

type CampoTexto =
  | 'contato_nome'
  | 'contato_cargo'
  | 'contato_email'
  | 'produto_servico'
  | 'concorrentes'
  | 'cliente_telefone'
  | 'contato_telefone'
  | 'whatsapp_empresa'
  | 'whatsapp_comprador'
  | 'necessidade_cliente'
  | 'historico_conversa'

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

  // Fallback de exibição: se a oportunidade nasceu do fluxo "Criar
  // Oportunidade" na conclusão de uma tarefa (origem_tarefa_id), busca a
  // tarefa de origem só pra preencher campos que tenham ficado vazios na
  // oportunidade — nunca sobrescreve o que já está salvo nela.
  const [tarefaOrigem, setTarefaOrigem] = useState<Tarefa | null>(null)

  // Nome de quem criou a oportunidade (criado_por) — mesmo dado exibido como
  // "Contato feito por" no card do FunilBoard.
  const [nomeCriador, setNomeCriador] = useState<string | null>(null)
  const criadoPor = oportunidade?.criado_por ?? null

  useEffect(() => {
    setNomeCriador(null)
    if (!criadoPor) return
    let ativo = true
    supabase
      .from('profiles')
      .select('nome')
      .eq('id', criadoPor)
      .single()
      .then(({ data }) => {
        if (ativo) setNomeCriador(data?.nome ?? null)
      })
    return () => {
      ativo = false
    }
  }, [supabase, criadoPor])

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
  const [contatoTelefoneInput, setContatoTelefoneInput] = useState('')
  const [whatsappEmpresaInput, setWhatsappEmpresaInput] = useState('')
  const [whatsappCompradorInput, setWhatsappCompradorInput] = useState('')
  const [necessidadeClienteInput, setNecessidadeClienteInput] = useState('')
  const [historicoConversaInput, setHistoricoConversaInput] = useState('')

  useEffect(() => {
    if (!oportunidadeId) {
      setOportunidade(null)
      setAba('dados')
      setTarefaOrigem(null)
      return
    }

    let ativo = true
    setCarregando(true)

    supabase
      .from('oportunidades')
      .select('*')
      .eq('id', oportunidadeId)
      .single()
      .then(async ({ data }) => {
        if (!ativo) return

        // Se a oportunidade nasceu do fluxo "Criar Oportunidade" (conclusão
        // de tarefa), busca a tarefa de origem pra usar como fallback de
        // exibição nos campos que tenham ficado vazios aqui.
        let origem: Tarefa | null = null
        if (data?.origem_tarefa_id) {
          const { data: tarefa } = await supabase
            .from('tarefas')
            .select('*')
            .eq('id', data.origem_tarefa_id)
            .single()
          origem = tarefa ?? null
        }
        if (!ativo) return
        setTarefaOrigem(origem)

        setOportunidade(data ?? null)
        setPrevisaoFechamentoInput(data?.previsao_fechamento ?? '')
        setProdutoServicoInput(data?.produto_servico ?? '')
        setConcorrentesInput(data?.concorrentes ?? '')
        setContatoNomeInput(data?.contato_nome ?? origem?.contato_nome ?? '')
        setContatoCargoInput(data?.contato_cargo ?? origem?.contato_cargo ?? '')
        setContatoEmailInput(data?.contato_email ?? origem?.contato_email ?? '')
        setClienteTelefoneInput(data?.cliente_telefone ?? origem?.cliente_telefone ?? '')
        setContatoTelefoneInput(data?.contato_telefone ?? origem?.contato_telefone ?? '')
        setWhatsappEmpresaInput(data?.whatsapp_empresa ?? origem?.whatsapp_empresa ?? '')
        setWhatsappCompradorInput(data?.whatsapp_comprador ?? origem?.whatsapp_comprador ?? '')
        setNecessidadeClienteInput(data?.necessidade_cliente ?? origem?.necessidade_cliente ?? '')
        setHistoricoConversaInput(data?.historico_conversa ?? origem?.historico_conversa ?? '')
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

  // Fase de colapso das colunas por etapa em uma única coluna "Oportunidades"
  // (kanban só tem mais Atrasadas/Hoje/Futuras/Concluídas/Oportunidades) —
  // sem drag-and-drop entre etapas, a troca de etapa passa a ser feita aqui.
  // GANHO/PERDIDO continuam fora deste seletor: têm fluxo próprio
  // (ConverterEmOrcamentoSection/MarcarOportunidadePerdidaSection).
  async function salvarStatus(novoStatus: OportunidadeStatus) {
    if (!oportunidade || novoStatus === oportunidade.status) return
    const { error } = await supabase
      .from('oportunidades')
      .update({ status: novoStatus })
      .eq('id', oportunidade.id)
    if (!error) setOportunidade({ ...oportunidade, status: novoStatus })
  }

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
      // BotaoLigar (click-to-call Mobcall) desativado até a integração ser
      // contratada — componente mantido em src/components/mobcall/BotaoLigar.tsx,
      // é só reativar passando titleExtra de volta quando chegar a hora.
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
              {nomeCriador && (
                <p className="mt-4 text-sm text-muted">
                  Contato feito por <span className="font-medium text-primary">{nomeCriador}</span> em{' '}
                  {/* criado_em é timestamptz — data no fuso local, não o dia UTC. */}
                  {new Date(oportunidade.criado_em).toLocaleDateString('pt-BR')}
                </p>
              )}

              <div className="mt-4 rounded-md border-2 border-accent-primary/50 bg-accent-primary/10 p-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-accent-primary">
                  O que o cliente deseja/precisa
                </h3>
                <textarea
                  value={necessidadeClienteInput}
                  onChange={(e) => setNecessidadeClienteInput(e.target.value)}
                  onBlur={() => salvarCampoTexto('necessidade_cliente', necessidadeClienteInput)}
                  rows={3}
                  placeholder="Ainda não informado."
                  className="input-field mt-2 w-full rounded-md px-2 py-1.5 text-sm"
                />
              </div>

              <div className="mt-3 rounded-md border border-white/10 bg-surface-alt p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Histórico da conversa
                </h3>
                <p className="mt-1 text-xs text-muted">
                  O que foi conversado com o cliente antes desta oportunidade ser criada
                  {tarefaOrigem && !oportunidade.historico_conversa
                    ? ' (herdado da tarefa de origem).'
                    : '.'}
                </p>
                <textarea
                  value={historicoConversaInput}
                  onChange={(e) => setHistoricoConversaInput(e.target.value)}
                  onBlur={() => salvarCampoTexto('historico_conversa', historicoConversaInput)}
                  rows={4}
                  placeholder="Nenhum relato registrado."
                  className="input-field mt-2 w-full whitespace-pre-wrap rounded-md px-2 py-1.5 text-sm"
                />
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted">Cliente</dt>
                  <dd className="font-medium text-primary">{oportunidade.cliente_nome}</dd>
                </div>
                <div>
                  <dt className="text-muted">Etapa</dt>
                  <dd className="mt-0.5">
                    {OPORTUNIDADE_KANBAN_COLUMNS.includes(oportunidade.status) &&
                    podeMoverOportunidade(setor) ? (
                      <select
                        value={oportunidade.status}
                        onChange={(e) => salvarStatus(e.target.value as OportunidadeStatus)}
                        className="input-field w-full rounded-md px-2 py-1 text-sm"
                      >
                        {OPORTUNIDADE_KANBAN_COLUMNS.map((status) => (
                          <option key={status} value={status}>
                            {OPORTUNIDADE_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-medium text-primary">
                        {OPORTUNIDADE_STATUS_LABELS[oportunidade.status]}
                      </span>
                    )}
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
                    <dt className="text-muted">Telefone da empresa</dt>
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
                  <div>
                    <dt className="text-muted">Telefone do contato</dt>
                    <dd className="mt-0.5">
                      <input
                        type="tel"
                        value={contatoTelefoneInput}
                        onChange={(e) =>
                          setContatoTelefoneInput(formatarTelefoneInput(e.target.value))
                        }
                        onBlur={() => salvarCampoTexto('contato_telefone', contatoTelefoneInput)}
                        placeholder="(11) 91234-5678"
                        className="input-field w-full rounded-md px-2 py-1 text-sm"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">WhatsApp da empresa</dt>
                    <dd className="mt-0.5">
                      <input
                        type="tel"
                        value={whatsappEmpresaInput}
                        onChange={(e) =>
                          setWhatsappEmpresaInput(formatarTelefoneInput(e.target.value))
                        }
                        onBlur={() => salvarCampoTexto('whatsapp_empresa', whatsappEmpresaInput)}
                        placeholder="(11) 91234-5678"
                        className="input-field w-full rounded-md px-2 py-1 text-sm"
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">WhatsApp do comprador</dt>
                    <dd className="mt-0.5">
                      <input
                        type="tel"
                        value={whatsappCompradorInput}
                        onChange={(e) =>
                          setWhatsappCompradorInput(formatarTelefoneInput(e.target.value))
                        }
                        onBlur={() =>
                          salvarCampoTexto('whatsapp_comprador', whatsappCompradorInput)
                        }
                        placeholder="(11) 91234-5678"
                        className="input-field w-full rounded-md px-2 py-1 text-sm"
                      />
                    </dd>
                  </div>
                </dl>
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

          {aba === 'historico' && (
            <div>
              <HistoricoContatoTab oportunidadeId={oportunidade.id} />
              <div className="mt-5 border-t border-white/10 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Histórico de chamadas
                </h3>
                <div className="mt-3">
                  <HistoricoChamadas oportunidadeId={oportunidade.id} />
                </div>
              </div>
            </div>
          )}
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
