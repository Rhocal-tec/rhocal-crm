'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database, SetorTipo } from '@/types/database'

type Pedido = Database['public']['Tables']['pedidos']['Row']

type Etapa = 'idle' | 'vincular_cliente' | 'form' | 'convertendo'
type TipoCondicao = 'a_vista' | 'parcelado'

// Mesmo mínimo exigido pela própria API do Omie para busca por nome parcial.
const MIN_CARACTERES_BUSCA_CLIENTE = 3
const DEBOUNCE_BUSCA_CLIENTE_MS = 400

interface ClienteOmieSugestao {
  codigoClienteOmie: number
  razaoSocial: string
  nomeFantasia: string | null
  cnpjCpf: string | null
}

export function ConverterPedidoVendaSection({
  pedido,
  setor,
  onPedidoAtualizado,
}: {
  pedido: Pedido
  setor: SetorTipo
  onPedidoAtualizado: (pedido: Pedido) => void
}) {
  const [supabase] = useState(() => createClient())
  const [etapa, setEtapa] = useState<Etapa>('idle')
  const [tipo, setTipo] = useState<TipoCondicao>('a_vista')
  const [dataVencimento, setDataVencimento] = useState('')
  const [numeroParcelas, setNumeroParcelas] = useState('2')
  const [intervaloDias, setIntervaloDias] = useState('30')
  const [erro, setErro] = useState<string | null>(null)

  // Vínculo de cliente — necessário só quando o orçamento foi gerado com
  // "Gerar sem vincular cliente": o Omie aceita isso pra orçamento, mas exige
  // um cliente real pra converter em Pedido de Venda.
  const [buscaCliente, setBuscaCliente] = useState('')
  const [sugestoesCliente, setSugestoesCliente] = useState<ClienteOmieSugestao[]>([])
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [vinculando, setVinculando] = useState(false)
  const debounceClienteRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const podeConverter = setor === 'comercial' || setor === 'gestor'
  const elegivel =
    pedido.status === 'APROVADO_CLIENTE' &&
    pedido.omie_orcamento_id !== null &&
    !pedido.omie_convertido_pedido

  // Já convertido: o header do modal já mostra o "✓ Convertido" — nada a
  // fazer aqui. Fora de PEDIDO APROVADO ou sem orçamento no Omie ainda: a
  // ação simplesmente não se aplica ainda.
  if (!podeConverter || !elegivel) return null

  function abrirFluxoConversao() {
    setErro(null)
    setEtapa(pedido.cliente_omie_id === null ? 'vincular_cliente' : 'form')
  }

  async function buscarClientesPorNome(termo: string) {
    setBuscandoCliente(true)
    try {
      const resposta = await fetch('/api/omie/buscar-clientes-nome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: termo }),
      })
      const dados = await resposta.json().catch(() => null)
      if (resposta.ok && dados && Array.isArray(dados.clientes)) {
        setSugestoesCliente(dados.clientes)
      }
    } finally {
      setBuscandoCliente(false)
    }
  }

  function atualizarBuscaCliente(valor: string) {
    setBuscaCliente(valor)
    if (debounceClienteRef.current) clearTimeout(debounceClienteRef.current)

    const termo = valor.trim()
    if (termo.length < MIN_CARACTERES_BUSCA_CLIENTE) {
      setSugestoesCliente([])
      return
    }

    debounceClienteRef.current = setTimeout(
      () => buscarClientesPorNome(termo),
      DEBOUNCE_BUSCA_CLIENTE_MS,
    )
  }

  async function vincularCliente(cliente: ClienteOmieSugestao) {
    setErro(null)
    setVinculando(true)

    const { error } = await supabase
      .from('pedidos')
      .update({ cliente_omie_id: cliente.codigoClienteOmie })
      .eq('id', pedido.id)

    setVinculando(false)

    if (error) {
      setErro('Não foi possível vincular o cliente. Tente novamente.')
      return
    }

    onPedidoAtualizado({ ...pedido, cliente_omie_id: cliente.codigoClienteOmie })
    setBuscaCliente('')
    setSugestoesCliente([])
    setEtapa('form')
  }

  async function converter() {
    setErro(null)

    if (tipo === 'a_vista' && !dataVencimento) {
      setErro('Informe a data de vencimento.')
      return
    }
    const nParcelas = Number(numeroParcelas)
    const nDias = Number(intervaloDias)
    if (tipo === 'parcelado') {
      if (!Number.isFinite(nParcelas) || nParcelas < 2) {
        setErro('Informe pelo menos 2 parcelas.')
        return
      }
      if (!Number.isFinite(nDias) || nDias <= 0) {
        setErro('Informe um intervalo em dias maior que zero entre as parcelas.')
        return
      }
    }

    const condicaoPagamento =
      tipo === 'a_vista'
        ? { tipo: 'a_vista' as const, dataVencimento }
        : { tipo: 'parcelado' as const, numeroParcelas: nParcelas, intervaloDias: nDias }

    setEtapa('convertendo')

    try {
      const resposta = await fetch('/api/omie/orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'converter_pedido_venda',
          pedidoId: pedido.id,
          condicaoPagamento,
        }),
      })
      const dados = await resposta.json().catch(() => null)
      if (!resposta.ok || !dados || dados.erro) {
        throw new Error(dados?.erro ?? 'Erro inesperado ao converter o pedido no Omie.')
      }

      const { data } = await supabase.from('pedidos').select('*').eq('id', pedido.id).single()
      if (data) onPedidoAtualizado(data)
      setEtapa('idle')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro inesperado ao converter o pedido no Omie.')
      setEtapa('form')
    }
  }

  return (
    <div className="mt-4 rounded-md border border-accent-compras/30 bg-accent-compras/10 p-3">
      {erro && (
        <div className="mb-3 rounded-md border border-accent-danger/30 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erro}
        </div>
      )}

      {etapa === 'idle' ? (
        <button
          onClick={abrirFluxoConversao}
          className="rounded-md bg-accent-compras px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110"
        >
          Converter em Pedido de Venda
        </button>
      ) : etapa === 'vincular_cliente' ? (
        <div>
          <p className="text-sm font-medium text-primary">Vincule um cliente do Omie</p>
          <p className="mt-0.5 text-xs text-muted">
            Este orçamento foi gerado sem vincular um cliente — o Omie exige um cliente
            cadastrado para converter em Pedido de Venda.
          </p>
          <div className="relative mt-2">
            <input
              type="text"
              value={buscaCliente}
              onChange={(e) => atualizarBuscaCliente(e.target.value)}
              placeholder={`Buscar por nome (ex: ${pedido.cliente_nome})`}
              autoComplete="off"
              disabled={vinculando}
              className="input-field w-full rounded-md px-2 py-1.5 pr-8 text-sm"
            />
            {buscandoCliente && (
              <span
                aria-hidden="true"
                className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-accent-primary"
              />
            )}
          </div>
          {sugestoesCliente.length > 0 && (
            <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-white/10 bg-surface-alt py-1">
              {sugestoesCliente.map((cliente) => (
                <li key={cliente.codigoClienteOmie}>
                  <button
                    type="button"
                    disabled={vinculando}
                    onClick={() => vincularCliente(cliente)}
                    className="block w-full truncate px-3 py-1.5 text-left text-sm text-primary hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cliente.razaoSocial}
                    {cliente.cnpjCpf && (
                      <span className="ml-1.5 text-xs text-muted">— {cliente.cnpjCpf}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setEtapa('idle')}
            className="mt-3 rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-primary"
          >
            Cancelar
          </button>
        </div>
      ) : etapa === 'convertendo' ? (
        <p className="text-sm text-muted">Convertendo no Omie…</p>
      ) : (
        <div>
          <p className="text-sm font-medium text-primary">Condição de pagamento</p>
          <p className="mt-0.5 text-xs text-muted">
            Escolha manualmente a cada conversão — não há um padrão fixo.
          </p>

          <div className="mt-2 flex gap-4 text-sm text-primary">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={tipo === 'a_vista'}
                onChange={() => setTipo('a_vista')}
                className="accent-accent-compras"
              />
              À vista
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={tipo === 'parcelado'}
                onChange={() => setTipo('parcelado')}
                className="accent-accent-compras"
              />
              Parcelado
            </label>
          </div>

          {tipo === 'a_vista' ? (
            <div className="mt-3">
              <label className="block text-xs text-muted">Data de vencimento</label>
              <input
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                className="input-field mt-1 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              <div>
                <label className="block text-xs text-muted">Nº de parcelas</label>
                <input
                  type="number"
                  min="2"
                  step="1"
                  value={numeroParcelas}
                  onChange={(e) => setNumeroParcelas(e.target.value)}
                  className="input-field mt-1 w-24 rounded-md px-2 py-1.5 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-muted">Intervalo entre parcelas (dias)</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={intervaloDias}
                  onChange={(e) => setIntervaloDias(e.target.value)}
                  placeholder="Ex: 30"
                  className="input-field mt-1 w-36 rounded-md px-2 py-1.5 font-mono text-sm"
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={converter}
              className="rounded-md bg-accent-compras px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-110"
            >
              Confirmar conversão
            </button>
            <button
              onClick={() => setEtapa('idle')}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
