'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import { diasAPartirDeHoje } from '@/lib/recompra/prazo'
import { MOTIVO_PERDA_OPCOES } from '@/lib/kanban/status'
import type { Database } from '@/types/database'

type RecompraPrevisao = Database['public']['Views']['v_recompra_priorizada']['Row']
type ItemAssociado = Database['public']['Tables']['itens_associados']['Row']

const CONFIABILIDADE_LABEL: Record<string, string> = {
  alta: 'Confiabilidade alta',
  media: 'Confiabilidade média',
  baixa: 'Confiabilidade baixa',
}

const CONFIABILIDADE_CLASSES: Record<string, string> = {
  alta: 'border-accent-success/40 bg-accent-success/15 text-accent-success',
  media: 'border-accent-alert/40 bg-accent-alert/15 text-accent-alert',
  baixa: 'border-white/15 bg-white/5 text-muted',
}

// Botão "Converter em Orçamento" segue o mesmo padrão de
// src/components/oportunidades/ConverterEmOrcamentoSection.tsx (fase 31):
// insere em `pedidos` com os dados do cliente pré-preenchidos, depois marca
// a origem (aqui, a previsão de recompra) como convertida, vinculando via
// pedido_id — mesma dupla escrita, mesmo tratamento de erro parcial.
export function RecompraCard({
  previsao,
  crossSell,
  onAtualizada,
}: {
  previsao: RecompraPrevisao
  crossSell: ItemAssociado[]
  onAtualizada: (previsao: RecompraPrevisao) => void
}) {
  const { user } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pedidoNumero, setPedidoNumero] = useState<number | null>(null)
  const [motivoAberto, setMotivoAberto] = useState(false)
  const [motivo, setMotivo] = useState('')

  const dias = diasAPartirDeHoje(previsao.data_prevista_recompra)
  const atrasado = dias < 0
  const emAberto = previsao.status === 'pendente' || previsao.status === 'contatado'

  async function marcarContatado() {
    setSalvando(true)
    setErro(null)
    const { error } = await supabase
      .from('recompra_previsao')
      .update({ status: 'contatado' })
      .eq('id', previsao.id)
    setSalvando(false)
    if (error) {
      setErro('Não foi possível marcar como contatado. Tente novamente.')
      return
    }
    onAtualizada({ ...previsao, status: 'contatado' })
  }

  async function converterEmOrcamento() {
    if (!user || !empresaAtiva) return
    const confirmado = window.confirm(
      `Criar um novo Orçamento para ${previsao.cliente_nome} (${previsao.item_nome})?`,
    )
    if (!confirmado) return

    setSalvando(true)
    setErro(null)

    const { data: pedido, error: erroPedido } = await supabase
      .from('pedidos')
      .insert({
        cliente_nome: previsao.cliente_nome,
        cliente_cnpj: previsao.cliente_cnpj,
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

    const { error: erroPrevisao } = await supabase
      .from('recompra_previsao')
      .update({ status: 'convertido', pedido_id: pedido.id })
      .eq('id', previsao.id)

    setSalvando(false)

    if (erroPrevisao) {
      setErro(
        `Orçamento #${pedido.numero} criado, mas houve um erro ao vincular a previsão. Atualize a página.`,
      )
      return
    }

    setPedidoNumero(pedido.numero)
    onAtualizada({ ...previsao, status: 'convertido', pedido_id: pedido.id })
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
      .update({ status: 'nao_converteu', motivo_nao_conversao: motivo })
      .eq('id', previsao.id)

    setSalvando(false)

    if (error) {
      setErro('Não foi possível salvar. Tente novamente.')
      return
    }

    onAtualizada({ ...previsao, status: 'nao_converteu', motivo_nao_conversao: motivo })
    setMotivoAberto(false)
  }

  return (
    <div
      className={`rounded-lg border p-3 shadow-sm ${
        previsao.ca_vencendo
          ? 'border-accent-danger/50 bg-accent-danger/5'
          : atrasado
            ? 'border-accent-alert/50 bg-accent-alert/5'
            : 'border-white/10 bg-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-primary">{previsao.cliente_nome}</p>
          <p className="truncate text-xs text-primary/70">{previsao.item_nome}</p>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            CONFIABILIDADE_CLASSES[previsao.confiabilidade] ?? CONFIABILIDADE_CLASSES.baixa
          }`}
        >
          {CONFIABILIDADE_LABEL[previsao.confiabilidade] ?? previsao.confiabilidade}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`text-xs ${atrasado ? 'font-medium text-accent-alert' : 'text-muted'}`}>
          {atrasado
            ? `Atrasado — previsto para ${formatarDataSomente(previsao.data_prevista_recompra)} (${Math.abs(dias)}d atrás)`
            : `Previsto para ${formatarDataSomente(previsao.data_prevista_recompra)} (em ${dias}d)`}
        </span>
        {previsao.ca_vencendo && (
          <span className="inline-flex rounded-full border border-accent-danger/40 bg-accent-danger/15 px-2 py-0.5 text-[10px] font-semibold text-accent-danger">
            CA vencendo{previsao.ca ? ` (${previsao.ca})` : ''}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm font-medium text-primary">
        {formatarMoeda(previsao.valor_estimado_pedido)}
      </p>

      {previsao.texto_sugerido_ia && (
        <p className="mt-2 rounded-md bg-white/5 px-2 py-1.5 text-xs text-primary/80">
          “{previsao.texto_sugerido_ia}”
        </p>
      )}

      {crossSell.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {crossSell.map((item) => (
            <span
              key={item.item_codigo_associado}
              title={`Compra junto em ${item.frequencia_conjunta}% dos pedidos`}
              className="inline-flex rounded-full bg-accent-compras/10 px-2 py-0.5 text-[10px] text-accent-compras"
            >
              + {item.nome_associado}
            </span>
          ))}
        </div>
      )}

      {erro && <p className="mt-2 text-xs text-accent-danger">{erro}</p>}

      {previsao.status === 'convertido' ? (
        <div className="mt-3 rounded-md border border-accent-success/30 bg-accent-success/10 px-2 py-1.5 text-xs text-accent-success">
          ✓ Convertido —{' '}
          <Link href="/dashboard" className="underline">
            {pedidoNumero !== null ? `Orçamento #${pedidoNumero}` : 'ver no Kanban'}
          </Link>
        </div>
      ) : previsao.status === 'nao_converteu' ? (
        <div className="mt-3 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-muted">
          Não converteu — {previsao.motivo_nao_conversao}
        </div>
      ) : (
        emAberto && (
          <div className="mt-3">
            {motivoAberto ? (
              <div className="rounded-md border border-white/10 bg-white/5 p-2">
                <select
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="input-field w-full rounded-md px-2 py-1.5 text-xs"
                >
                  <option value="">Selecione o motivo…</option>
                  {MOTIVO_PERDA_OPCOES.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={confirmarNaoConverteu}
                    disabled={salvando}
                    className="rounded-md bg-accent-danger px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {salvando ? 'Salvando…' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => {
                      setMotivoAberto(false)
                      setMotivo('')
                      setErro(null)
                    }}
                    disabled={salvando}
                    className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted hover:text-primary"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {previsao.status === 'pendente' && (
                  <button
                    onClick={marcarContatado}
                    disabled={salvando}
                    className="rounded-md border border-accent-compras/40 bg-accent-compras/10 px-2.5 py-1.5 text-xs font-medium text-accent-compras transition-colors hover:bg-accent-compras/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Contatado
                  </button>
                )}
                <button
                  onClick={converterEmOrcamento}
                  disabled={salvando || !empresaAtiva}
                  className="rounded-md bg-accent-success px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-success/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {salvando ? 'Convertendo…' : 'Converter em Orçamento'}
                </button>
                <button
                  onClick={() => setMotivoAberto(true)}
                  disabled={salvando}
                  className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-primary"
                >
                  Não converteu
                </button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}
