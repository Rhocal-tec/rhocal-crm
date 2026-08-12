'use client'

import { TEMPERATURA_AUTOMATICA_LABELS, type TemperaturaAutomatica } from '@/lib/inteligencia/agregar'
import { TEMPERATURA_AUTOMATICA_BADGE_CLASSES } from '@/lib/inteligencia/temperatura-cores'
import { OPORTUNIDADE_STATUS_LABELS, ORIGEM_OPCOES } from '@/lib/oportunidades/status'
import type { OportunidadeStatus } from '@/types/database'

export type FaixaTicket = '' | 'ate_1k' | '1k_5k' | 'acima_5k'
export type FaixaFrequencia = '' | '1x' | '2_5x' | '6x_mais'
export type FaixaUltimaCompra = '' | '30' | '60' | '90' | '180' | 'nunca'
export type FaixaScore = '' | 'alto' | 'medio' | 'baixo'

export interface FiltrosState {
  temperaturasAutomaticas: Set<TemperaturaAutomatica>
  temperaturaManual: string
  cidade: string
  uf: string
  etapaFunil: OportunidadeStatus | ''
  origem: string
  faixaTicket: FaixaTicket
  faixaFrequencia: FaixaFrequencia
  faixaUltimaCompra: FaixaUltimaCompra
  vendedorId: string
  faixaScore: FaixaScore
}

export function filtrosVazios(): FiltrosState {
  return {
    temperaturasAutomaticas: new Set(),
    temperaturaManual: '',
    cidade: '',
    uf: '',
    etapaFunil: '',
    origem: '',
    faixaTicket: '',
    faixaFrequencia: '',
    faixaUltimaCompra: '',
    vendedorId: '',
    faixaScore: '',
  }
}

const TODAS_TEMPERATURAS: TemperaturaAutomatica[] = ['verde', 'amarelo', 'vermelho', 'cinza']
const TODAS_ETAPAS = Object.keys(OPORTUNIDADE_STATUS_LABELS) as OportunidadeStatus[]

// Valores fixos sugeridos (fase 35) — a coluna `oportunidades.temperatura` é
// texto livre (fase 31), então isso é só um atalho: qualquer outro valor
// encontrado nos dados também aparece na lista, mesclado com estes três.
const TEMPERATURA_MANUAL_SUGERIDAS = ['Quente', 'Morno', 'Frio']

// Exportadas (não só usadas aqui) — reaproveitadas pelo resumo legível de
// filtros salvos na sub-aba Campanhas (fase 36.3).
export const FAIXAS_TICKET: { valor: FaixaTicket; rotulo: string }[] = [
  { valor: 'ate_1k', rotulo: 'Até R$ 1.000' },
  { valor: '1k_5k', rotulo: 'R$ 1.000 – R$ 5.000' },
  { valor: 'acima_5k', rotulo: 'Acima de R$ 5.000' },
]

export const FAIXAS_FREQUENCIA: { valor: FaixaFrequencia; rotulo: string }[] = [
  { valor: '1x', rotulo: '1 pedido' },
  { valor: '2_5x', rotulo: '2 a 5 pedidos' },
  { valor: '6x_mais', rotulo: '6 pedidos ou mais' },
]

export const FAIXAS_ULTIMA_COMPRA: { valor: FaixaUltimaCompra; rotulo: string }[] = [
  { valor: '30', rotulo: 'Últimos 30 dias' },
  { valor: '60', rotulo: 'Últimos 60 dias' },
  { valor: '90', rotulo: 'Últimos 90 dias' },
  { valor: '180', rotulo: 'Últimos 180 dias' },
  { valor: 'nunca', rotulo: 'Nunca comprou' },
]

// Fase 36.1 — mesmas faixas do badge de score (verde 70-100 / amarelo 40-69
// / vermelho 0-39), com rótulo "Alto/Médio/Baixo" (SCORE_PROPENSAO_LABELS).
export const FAIXAS_SCORE: { valor: Exclude<FaixaScore, ''>; rotulo: string }[] = [
  { valor: 'alto', rotulo: 'Alto (70-100)' },
  { valor: 'medio', rotulo: 'Médio (40-69)' },
  { valor: 'baixo', rotulo: 'Baixo (0-39)' },
]

