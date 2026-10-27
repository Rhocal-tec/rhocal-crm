'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  agregarClientesInteligencia,
  type AuditoriaPedidoBruta,
  type ClienteCadastroBruto,
  type ClienteInteligencia,
  type ItemBruto,
  type PedidoBruto,
} from '@/lib/inteligencia/agregar'
import type { Database } from '@/types/database'
import { CONFIG_PADRAO } from './constantes'
import type { ContatoCS } from './fila'

type Reclamacao = Database['public']['Tables']['cs_reclamacoes']['Row']
type Repasse = Database['public']['Tables']['cs_repasses']['Row']
type Pesquisa = Database['public']['Tables']['cs_pesquisas']['Row']

const TAMANHO_PAGINA = 1000
const TAMANHO_LOTE = 150

async function paginar<T>(
  buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const todos: T[] = []
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await buscar(de, de + TAMANHO_PAGINA - 1)
    if (error) throw error
    todos.push(...(data ?? []))
    if (!data || data.length < TAMANHO_PAGINA) return todos
  }
}

function emLotes<T>(lista: T[]): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += TAMANHO_LOTE) lotes.push(lista.slice(i, i + TAMANHO_LOTE))
  return lotes
}

export interface DadosCS {
  clientes: ClienteInteligencia[]
  contatos: ContatoCS[]
  pesquisas: Pesquisa[]
  reclamacoes: Reclamacao[]
  repasses: Repasse[]
  config: Record<string, number>
  nomesPorProfileId: Record<string, string>
  reposicaoPorCliente: Record<string, string>
  ultimaEntregaPorCliente: Record<string, string>
  // false quando a migração 0038 ainda não foi aplicada no banco.
  tabelasCS: boolean
}

const VAZIO: DadosCS = {
  clientes: [],
  contatos: [],
  pesquisas: [],
  reclamacoes: [],
  repasses: [],
  config: CONFIG_PADRAO,
  nomesPorProfileId: {},
  reposicaoPorCliente: {},
  ultimaEntregaPorCliente: {},
  tabelasCS: true,
}

