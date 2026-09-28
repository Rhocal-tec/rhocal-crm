'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { MOTIVO_PERDA_OPCOES } from '@/lib/kanban/status'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { diasSemMovimentacao, estaCritico, estaParado } from '@/lib/kanban/dias-parado'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import { TEMPERATURA_CARD_CORES } from '@/lib/oportunidades/temperatura-cores'
import type { Database } from '@/types/database'

type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

export function OportunidadeCard({
  oportunidade,
  onAbrir,
  nomesPorId,
}: {
  oportunidade: Oportunidade
  onAbrir: (id: string) => void
  nomesPorId: Record<string, string>
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())

  // Fase 42: "Encerrar" rápido no card, mesmo padrão de motivo obrigatório do
  // MarcarOportunidadePerdidaSection (fase 13/31), só que inline no card em
  // vez de dentro do modal de detalhe — pra não precisar abrir o modal
  // inteiro só pra marcar uma oportunidade como perdida. Atualiza direto no
  // banco; o card some da coluna sozinho via Realtime (FunilBoard já filtra
  // GANHO/PERDIDO/INATIVA do estado ativo), sem precisar de callback local.
  const [encerrarAberto, setEncerrarAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [detalhes, setDetalhes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Fase 37.3: crítico (7+ dias) tem precedência sobre o alerta âmbar padrão
  // (3+ dias) — mesmo padrão de precedência já usado no card de Pedidos
  // entre "cotação atrasada" e o alerta âmbar de 3 dias.
  const critico = estaCritico(oportunidade.ultima_movimentacao)
  const parado = !critico && estaParado(oportunidade.ultima_movimentacao)
  const dias = diasSemMovimentacao(oportunidade.ultima_movimentacao)
  const nomeUltimoResponsavel = nomesPorId[oportunidade.movido_por ?? oportunidade.criado_por]
  const nomeResponsavel = nomesPorId[oportunidade.criado_por]
  const corTemperatura = oportunidade.temperatura ? TEMPERATURA_CARD_CORES[oportunidade.temperatura] : undefined
  // Fase 38: badge "Fecha DD/MM" — formata só dia/mês (sem passar por Date,
  // mesmo cuidado de fuso já usado em formatarDataSomente).
  const previsaoFechamentoLabel = (() => {
    if (!oportunidade.previsao_fechamento) return null
    const [, mes, dia] = oportunidade.previsao_fechamento.slice(0, 10).split('-')
    if (!mes || !dia) return null
    return `Fecha ${dia}/${mes}`
  })()
  const produtoServicoTruncado =
    oportunidade.produto_servico && oportunidade.produto_servico.length > 40
      ? `${oportunidade.produto_servico.slice(0, 40)}…`
      : oportunidade.produto_servico

  function cancelarEncerrar(e: React.MouseEvent) {
    e.stopPropagation()
    setEncerrarAberto(false)
    setMotivo('')
    setDetalhes('')
    setErro(null)
  }

  async function confirmarEncerrar(e: React.MouseEvent) {
    e.stopPropagation()
    if (!motivo) {
      setErro('Selecione o motivo.')
      return
    }

    setSalvando(true)
    setErro(null)

    const motivoFinal = detalhes.trim() ? `${motivo} — ${detalhes.trim()}` : motivo

    const { error } = await supabase
      .from('oportunidades')
      .update({ status: 'PERDIDO', motivo_perda: motivoFinal })
      .eq('id', oportunidade.id)

    setSalvando(false)

    if (error) {
      setErro('Não foi possível encerrar. Tente novamente.')
      return
    }
    // Sem estado local pra limpar — o card some sozinho via Realtime.
  }

  return (
    <div
      onClick={() => onAbrir(oportunidade.id)}
      className={`cursor-pointer rounded-lg border p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        critico
          ? 'border-accent-danger/60 bg-accent-danger/10'
          : parado
            ? 'border-accent-alert/60 bg-accent-alert/10'
            : 'border-white/10 bg-surface'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-primary">
          Oportunidade #{oportunidade.numero}
        </span>
        {corTemperatura && (
          <span
            aria-hidden
            title={oportunidade.temperatura ?? undefined}
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: corTemperatura }}
          />
        )}
      </div>
      <p className="mt-1 truncate text-sm text-primary/80">{oportunidade.cliente_nome}</p>
      {produtoServicoTruncado && (
        <p className="mt-0.5 truncate text-xs text-muted">{produtoServicoTruncado}</p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-muted">
          {OPORTUNIDADE_STATUS_LABELS[oportunidade.status]}
        </span>
        {oportunidade.valor_estimado !== null && (
          <span className="font-mono text-xs font-medium text-primary/80">
            {formatarMoeda(oportunidade.valor_estimado)}
          </span>
        )}
      </div>
      {previsaoFechamentoLabel && (
        <span className="mt-1.5 inline-flex rounded-full border border-accent-compras/40 bg-accent-compras/15 px-2 py-0.5 text-xs font-medium text-accent-compras">
          {previsaoFechamentoLabel}
        </span>
      )}
      {(critico || parado) && (
        <p className={`mt-1.5 text-xs font-medium ${critico ? 'text-accent-danger' : 'text-accent-alert'}`}>
          {dias}d parado
        </p>
      )}
      {nomeResponsavel && (
        <p className="mt-1 truncate text-[11px] text-muted/80">
          Contato feito por: {nomeResponsavel}
        </p>
      )}
      {nomeUltimoResponsavel && (
        <p className="mt-1 truncate text-[11px] text-muted/80">
          Movido por {nomeUltimoResponsavel}
        </p>
      )}

      {!encerrarAberto ? (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setEncerrarAberto(true)
            }}
            className="w-full rounded-md border border-accent-danger/30 py-1.5 text-xs font-medium text-accent-danger/80 transition-colors hover:bg-accent-danger/10 hover:text-accent-danger"
          >
            Encerrar
          </button>
        </div>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-2.5 rounded-md border border-accent-danger/30 bg-accent-danger/5 p-2"
        >
          <p className="text-xs font-medium text-primary">Encerrar como perdida</p>
          <div className="mt-1.5 flex flex-col gap-1.5">
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="input-field rounded-md px-2 py-1.5 text-xs"
            >
              <option value="">Selecione o motivo…</option>
              {MOTIVO_PERDA_OPCOES.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
            <textarea
              value={detalhes}
              onChange={(e) => setDetalhes(e.target.value)}
              placeholder="Detalhes (opcional)"
              rows={2}
              className="input-field rounded-md px-2 py-1.5 text-xs"
            />
          </div>
          {erro && <p className="mt-1.5 text-[11px] text-accent-danger">{erro}</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confirmarEncerrar}
              disabled={salvando}
              className="flex-1 rounded-md bg-accent-danger py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? 'Salvando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={cancelarEncerrar}
              disabled={salvando}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:text-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
