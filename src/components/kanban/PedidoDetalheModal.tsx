'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/ui/Modal'
import { MoedaInput } from '@/components/ui/MoedaInput'
import { MODO_FATURAMENTO_OPCOES, STATUS_LABELS } from '@/lib/kanban/status'
import { formatarDataSomente, formatarMoeda, formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { cotacaoVencida } from '@/lib/kanban/cotacao-vencida'
import { ConverterPedidoVendaSection } from './ConverterPedidoVendaSection'
import { CotacoesTab } from './CotacoesTab'
import { ItensTab } from './ItensTab'
import { MarcarPerdidoSection } from './MarcarPerdidoSection'
import { OmieOrcamentoSection } from './OmieOrcamentoSection'
import { OrcamentoPdfButton } from './OrcamentoPdfButton'
import type { Database, SetorTipo } from '@/types/database'

type Pedido = Database['public']['Tables']['pedidos']['Row']
type PedidoItem = Database['public']['Tables']['pedido_itens']['Row']

type Aba = 'dados' | 'itens' | 'cotacoes'

export function PedidoDetalheModal({
  pedidoId,
  onClose,
  onDuplicado,
  setor,
}: {
  pedidoId: string | null
  onClose: () => void
  onDuplicado?: (novoPedidoId: string) => void
  setor: SetorTipo
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [aba, setAba] = useState<Aba>('dados')
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [itens, setItens] = useState<PedidoItem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [itensComCotacaoVencedoraVencida, setItensComCotacaoVencedoraVencida] = useState<
    { descricao: string; validade: string }[]
  >([])
  const [telefoneInput, setTelefoneInput] = useState('')
  const [contatoInput, setContatoInput] = useState('')
  const [cnpjInput, setCnpjInput] = useState('')
  const [freteInput, setFreteInput] = useState('')
  const [duplicando, setDuplicando] = useState(false)
  const [erroDuplicar, setErroDuplicar] = useState<string | null>(null)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [nomeUltimaMovimentacao, setNomeUltimaMovimentacao] = useState<string | null>(null)

  const vePainelCompras = setor === 'compras' || setor === 'gestor'
  const veMargem = setor !== 'compras'
  const podeEditarDadosCliente = setor === 'comercial' || setor === 'gestor'
  const podeDuplicar = setor === 'comercial' || setor === 'gestor'
  // Number(...) é obrigatório aqui: o Postgres devolve `preco_venda` (numeric)
  // como string (ex: "150.00"), e `soma + item.preco_venda` faria concatenação
  // de string em vez de soma quando o valor chega assim.
  const totalPedido = itens.reduce((soma, item) => soma + Number(item.preco_venda ?? 0), 0)

  function handleItemAtualizado(itemAtualizado: PedidoItem) {
    setItens((atual) =>
      atual.map((item) => (item.id === itemAtualizado.id ? itemAtualizado : item)),
    )
  }

  useEffect(() => {
    if (!pedidoId) {
      setPedido(null)
      setItens([])
      setAba('dados')
      setMensagemSucesso(null)
      setErroDuplicar(null)
      return
    }

    let ativo = true
    setCarregando(true)

    async function carregar() {
      const [{ data: pedidoData }, { data: itensData }] = await Promise.all([
        supabase.from('pedidos').select('*').eq('id', pedidoId as string).single(),
        supabase
          .from('pedido_itens')
          .select('*')
          .eq('pedido_id', pedidoId as string)
          .order('criado_em', { ascending: true }),
      ])

      if (!ativo) return
      setPedido(pedidoData ?? null)
      setItens(itensData ?? [])
      setTelefoneInput(pedidoData?.cliente_telefone ?? '')
      setContatoInput(pedidoData?.cliente_contato ?? '')
      setCnpjInput(pedidoData?.cliente_cnpj ?? '')
      setFreteInput(
        pedidoData?.valor_frete !== undefined && pedidoData?.valor_frete !== null
          ? String(pedidoData.valor_frete)
          : '0',
      )
      setCarregando(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [pedidoId, supabase])

  // Nome de quem fez a última movimentação de status — cai para criado_por
  // quando o pedido ainda não foi movido (movido_por nulo).
  const responsavelId = pedido?.movido_por ?? pedido?.criado_por ?? null
  useEffect(() => {
    if (!responsavelId) {
      setNomeUltimaMovimentacao(null)
      return
    }

    let ativo = true

    async function carregar() {
      const { data } = await supabase
        .from('profiles')
        .select('nome')
        .eq('id', responsavelId as string)
        .maybeSingle()
      if (ativo) setNomeUltimaMovimentacao(data?.nome ?? null)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [responsavelId, supabase])

  // Alerta no topo do modal quando a cotação vencedora de algum item está
  // vencida — restrito a compras/gestor, que são os únicos perfis que
  // enxergam datas de validade de cotação.
  useEffect(() => {
    if (!vePainelCompras || itens.length === 0) {
      setItensComCotacaoVencedoraVencida([])
      return
    }

    let ativo = true

    async function carregar() {
      const { data } = await supabase
        .from('cotacoes')
        .select('item_id, validade_cotacao')
        .eq('vencedora', true)
        .in(
          'item_id',
          itens.map((item) => item.id),
        )

      if (!ativo || !data) return

      const vencidas = data
        .filter((cotacao) => cotacaoVencida(cotacao.validade_cotacao))
        .map((cotacao) => ({
          descricao: itens.find((item) => item.id === cotacao.item_id)?.descricao ?? 'item',
          validade: cotacao.validade_cotacao,
        }))
      setItensComCotacaoVencedoraVencida(vencidas)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [itens, vePainelCompras, supabase])

  // Some a mensagem de sucesso de duplicação automaticamente após alguns segundos.
  useEffect(() => {
    if (!mensagemSucesso) return
    const timeout = setTimeout(() => setMensagemSucesso(null), 6000)
    return () => clearTimeout(timeout)
  }, [mensagemSucesso])

  async function salvarDataEntregaReal(valor: string) {
    if (!pedido) return
    const novaData = valor || null
    const { error } = await supabase
      .from('pedidos')
      .update({ data_entrega_real: novaData })
      .eq('id', pedido.id)
    if (!error) setPedido({ ...pedido, data_entrega_real: novaData })
  }

  async function salvarDadosCliente(
    campo: 'cliente_telefone' | 'cliente_contato' | 'cliente_cnpj',
    valor: string,
  ) {
    if (!pedido) return
    const novoValor = valor.trim() || null
    const atualizacao: Partial<Pedido> = { [campo]: novoValor }
    const { error } = await supabase.from('pedidos').update(atualizacao).eq('id', pedido.id)
    if (!error) setPedido({ ...pedido, ...atualizacao })
  }

  async function salvarFrete(valor: string) {
    if (!pedido) return
    const numero = valor.trim() === '' ? 0 : Number(valor)
    if (!Number.isFinite(numero) || numero < 0) return
    const { error } = await supabase
      .from('pedidos')
      .update({ valor_frete: numero })
      .eq('id', pedido.id)
    if (!error) {
      setPedido({ ...pedido, valor_frete: numero })
      setFreteInput(String(numero))
    }
  }

  async function salvarModoFaturamento(valor: string) {
    if (!pedido) return
    const novoValor = valor || null
    const { error } = await supabase
      .from('pedidos')
      .update({ modo_faturamento: novoValor })
      .eq('id', pedido.id)
    if (!error) setPedido({ ...pedido, modo_faturamento: novoValor })
  }

  async function duplicarPedido() {
    if (!pedido || !user) return
    const confirmado = window.confirm('Criar uma cópia deste pedido como novo Orçamento?')
    if (!confirmado) return

    setDuplicando(true)
    setErroDuplicar(null)

    const { data: novoPedido, error: erroPedido } = await supabase
      .from('pedidos')
      .insert({
        cliente_nome: pedido.cliente_nome,
        cliente_omie_id: pedido.cliente_omie_id,
        cliente_telefone: pedido.cliente_telefone,
        cliente_contato: pedido.cliente_contato,
        criado_por: user.id,
      })
      .select()
      .single()

    if (erroPedido || !novoPedido) {
      setErroDuplicar('Não foi possível duplicar o pedido. Tente novamente.')
      setDuplicando(false)
      return
    }

    if (itens.length > 0) {
      const { error: erroItens } = await supabase.from('pedido_itens').insert(
        itens.map((item) => ({
          pedido_id: novoPedido.id,
          descricao: item.descricao,
          quantidade: item.quantidade,
          ca: item.ca,
        })),
      )

      if (erroItens) {
        setDuplicando(false)
        setMensagemSucesso(
          `Pedido duplicado como #${novoPedido.numero}, mas houve um erro ao copiar os itens. Confira e adicione manualmente.`,
        )
        onDuplicado?.(novoPedido.id)
        return
      }
    }

    setDuplicando(false)
    setMensagemSucesso(`Pedido duplicado como #${novoPedido.numero}`)
    onDuplicado?.(novoPedido.id)
  }

  return (
    <Modal
      open={pedidoId !== null}
      onClose={onClose}
      title={pedido ? `Pedido #${pedido.numero}` : 'Pedido'}
      titleExtra={
        pedido && (pedido.orcamento_direto || pedido.omie_orcamento_id !== null) ? (
          <span className="flex items-center gap-2">
            {pedido.orcamento_direto && (
              <span
                title="Orçamento direto — sem cotação do Compras"
                className="inline-flex items-center rounded-full border border-accent-compras/40 bg-accent-compras/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent-compras"
              >
                Direto
              </span>
            )}
            {pedido.omie_orcamento_id !== null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent-primary/40 bg-accent-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-accent-primary">
                Omie #{pedido.omie_orcamento_id}
              </span>
            )}
            {pedido.omie_convertido_pedido && (
              <span
                title="Já convertido em Pedido de Venda no Omie"
                className="inline-flex items-center gap-1 rounded-full border border-accent-success/40 bg-accent-success/15 px-2 py-0.5 text-xs font-semibold text-accent-success"
              >
                Convertido em Pedido de Venda ✓
              </span>
            )}
          </span>
        ) : undefined
      }
      widthClassName="max-w-5xl"
    >
      {carregando || !pedido ? (
        <div className="py-8 text-center text-sm text-muted">Carregando…</div>
      ) : (
        <div>
          {mensagemSucesso && (
            <div className="mb-3 rounded-md border border-accent-success/30 bg-accent-success/10 px-3 py-2 text-sm text-accent-success">
              ✓ {mensagemSucesso}
            </div>
          )}

          {erroDuplicar && (
            <div className="mb-3 rounded-md border border-accent-danger/30 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
              {erroDuplicar}
            </div>
          )}

          {itensComCotacaoVencedoraVencida.length > 0 && (
            <div className="mb-3 flex flex-col gap-1.5 rounded-md border border-accent-danger/30 bg-accent-danger/10 px-3 py-2.5 text-sm text-accent-danger">
              {itensComCotacaoVencedoraVencida.map((item, index) => (
                <p key={index}>
                  <strong>Atenção:</strong> a cotação vencedora do item &ldquo;{item.descricao}
                  &rdquo; está vencida desde {formatarDataSomente(item.validade)} — considere
                  recotar antes de prosseguir.
                </p>
              ))}
            </div>
          )}

          {(veMargem || podeDuplicar) && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-surface-alt px-3 py-2 text-sm">
              {veMargem ? (
                <>
                  <span className="text-muted">Total do pedido (preço de venda)</span>
                  <span className="font-mono font-semibold text-primary">
                    {formatarMoeda(totalPedido)}
                  </span>
                </>
              ) : (
                <span />
              )}
              {podeDuplicar && (
                <button
                  onClick={duplicarPedido}
                  disabled={duplicando}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-primary/80 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {duplicando ? 'Duplicando…' : 'Duplicar'}
                </button>
              )}
            </div>
          )}

          <div className="flex gap-5 border-b border-white/10">
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
              onClick={() => setAba('itens')}
              className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                aba === 'itens'
                  ? 'border-accent-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary/80'
              }`}
            >
              Itens ({itens.length})
            </button>
            {vePainelCompras && (
              <button
                onClick={() => setAba('cotacoes')}
                className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                  aba === 'cotacoes'
                    ? 'border-accent-primary text-primary'
                    : 'border-transparent text-muted hover:text-primary/80'
                }`}
              >
                Cotações
              </button>
            )}
          </div>

          {aba === 'dados' && (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted">Cliente</dt>
                <dd className="font-medium text-primary">{pedido.cliente_nome}</dd>
              </div>
              <div>
                <dt className="text-muted">Número do pedido</dt>
                <dd className="font-mono font-medium text-primary">#{pedido.numero}</dd>
              </div>
              <div>
                <dt className="text-muted">Telefone do cliente</dt>
                <dd className="font-medium text-primary">
                  {podeEditarDadosCliente ? (
                    <input
                      type="tel"
                      value={telefoneInput}
                      onChange={(e) => setTelefoneInput(formatarTelefoneInput(e.target.value))}
                      onBlur={() => salvarDadosCliente('cliente_telefone', telefoneInput)}
                      placeholder="(11) 91234-5678"
                      className="input-field mt-0.5 w-full rounded-md px-2 py-1 text-sm"
                    />
                  ) : (
                    (pedido.cliente_telefone ?? '—')
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Contato do cliente</dt>
                <dd className="font-medium text-primary">
                  {podeEditarDadosCliente ? (
                    <input
                      type="text"
                      value={contatoInput}
                      onChange={(e) => setContatoInput(e.target.value)}
                      onBlur={() => salvarDadosCliente('cliente_contato', contatoInput)}
                      placeholder="Nome do contato"
                      className="input-field mt-0.5 w-full rounded-md px-2 py-1 text-sm"
                    />
                  ) : (
                    (pedido.cliente_contato ?? '—')
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">CNPJ do cliente</dt>
                <dd className="font-medium text-primary">
                  {podeEditarDadosCliente ? (
                    <input
                      type="text"
                      value={cnpjInput}
                      onChange={(e) => setCnpjInput(e.target.value)}
                      onBlur={() => salvarDadosCliente('cliente_cnpj', cnpjInput)}
                      placeholder="00.000.000/0000-00"
                      className="input-field mt-0.5 w-full rounded-md px-2 py-1 font-mono text-sm"
                    />
                  ) : (
                    (pedido.cliente_cnpj ?? '—')
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Status</dt>
                <dd className="font-medium text-primary">{STATUS_LABELS[pedido.status]}</dd>
              </div>
              <div>
                <dt className="text-muted">Frete</dt>
                <dd className="font-medium text-primary">
                  {podeEditarDadosCliente ? (
                    <MoedaInput
                      value={freteInput}
                      onChange={setFreteInput}
                      onBlurSalvar={salvarFrete}
                      className="input-field mt-0.5 w-full rounded-md px-2 py-1 font-mono text-sm"
                    />
                  ) : (
                    formatarMoeda(pedido.valor_frete)
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Modo de faturamento</dt>
                <dd className="font-medium text-primary">
                  {podeEditarDadosCliente ? (
                    <select
                      value={pedido.modo_faturamento ?? ''}
                      onChange={(e) => salvarModoFaturamento(e.target.value)}
                      className="input-field mt-0.5 w-full rounded-md px-2 py-1 text-sm"
                    >
                      <option value="">—</option>
                      {MODO_FATURAMENTO_OPCOES.map((opcao) => (
                        <option key={opcao} value={opcao}>
                          {opcao}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (pedido.modo_faturamento ?? '—')
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Última movimentação</dt>
                <dd className="font-medium text-primary">
                  {new Date(pedido.ultima_movimentacao).toLocaleDateString('pt-BR')}
                  {nomeUltimaMovimentacao && ` por ${nomeUltimaMovimentacao}`}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Previsão de chegada</dt>
                <dd className="font-medium text-primary">
                  {formatarDataSomente(pedido.previsao_chegada)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Data real de entrega</dt>
                <dd className="font-medium text-primary">
                  {vePainelCompras ? (
                    <input
                      type="date"
                      value={pedido.data_entrega_real ?? ''}
                      onChange={(e) => salvarDataEntregaReal(e.target.value)}
                      className="input-field mt-0.5 rounded-md px-2 py-1 text-sm"
                    />
                  ) : (
                    formatarDataSomente(pedido.data_entrega_real)
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Entrega ao cliente (prometida)</dt>
                <dd className="font-medium text-primary">
                  {formatarDataSomente(pedido.data_entrega_cliente)}
                </dd>
              </div>
              {pedido.status === 'PERDIDO' && (
                <div className="col-span-2">
                  <dt className="text-muted">Motivo da perda</dt>
                  <dd className="font-medium text-accent-danger">
                    {pedido.motivo_perda ?? '—'}
                  </dd>
                </div>
              )}
            </dl>
          )}

          {aba === 'dados' && <OrcamentoPdfButton pedido={pedido} itens={itens} setor={setor} />}

          {aba === 'dados' && (
            <OmieOrcamentoSection
              pedido={pedido}
              itens={itens}
              setor={setor}
              onPedidoAtualizado={setPedido}
              onItemAtualizado={handleItemAtualizado}
            />
          )}

          {aba === 'dados' && (
            <ConverterPedidoVendaSection
              pedido={pedido}
              setor={setor}
              onPedidoAtualizado={setPedido}
            />
          )}

          {aba === 'dados' && (
            <MarcarPerdidoSection pedido={pedido} setor={setor} onPedidoAtualizado={setPedido} />
          )}

          {aba === 'itens' && (
            <ItensTab itens={itens} setor={setor} onItemAtualizado={handleItemAtualizado} />
          )}

          {aba === 'cotacoes' && vePainelCompras && (
            <CotacoesTab itens={itens} pedidoNumero={pedido.numero} />
          )}
        </div>
      )}
    </Modal>
  )
}
