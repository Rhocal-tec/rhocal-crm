// Monta a "Fila do dia" do módulo CS: coloca cada cliente na fase certa pela
// contagem de dias desde a última compra (e entrega/reposição), aplica as
// regras de saída da fila e de nova tentativa e ordena por prioridade.
import type { ClienteInteligencia } from '@/lib/inteligencia/agregar'
import type { Database } from '@/types/database'
import { CONFIG_PADRAO, FASES_ORDEM, type FaseCS } from './constantes'

export type ContatoCS = Database['public']['Tables']['cs_contatos']['Row']

export interface ItemFila {
  cliente: ClienteInteligencia
  fase: FaseCS
  detalhe: string
  tentativasSemRetorno: number
  sugerirLigacao: boolean
  // Já houve tentativa sem retorno hoje: continua na lista, mas vai para o fim.
  tentadoHoje: boolean
}

const MS_DIA = 86_400_000

export function diasEntre(deIso: string, ate: Date): number {
  return Math.floor((ate.getTime() - new Date(deIso).getTime()) / MS_DIA)
}

export function adicionarDiasUteis(data: Date, dias: number): Date {
  const r = new Date(data)
  let restantes = dias
  while (restantes > 0) {
    r.setDate(r.getDate() + 1)
    const d = r.getDay()
    if (d !== 0 && d !== 6) restantes -= 1
  }
  return r
}

export function inicioDoDia(agora: Date): Date {
  const d = new Date(agora)
  d.setHours(0, 0, 0, 0)
  return d
}