export function FiltrosInteligencia({
  filtros,
  onChange,
  opcoes,
}: {
  filtros: FiltrosState
  onChange: (novo: FiltrosState) => void
  opcoes: {
    temperaturasManuais: string[]
    origens: string[]
    ufs: string[]
    vendedores: { id: string; nome: string }[]
  }
}) {
  function atualizar<K extends keyof FiltrosState>(campo: K, valor: FiltrosState[K]) {
    onChange({ ...filtros, [campo]: valor })
  }

  function alternarTemperatura(temp: TemperaturaAutomatica) {
    const novo = new Set(filtros.temperaturasAutomaticas)
    if (novo.has(temp)) novo.delete(temp)
    else novo.add(temp)
    atualizar('temperaturasAutomaticas', novo)
  }

  const origensDisponiveis = Array.from(new Set([...ORIGEM_OPCOES, ...opcoes.origens])).sort()
  const temperaturasManuaisDisponiveis = Array.from(
    new Set([...TEMPERATURA_MANUAL_SUGERIDAS, ...opcoes.temperaturasManuais]),
  )

  const filtrosAtivos =
    filtros.temperaturasAutomaticas.size > 0 ||
    filtros.temperaturaManual !== '' ||
    filtros.etapaFunil !== '' ||
    filtros.origem !== '' ||
    filtros.faixaTicket !== '' ||
    filtros.faixaFrequencia !== '' ||
    filtros.faixaUltimaCompra !== '' ||
    filtros.cidade !== '' ||
    filtros.uf !== '' ||
    filtros.vendedorId !== '' ||
    filtros.faixaScore !== ''

  return (
    <div className="rounded-lg border border-white/10 bg-surface p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Temperatura automática</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TODAS_TEMPERATURAS.map((temp) => {
            const ativo = filtros.temperaturasAutomaticas.has(temp)
            return (
              <button
                key={temp}
                type="button"
                onClick={() => alternarTemperatura(temp)}
                aria-pressed={ativo}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  ativo
                    ? TEMPERATURA_AUTOMATICA_BADGE_CLASSES[temp]
                    : 'border-white/10 bg-white/5 text-muted hover:text-primary'
                }`}
              >
                {TEMPERATURA_AUTOMATICA_LABELS[temp]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <label className="block text-xs text-muted">Temperatura manual</label>
          <select
            value={filtros.temperaturaManual}
            onChange={(e) => atualizar('temperaturaManual', e.target.value)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {temperaturasManuaisDisponiveis.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted">Etapa do funil</label>
          <select
            value={filtros.etapaFunil}
            onChange={(e) => atualizar('etapaFunil', e.target.value as OportunidadeStatus | '')}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {TODAS_ETAPAS.map((status) => (
              <option key={status} value={status}>
                {OPORTUNIDADE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted">Origem</label>
          <select
            value={filtros.origem}
            onChange={(e) => atualizar('origem', e.target.value)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {origensDisponiveis.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted">Vendedor</label>
          <select
            value={filtros.vendedorId}
            onChange={(e) => atualizar('vendedorId', e.target.value)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {opcoes.vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted">Última compra</label>
          <select
            value={filtros.faixaUltimaCompra}
            onChange={(e) => atualizar('faixaUltimaCompra', e.target.value as FaixaUltimaCompra)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {FAIXAS_ULTIMA_COMPRA.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted">Frequência de compra</label>
          <select
            value={filtros.faixaFrequencia}
            onChange={(e) => atualizar('faixaFrequencia', e.target.value as FaixaFrequencia)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {FAIXAS_FREQUENCIA.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted">Ticket médio</label>
          <select
            value={filtros.faixaTicket}
            onChange={(e) => atualizar('faixaTicket', e.target.value as FaixaTicket)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {FAIXAS_TICKET.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted">Score de propensão</label>
          <select
            value={filtros.faixaScore}
            onChange={(e) => atualizar('faixaScore', e.target.value as FaixaScore)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {FAIXAS_SCORE.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted">Cidade</label>
          <input
            type="text"
            value={filtros.cidade}
            onChange={(e) => atualizar('cidade', e.target.value)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            placeholder="Contém…"
          />
        </div>

        <div>
          <label className="block text-xs text-muted">UF</label>
          <select
            value={filtros.uf}
            onChange={(e) => atualizar('uf', e.target.value)}
            className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {opcoes.ufs.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtrosAtivos && (
        <button
          type="button"
          onClick={() => onChange(filtrosVazios())}
          className="mt-3 text-xs font-medium text-accent-compras hover:text-primary"
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}

// Fase 36.3: snapshot dos filtros salvo em `campanhas.filtros_aplicados`
// (jsonb) — Set não serializa em JSON.stringify, por isso vira array aqui.
export function serializarFiltros(filtros: FiltrosState): Record<string, unknown> {
  return {
    temperaturasAutomaticas: Array.from(filtros.temperaturasAutomaticas),
    temperaturaManual: filtros.temperaturaManual,
    cidade: filtros.cidade,
    uf: filtros.uf,
    etapaFunil: filtros.etapaFunil,
    origem: filtros.origem,
    faixaTicket: filtros.faixaTicket,
    faixaFrequencia: filtros.faixaFrequencia,
    faixaUltimaCompra: filtros.faixaUltimaCompra,
    vendedorId: filtros.vendedorId,
    faixaScore: filtros.faixaScore,
  }
}

const ROTULO_FAIXA_TICKET = Object.fromEntries(FAIXAS_TICKET.map((f) => [f.valor, f.rotulo]))
const ROTULO_FAIXA_FREQUENCIA = Object.fromEntries(FAIXAS_FREQUENCIA.map((f) => [f.valor, f.rotulo]))
const ROTULO_FAIXA_ULTIMA_COMPRA = Object.fromEntries(FAIXAS_ULTIMA_COMPRA.map((f) => [f.valor, f.rotulo]))
const ROTULO_FAIXA_SCORE = Object.fromEntries(FAIXAS_SCORE.map((f) => [f.valor, f.rotulo]))

// Resumo legível pra listagem de campanhas salvas (fase 36.3) — só mostra os
// campos que estavam preenchidos no momento do salvamento.
export function resumirFiltrosSalvos(json: Record<string, unknown> | null): string {
  if (!json) return 'Nenhum filtro aplicado'
  const partes: string[] = []

  const temps = Array.isArray(json.temperaturasAutomaticas) ? (json.temperaturasAutomaticas as string[]) : []
  if (temps.length > 0) {
    partes.push(
      `Temp.: ${temps.map((t) => TEMPERATURA_AUTOMATICA_LABELS[t as TemperaturaAutomatica] ?? t).join('/')}`,
    )
  }
  if (json.temperaturaManual) partes.push(`Temp. manual: ${json.temperaturaManual}`)
  if (json.etapaFunil) {
    partes.push(`Etapa: ${OPORTUNIDADE_STATUS_LABELS[json.etapaFunil as OportunidadeStatus] ?? json.etapaFunil}`)
  }
  if (json.origem) partes.push(`Origem: ${json.origem}`)
  if (json.faixaTicket) partes.push(`Ticket: ${ROTULO_FAIXA_TICKET[json.faixaTicket as string] ?? json.faixaTicket}`)
  if (json.faixaFrequencia) {
    partes.push(`Frequência: ${ROTULO_FAIXA_FREQUENCIA[json.faixaFrequencia as string] ?? json.faixaFrequencia}`)
  }
  if (json.faixaUltimaCompra) {
    partes.push(
      `Última compra: ${ROTULO_FAIXA_ULTIMA_COMPRA[json.faixaUltimaCompra as string] ?? json.faixaUltimaCompra}`,
    )
  }
  if (json.faixaScore) partes.push(`Score: ${ROTULO_FAIXA_SCORE[json.faixaScore as string] ?? json.faixaScore}`)
  if (json.cidade) partes.push(`Cidade: ${json.cidade}`)
  if (json.uf) partes.push(`UF: ${json.uf}`)
  if (json.vendedorId) partes.push('Vendedor filtrado')

  return partes.length > 0 ? partes.join(' · ') : 'Nenhum filtro aplicado'
}