// Carrega tudo que o módulo CS precisa: clientes agregados (mesma base da
// Inteligência), marcos dos pedidos (entrega) e as tabelas cs_*.
export function useDadosCS(empresaId: string | null) {
  const [supabase] = useState(() => createClient())
  const [dados, setDados] = useState<DadosCS>(VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])

  useEffect(() => {
    if (!empresaId) return
    let ativo = true

    async function carregar() {
      setErro(null)
      try {
        const pedidos = await paginar<PedidoBruto>((de, ate) =>
          supabase
            .from('pedidos')
            .select(
              'id, numero, cliente_nome, cliente_cnpj, cliente_omie_id, cliente_telefone, cliente_contato, status, criado_em, criado_por, valor_frete',
            )
            .eq('empresa_id', empresaId!)
            .order('id')
            .range(de, ate),
        )
        const idsPedidos = pedidos.map((p) => p.id)

        const itens: ItemBruto[] = []
        for (const lote of emLotes(idsPedidos)) {
          const { data, error } = await supabase
            .from('pedido_itens')
            .select('pedido_id, descricao, preco_venda, quantidade')
            .in('pedido_id', lote)
            .eq('excluido', false)
          if (error) throw error
          itens.push(...((data ?? []) as ItemBruto[]))
        }

        const [marcosResp, clientesCadastro, profilesResp, configResp] = await Promise.all([
          supabase.rpc('fn_pedidos_marcos', { p_empresa_id: empresaId! }).range(0, 4999),
          paginar<ClienteCadastroBruto>((de, ate) =>
            supabase
              .from('clientes')
              .select(
                'id, razao_social, nome_fantasia, cnpj, email, telefone, contato, cidade, estado, cep, observacoes, omie_cliente_id',
              )
              .order('id')
              .range(de, ate),
          ),
          supabase.from('profiles').select('id, nome'),
          supabase.from('cs_config').select('chave, valor'),
        ])
        if (marcosResp.error) throw marcosResp.error
        if (profilesResp.error) throw profilesResp.error

        const tabelasCS = !configResp.error
        const marcos = (marcosResp.data ?? []) as {
          pedido_id: string
          efetuado_em: string | null
          entregue_em: string | null
        }[]

        // "Última compra" = 1ª vez que o pedido chegou a PEDIDO_EFETUADO (marco).
        const auditoriaPedidos: AuditoriaPedidoBruta[] = marcos
          .filter((m) => m.efetuado_em)
          .map((m) => ({
            registro_id: m.pedido_id,
            data_hora: m.efetuado_em as string,
            status_depois: 'PEDIDO_EFETUADO',
          }))
        const entreguePorPedido = new Map(
          marcos.filter((m) => m.entregue_em).map((m) => [m.pedido_id, m.entregue_em as string]),
        )

        const nomesPorProfileId = Object.fromEntries((profilesResp.data ?? []).map((p) => [p.id, p.nome]))

        const clientes = agregarClientesInteligencia({
          pedidos,
          itens,
          auditoriaPedidos,
          oportunidades: [],
          tarefas: [],
          interacoes: [],
          clientesCadastro: clientesCadastro,
          nomesPorProfileId,
        })

        const ultimaEntregaPorCliente: Record<string, string> = {}
        for (const c of clientes) {
          for (const p of c.historicoPedidos) {
            const e = entreguePorPedido.get(p.id)
            if (e && (!ultimaEntregaPorCliente[c.chave] || e > ultimaEntregaPorCliente[c.chave])) {
              ultimaEntregaPorCliente[c.chave] = e
            }
          }
        }

        let contatos: ContatoCS[] = []
        let pesquisas: Pesquisa[] = []
        let reclamacoes: Reclamacao[] = []
        let repasses: Repasse[] = []
        const config: Record<string, number> = { ...CONFIG_PADRAO }

        if (tabelasCS) {
          for (const l of configResp.data ?? []) config[l.chave] = l.valor
          const [c, p, r, rp] = await Promise.all([
            paginar<ContatoCS>((de, ate) =>
              supabase
                .from('cs_contatos')
                .select('*')
                .eq('empresa_id', empresaId!)
                .order('criado_em', { ascending: false })
                .range(de, ate),
            ),
            paginar<Pesquisa>((de, ate) =>
              supabase.from('cs_pesquisas').select('*').order('criado_em', { ascending: false }).range(de, ate),
            ),
            paginar<Reclamacao>((de, ate) =>
              supabase
                .from('cs_reclamacoes')
                .select('*')
                .eq('empresa_id', empresaId!)
                .order('prazo_em', { ascending: true })
                .range(de, ate),
            ),
            paginar<Repasse>((de, ate) =>
              supabase
                .from('cs_repasses')
                .select('*')
                .eq('empresa_id', empresaId!)
                .order('criado_em', { ascending: false })
                .range(de, ate),
            ),
          ])
          contatos = c
          reclamacoes = r
          repasses = rp
          const idsContatos = new Set(c.map((x) => x.id))
          pesquisas = p.filter((x) => idsContatos.has(x.contato_id))
        }

        // Reposição prevista mais recente por cliente (da pesquisa mais nova que a informou).
        const contatoPorId = new Map(contatos.map((c) => [c.id, c]))
        const reposicaoPorCliente: Record<string, string> = {}
        for (const p of pesquisas) {
          if (!p.proxima_reposicao) continue
          const contato = contatoPorId.get(p.contato_id)
          if (!contato) continue
          const atual = reposicaoPorCliente[contato.cliente_chave]
          if (!atual || p.proxima_reposicao > atual) reposicaoPorCliente[contato.cliente_chave] = p.proxima_reposicao
        }

        if (!ativo) return
        setDados({
          clientes,
          contatos,
          pesquisas,
          reclamacoes,
          repasses,
          config,
          nomesPorProfileId,
          reposicaoPorCliente,
          ultimaEntregaPorCliente,
          tabelasCS,
        })
      } catch (err) {
        console.error('Erro ao carregar o módulo CS:', err)
        if (ativo) setErro('Não foi possível carregar os dados do CS. Tente novamente.')
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [supabase, empresaId, versao])

  return { dados, carregando, erro, recarregar }
}