export function montarFila(params: {
  clientes: ClienteInteligencia[]
  contatos: ContatoCS[]
  chavesComReclamacaoAberta: Set<string>
  // Data prevista de reposição (YYYY-MM-DD) mais recente informada por cliente.
  reposicaoPorCliente: Record<string, string>
  // Entrega mais recente (ISO) por cliente, a partir dos marcos do pedido.
  ultimaEntregaPorCliente: Record<string, string>
  config: Record<string, number>
  agora: Date
}): ItemFila[] {
  const { clientes, contatos, chavesComReclamacaoAberta, reposicaoPorCliente, ultimaEntregaPorCliente, agora } = params
  const cfg = { ...CONFIG_PADRAO, ...params.config }

  const contatosPorCliente = new Map<string, ContatoCS[]>()
  for (const c of contatos) {
    const lista = contatosPorCliente.get(c.cliente_chave) ?? []
    lista.push(c)
    contatosPorCliente.set(c.cliente_chave, lista)
  }

  const itens: ItemFila[] = []

  for (const cliente of clientes) {
    if (!cliente.ultimaCompra || cliente.diasDesdeUltimaCompra === null) continue
    const d = cliente.diasDesdeUltimaCompra
    const meus = contatosPorCliente.get(cliente.chave) ?? []

    // Contatos de uma fase a partir de uma data de referência (ex: última compra).
    const naFase = (fase: FaseCS, desdeIso: string) =>
      meus
        .filter((c) => c.fase === fase && c.criado_em >= desdeIso && c.status !== 'em_andamento')
        .sort((a, b) => b.criado_em.localeCompare(a.criado_em))

    // Regras da fila:
    //  - respondeu / reclamação aberta = CONCLUSÃO: sai da lista nesta fase;
    //  - sem retorno: o cliente NÃO sai — continua na lista (vai para o fim
    //    enquanto não for tentado de novo) e a tentativa conta no dia;
    //  - repassado: sai só por hoje e volta no dia seguinte;
    //  - nada some para sempre sem uma conclusão.
    const inicioHoje = inicioDoDia(agora).toISOString()
    const avaliar = (
      fase: FaseCS,
      desdeIso: string,
    ): { ok: boolean; tentativas: number; sugerirLigacao: boolean; tentadoHoje: boolean } => {
      const lista = naFase(fase, desdeIso)
      const fora = { ok: false, tentativas: 0, sugerirLigacao: false, tentadoHoje: false }
      if (lista.some((c) => c.status === 'respondeu' || c.status === 'reclamacao_aberta')) return fora
      if (lista.some((c) => c.status === 'repassado' && c.criado_em >= inicioHoje)) return fora
      const semRetorno = lista.filter((c) => c.status === 'sem_retorno')
      return {
        ok: true,
        tentativas: semRetorno.length,
        sugerirLigacao: semRetorno.length >= 2,
        tentadoHoje: semRetorno.some((c) => c.criado_em >= inicioHoje),
      }
    }

    let escolhido: ItemFila | null = null
    const cria = (
      fase: FaseCS,
      detalhe: string,
      a: { tentativas: number; sugerirLigacao: boolean; tentadoHoje?: boolean },
    ) => ({
      cliente,
      fase,
      detalhe,
      tentativasSemRetorno: a.tentativas,
      sugerirLigacao: a.sugerirLigacao,
      tentadoHoje: a.tentadoHoje ?? false,
    })

    // 1) Reclamação aberta
    if (chavesComReclamacaoAberta.has(cliente.chave)) {
      escolhido = cria('reclamacao', 'Reclamação em aberto', { tentativas: 0, sugerirLigacao: false })
    }

    // 2) Recompra programada: 7 dias antes da data de reposição informada
    if (!escolhido) {
      const reposicao = reposicaoPorCliente[cliente.chave]
      if (reposicao) {
        const entra = new Date(`${reposicao}T00:00:00`)
        entra.setDate(entra.getDate() - cfg.recompra_antecedencia)
        const compraDepois = new Date(cliente.ultimaCompra) > entra
        if (agora >= entra && !compraDepois) {
          const a = avaliar('recompra', entra.toISOString())
          if (a.ok) {
            escolhido = cria('recompra', `Reposição prevista para ${reposicao.split('-').reverse().join('/')}`, a)
          }
        }
      }
    }

    // 3) Pós-entrega: 1 a 3 dias depois da entrega registrada
    if (!escolhido) {
      const entrega = ultimaEntregaPorCliente[cliente.chave]
      if (entrega) {
        const de = diasEntre(entrega, agora)
        if (de >= cfg.pos_entrega_inicio && de <= cfg.pos_entrega_fim) {
          const a = avaliar('pos_entrega', entrega)
          if (a.ok) escolhido = cria('pos_entrega', `Entregue há ${de} dia(s)`, a)
        }
      }
    }

    // 4) Percepção: 15 a 45 dias após a compra
    if (!escolhido && d >= cfg.percepcao_inicio && d <= cfg.percepcao_fim) {
      const a = avaliar('percepcao', cliente.ultimaCompra)
      if (a.ok) escolhido = cria('percepcao', `Comprou há ${d} dias`, a)
    }

    // 5) Alerta de inatividade: 46 a 59 dias sem compra
    if (!escolhido && d >= cfg.alerta_inicio && d <= cfg.alerta_fim) {
      const a = avaliar('alerta', cliente.ultimaCompra)
      if (a.ok) escolhido = cria('alerta', `${d} dias sem comprar`, a)
    }

    // 6) Recuperação: 60 dias ou mais sem compra
    if (!escolhido && d >= cfg.recuperacao_inicio) {
      const a = avaliar('recuperacao', cliente.ultimaCompra)
      if (a.ok) escolhido = cria('recuperacao', `${d} dias sem comprar`, a)
    }

    if (escolhido) itens.push(escolhido)
  }

  return itens.sort((a, b) => {
    if (a.tentadoHoje !== b.tentadoHoje) return a.tentadoHoje ? 1 : -1
    const pa = FASES_ORDEM.indexOf(a.fase)
    const pb = FASES_ORDEM.indexOf(b.fase)
    if (pa !== pb) return pa - pb
    const da = a.cliente.diasDesdeUltimaCompra ?? 0
    const db = b.cliente.diasDesdeUltimaCompra ?? 0
    // Percepção: mais recentes primeiro; demais: mais tempo parado primeiro.
    return a.fase === 'percepcao' || a.fase === 'pos_entrega' ? da - db : db - da
  })
}
