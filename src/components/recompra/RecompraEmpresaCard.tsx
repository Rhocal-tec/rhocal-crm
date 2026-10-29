'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import { diasAPartirDeHoje } from '@/lib/recompra/prazo'
import { montarLinkWhatsapp } from '@/lib/inteligencia/whatsapp'
import type { Database } from '@/types/database'

type RecompraPrevisao = Database['public']['Views']['v_recompra_priorizada']['Row']

const MOTIVOS: { valor: string; rotulo: string }[] = [
  { valor: 'nao_tentei_ainda', rotulo: 'Não tentei ainda' },
  { valor: 'cliente_ainda_tem_estoque', rotulo: 'Cliente ainda tem estoque' },
  { valor: 'trocou_fornecedor', rotulo: 'Trocou de fornecedor' },
  { valor: 'nao_usa_mais', rotulo: 'Não usa mais' },
]

const CONFIABILIDADE_COR: Record<string, string> = {
  alta: 'bg-accent-success',
  media: 'bg-accent-alert',
  baixa: 'bg-white/30',
}

// Card por EMPRESA (cliente): reúne todos os itens previstos para recompra daquele
// cliente numa tela só, com ações em lote (WhatsApp único, Contatado, 1 orçamento).
export function RecompraEmpresaCard({
  itens,
  telefone,
  onAtualizadas,
}: {
  itens: RecompraPrevisao[]
  telefone: string | null
  onAtualizadas: (atualizadas: RecompraPrevisao[]) => void
}) {
  const { user } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [aberto, setAberto] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [motivoAberto, setMotivoAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pedidoNumero, setPedidoNumero] = useState<number | null>(null)

  const primeiro = itens[0]
  const emAbertoIds = useMemo(
    () => itens.filter((i) => i.status === 'pendente' || i.status === 'contatado').map((i) => i.id),
    [itens],
  )
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set())
  const selecionados = itens.filter((i) => emAbertoIds.includes(i.id) && !desmarcados.has(i.id))

  const atrasados = itens.filter(
    (i) => emAbertoIds.includes(i.id) && diasAPartirDeHoje(i.data_prevista_recompra) < 0,
  ).length
  const valorTotal = itens
    .filter((i) => emAbertoIds.includes(i.id))
    .reduce((soma, i) => soma + Number(i.valor_estimado_pedido ?? 0), 0)
  const maisAntiga = itens
    .filter((i) => emAbertoIds.includes(i.id))
    .map((i) => i.data_prevista_recompra)
    .sort()[0]
  const caVencendo = itens.some((i) => i.ca_vencendo && emAbertoIds.includes(i.id))

  function alternar(id: string) {
    setDesmarcados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  const mensagem = `Olá! Aqui é da RHOCAL Equipamentos. Pelo histórico de compras de vocês, está chegando a hora de repor:\n${selecionados
    .map((i) => `• ${i.item_nome}`)
    .join('\n')}\nPosso preparar um único orçamento com tudo isso?`
  const linkWhatsapp = telefone && selecionados.length > 0 ? montarLinkWhatsapp(telefone, mensagem) : null

  async function marcarContatados() {
    const alvo = selecionados.filter((i) => i.status === 'pendente')
    if (alvo.length === 0) return
    setSalvando(true)
    setErro(null)
    const { error } = await supabase
      .from('recompra_previsao')
      .update({ status: 'contatado' })
      .in('id', alvo.map((i) => i.id))
    setSalvando(false)
    if (error) {
      setErro(`Não foi possível marcar como contatado: ${error.message}`)
      return
    }
    onAtualizadas(alvo.map((i) => ({ ...i, status: 'contatado' as const })))
  }

  async function converterEmUmOrcamento() {
    if (!user || !empresaAtiva || selecionados.length === 0) return
    const ok = window.confirm(
      `Criar UM orçamento para ${primeiro.cliente_nome} cobrindo ${selecionados.length} item(ns)?`,
    )
    if (!ok) return
    setSalvando(true)
    setErro(null)
    const { data: pedido, error: erroPedido } = await supabase
      .from('pedidos')
      .insert({
        cliente_nome: primeiro.cliente_nome,
        cliente_cnpj: primeiro.cliente_cnpj,
        criado_por: user.id,
        empresa_id: empresaAtiva.id,
      })
      .select()
      .single()
    if (erroPedido || !pedido) {
      setErro('Não foi possível criar o orçamento. Tente novamente.')
      setSalvando(false)
      return
    }
    const { error } = await supabase
      .from('recompra_previsao')
      .update({ status: 'convertido', pedido_id: pedido.id })
      .in('id', selecionados.map((i) => i.id))
    setSalvando(false)
    if (error) {
      setErro(`Orçamento #${pedido.numero} criado, mas houve erro ao vincular os itens. Atualize a página.`)
      return
    }
    setPedidoNumero(pedido.numero)
    onAtualizadas(selecionados.map((i) => ({ ...i, status: 'convertido' as const, pedido_id: pedido.id })))
  }

  async function confirmarNaoConverteu() {
    if (!motivo) {
      setErro('Selecione o motivo.')
      return
    }
    setSalvando(true)
    setErro(null)
    const { error } = await supabase
      .from('recompra_previsao')
      .update({ status: 'nao_converteu', motivo_nao_convertido: motivo })
      .in('id', selecionados.map((i) => i.id))
    setSalvando(false)
    if (error) {
      setErro(`Não foi possível salvar: ${error.message}`)
      return
    }
    onAtualizadas(
      selecionados.map((i) => ({ ...i, status: 'nao_converteu' as const, motivo_nao_convertido: motivo })),
    )
    setMotivoAberto(false)
    setMotivo('')
  }

  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${
        caVencendo
          ? 'border-accent-danger/50 bg-accent-danger/5'
          : atrasados > 0
            ? 'border-accent-alert/50 bg-accent-alert/5'
            : 'border-white/10 bg-surface'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-primary">{primeiro.cliente_nome}</p>
          <p className="text-xs text-muted">
            {primeiro.vendedor_nome ? `Vendedor: ${primeiro.vendedor_nome}` : 'Sem vendedor'}
          </p>
        </div>
        <button onClick={() => setAberto((a) => !a)} className="text-xs text-muted hover:text-primary">
          {aberto ? 'Recolher ▲' : `Ver itens (${itens.length}) ▼`}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-primary">{emAbertoIds.length} item(ns) em aberto</span>
        {atrasados > 0 && (
          <span className="rounded-full bg-accent-alert/15 px-2 py-0.5 font-medium text-accent-alert">
            {atrasados} atrasado(s)
          </span>
        )}
        {caVencendo && (
          <span className="rounded-full bg-accent-danger/15 px-2 py-0.5 font-medium text-accent-danger">CA vencendo</span>
        )}
        <span className="rounded-full bg-accent-success/10 px-2 py-0.5 font-medium text-accent-success">
          {formatarMoeda(valorTotal)} potencial
        </span>
        {maisAntiga && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-muted">
            1º previsto: {formatarDataSomente(maisAntiga)}
          </span>
        )}
      </div>

      {aberto && (
        <ul className="mt-3 divide-y divide-white/5 rounded-md border border-white/5">
          {itens.map((i) => {
            const aberta = emAbertoIds.includes(i.id)
            const dias = diasAPartirDeHoje(i.data_prevista_recompra)
            return (
              <li key={i.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                {aberta ? (
                  <input
                    type="checkbox"
                    checked={!desmarcados.has(i.id)}
                    onChange={() => alternar(i.id)}
                    className="h-3.5 w-3.5 accent-accent-compras"
                  />
                ) : (
                  <span className="w-3.5" />
                )}
                <span
                  title={`Confiabilidade ${i.confiabilidade}`}
                  className={`h-2 w-2 shrink-0 rounded-full ${CONFIABILIDADE_COR[i.confiabilidade] ?? 'bg-white/30'}`}
                />
                <span className="min-w-0 flex-1 truncate text-primary">{i.item_nome}</span>
                {i.ca_vencendo && <span className="text-accent-danger">CA</span>}
                <span className={dias < 0 && aberta ? 'font-medium text-accent-alert' : 'text-muted'}>
                  {i.status === 'convertido'
                    ? '✓ convertido'
                    : i.status === 'nao_converteu'
                      ? 'não converteu'
                      : dias < 0
                        ? `${Math.abs(dias)}d atrasado`
                        : `em ${dias}d`}
                </span>
                <span className="w-20 text-right font-mono text-primary">{formatarMoeda(i.valor_estimado_pedido)}</span>
              </li>
            )
          })}
        </ul>
      )}

      {erro && <p className="mt-2 text-xs text-accent-danger">{erro}</p>}
      {pedidoNumero !== null && (
        <p className="mt-2 text-xs text-accent-success">
          ✓ Orçamento #{pedidoNumero} criado —{' '}
          <Link href="/dashboard" className="underline">
            ver no Kanban
          </Link>
        </p>
      )}

      {emAbertoIds.length > 0 && (
        <div className="mt-3">
          {motivoAberto ? (
            <div className="rounded-md border border-white/10 bg-white/5 p-2">
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="input-field w-full rounded-md px-2 py-1.5 text-xs"
              >
                <option value="">Selecione o motivo…</option>
                {MOTIVOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={confirmarNaoConverteu}
                  disabled={salvando}
                  className="rounded-md bg-accent-danger px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-60"
                >
                  {salvando ? 'Salvando…' : `Confirmar (${selecionados.length})`}
                </button>
                <button
                  onClick={() => {
                    setMotivoAberto(false)
                    setMotivo('')
                  }}
                  className="rounded-md px-2.5 py-1 text-[11px] text-muted hover:text-primary"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {linkWhatsapp ? (
                <a
                  href={linkWhatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-accent-success/40 bg-accent-success/10 px-2.5 py-1.5 text-xs font-medium text-accent-success hover:bg-accent-success/20"
                >
                  WhatsApp ({selecionados.length})
                </a>
              ) : (
                <span
                  title={telefone ? 'Nenhum item selecionado' : 'Cliente sem telefone cadastrado'}
                  className="cursor-not-allowed rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-muted/60"
                >
                  {telefone ? 'WhatsApp' : 'Sem telefone'}
                </span>
              )}
              <button
                onClick={marcarContatados}
                disabled={salvando || selecionados.length === 0}
                className="rounded-md border border-accent-compras/40 bg-accent-compras/10 px-2.5 py-1.5 text-xs font-medium text-accent-compras hover:bg-accent-compras/20 disabled:opacity-50"
              >
                Contatado
              </button>
              <button
                onClick={converterEmUmOrcamento}
                disabled={salvando || !empresaAtiva || selecionados.length === 0}
                className="rounded-md bg-accent-success px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent-success/90 disabled:opacity-50"
              >
                {salvando ? 'Convertendo…' : `Converter em 1 Orçamento (${selecionados.length})`}
              </button>
              <button
                onClick={() => setMotivoAberto(true)}
                disabled={salvando || selecionados.length === 0}
                className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-muted hover:text-primary disabled:opacity-50"
              >
                Não converteu
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
