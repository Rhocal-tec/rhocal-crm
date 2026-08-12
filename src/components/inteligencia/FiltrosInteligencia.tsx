'use client'

import { TEMPERATURA_AUTOMATICA_LABELS, type TemperaturaAutomatica } from '@/lib/inteligencia/agregar'
import { TEMPERATURA_AUTOMATICA_BADGE_CLASSES } from '@/lib/inteligencia/temperatura-cores'
import { OPORTUNIDADE_STATUS_LABELS, ORIGEM_OPCOES } from '@/lib/oportunidades/status'
import type { OportunidadeStatus } from '@/types/database'

export type FaixaTicket = '' | 'ate_1k' | '1k_5k' | 'acima_5k'
export type FaixaFrequencia = '' | '1x' | '2_5x' | '6x_mais'
export type FaixaUltimaCompra = '' | '30' | '60' | '90' | '180' | 'nunca'

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
  }
}

const TODAS_TEMPERATURAS: TemperaturaAutomatica[] = ['verde', 'amarelo', 'vermelho', 'cinza']
const TODAS_ETAPAS = Object.keys(OPORTUNIDADE_STATUS_LABELS) as OportunidadeStatus[]

// Valores fixos sugeridos (fase 35) — a coluna `oportunidades.temperatura` é
// texto livre (fase 31), então isso é só um atalho: qualquer outro valor
// encontrado nos dados também aparece na lista, mesclado com estes três.
const TEMPERATURA_MANUAL_SUGERIDAS = ['Quente', 'Morno', 'Frio']

const FAIXAS_TICKET: { valor: FaixaTicket; rotulo: string }[] = [
  { valor: 'ate_1k', rotulo: 'Até R$ 1.000' },
  { valor: '1k_5k', rotulo: 'R$ 1.000 – R$ 5.000' },
  { valor: 'acima_5k', rotulo: 'Acima de R$ 5.000' },
]

const FAIXAS_FREQUENCIA: { valor: FaixaFrequencia; rotulo: string }[] = [
  { valor: '1x', rotulo: '1 pedido' },
  { valor: '2_5x', rotulo: '2 a 5 pedidos' },
  { valor: '6x_mais', rotulo: '6 pedidos ou mais' },
]

const FAIXAS_ULTIMA_COMPRA: { valor: FaixaUltimaCompra; rotulo: string }[] = [
  { valor: '30', rotulo: 'Últimos 30 dias' },
  { valor: '60', rotulo: 'Últimos 60 dias' },
  { valor: '90', rotulo: 'Últimos 90 dias' },
  { valor: '180', rotulo: 'Últimos 180 dias' },
  { valor: 'nunca', rotulo: 'Nunca comprou' },
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
    filtros.vendedorId !== ''

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
