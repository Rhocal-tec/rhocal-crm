import { NextResponse } from 'next/server'
import { timingSafeEqual, createHash } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { STATUS_LABELS } from '@/lib/kanban/status'

// Helpers compartilhados pelas rotas /api/bridge/* (CRM WhatsApp).
// Sem sessão de usuário: client admin (service role) + BRIDGE_SECRET.

export function segredoValido(recebido: string | null): boolean {
  const esperado = process.env.BRIDGE_SECRET
  if (!esperado || !recebido) return false
  // Hash antes de comparar: tamanhos iguais, tempo constante.
  const a = createHash('sha256').update(recebido).digest()
  const b = createHash('sha256').update(esperado).digest()
  return timingSafeEqual(a, b)
}

export const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

export function variantesCnpj(d: string): string[] {
  const v = [d]
  if (d.length === 14) {
    v.push(`${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`)
  }
  return v
}

export function respostaNaoAutorizada() {
  return new NextResponse(null, { status: 401 })
}

export function clienteAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

export function origemApp(url: URL) {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || url.origin
}

type OppRow = {
  id: string
  numero: number
  produto_servico: string | null
  status: string
  valor_estimado: number | null
  temperatura: string | null
  criado_por: string
  ultima_movimentacao: string
  criado_em: string
}
type PedRow = {
  id: string
  numero: number
  status: string
  valor_frete: number | null
  criado_por: string
  criado_em: string
  ultima_movimentacao: string
  entregue_em: string | null
  pedido_itens: Array<{ preco_venda: number | null; quantidade: number; excluido: boolean }> | null
}

// Monta o payload completo (mesmo formato de sempre) para os ids de cliente.
export async function montarClientes(supabase: SupabaseClient, ids: string[], origem: string) {
  const { data: clientesDb } = await supabase
    .from('clientes')
    .select('id, razao_social, nome_fantasia, cnpj, cidade, estado, omie_cliente_id')
    .in('id', ids.slice(0, 10))

  return Promise.all(
  (clientesDb ?? []).map(async (c) => {
      const cd = soDigitos(c.cnpj)
      const porCnpjOpp = cd.length >= 11 ? variantesCnpj(cd).map((v) => `cliente_cnpj.eq.${v}`) : []
      const nomeSeguro = c.razao_social.replace(/[,()"]/g, ' ')
      const filtroOpp = [...porCnpjOpp, `cliente_nome.eq.${nomeSeguro}`].join(',')
      const filtroPed = [
        ...porCnpjOpp,
        ...(c.omie_cliente_id ? [`cliente_omie_id.eq.${c.omie_cliente_id}`] : []),
      ]

      const [opps, peds, recompra] = await Promise.all([
        supabase
          .from('oportunidades')
          .select('id, numero, produto_servico, status, valor_estimado, temperatura, criado_por, ultima_movimentacao, criado_em')
          .or(filtroOpp)
          .order('criado_em', { ascending: false })
          .limit(30),
        filtroPed.length
          ? supabase
              .from('pedidos')
              .select('id, numero, status, valor_frete, criado_por, criado_em, ultima_movimentacao, entregue_em, pedido_itens(preco_venda, quantidade, excluido)')
              .or(filtroPed.join(','))
              .order('criado_em', { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [] }),
        c.omie_cliente_id
          ? supabase
              .from('v_recompra_priorizada')
              .select('item_nome, data_prevista_recompra')
              .eq('cliente_omie_codigo', String(c.omie_cliente_id))
              .eq('status', 'pendente')
              .order('data_prevista_recompra', { ascending: true })
              .limit(5)
          : Promise.resolve({ data: [] }),
      ])

      const oppsRows = (opps.data ?? []) as OppRow[]
      const pedsRows = (peds.data ?? []) as unknown as PedRow[]
      const rec = (recompra.data ?? []) as Array<{ item_nome: string; data_prevista_recompra: string }>

      const valorPedido = (p: PedRow) =>
        Math.round(
          ((p.pedido_itens ?? [])
            .filter((i) => !i.excluido)
            .reduce((s, i) => s + (i.preco_venda ?? 0) * Number(i.quantidade), 0) +
            Number(p.valor_frete ?? 0)) *
            100,
        ) / 100

      const abertas = oppsRows.filter((o) => !['GANHO', 'PERDIDO', 'INATIVA'].includes(o.status))
      const oppRecente = oppsRows[0]
      const pedRecente = pedsRows[0]
      const idVendedor =
        oppRecente && pedRecente
          ? oppRecente.criado_em > pedRecente.criado_em
            ? oppRecente.criado_por
            : pedRecente.criado_por
          : (oppRecente ?? pedRecente)?.criado_por

      let vendedor: { nome: string | null; email: string | null } | null = null
      if (idVendedor) {
        const [perfil, au] = await Promise.all([
          supabase.from('profiles').select('nome').eq('id', idVendedor).maybeSingle(),
          supabase.auth.admin.getUserById(idVendedor),
        ])
        vendedor = { nome: perfil.data?.nome ?? null, email: au.data?.user?.email ?? null }
      }

      const efetuado = pedsRows.find((p) => p.status === 'PEDIDO_EFETUADO' || p.status === 'ENTREGUE')

      return {
        id: c.id,
        nome: c.nome_fantasia || c.razao_social,
        cnpj: c.cnpj,
        cidade: c.cidade ? (c.estado ? `${c.cidade}/${c.estado}` : c.cidade) : null,
        temperatura: abertas.find((o) => o.temperatura)?.temperatura ?? oppRecente?.temperatura ?? null,
        vendedor,
        oportunidades: abertas.slice(0, 5).map((o) => ({
          id: o.id,
          titulo: o.produto_servico || `Oportunidade #${o.numero}`,
          etapa: OPORTUNIDADE_STATUS_LABELS[o.status as keyof typeof OPORTUNIDADE_STATUS_LABELS] ?? o.status,
          valor: o.valor_estimado,
          atualizado_em: o.ultima_movimentacao,
          link: `${origem}/oportunidades`,
        })),
        orcamentos: pedsRows.slice(0, 5).map((p) => ({
          numero: p.numero,
          valor: valorPedido(p),
          status: STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status,
          // Validade padrão do orçamento (mesma regra do PDF): 7 dias.
          validade: new Date(new Date(p.criado_em).getTime() + 7 * 86400000).toISOString().slice(0, 10),
          link: `${origem}/dashboard`,
        })),
        ultimo_pedido: efetuado
          ? { data: efetuado.entregue_em ?? efetuado.ultima_movimentacao, valor: valorPedido(efetuado) }
          : null,
        recompra: rec.length
          ? { previsao: rec[0].data_prevista_recompra, itens: rec.map((r) => r.item_nome) }
          : null,
        link: `${origem}/clientes?id=${c.id}`,
      }
    }),
  )
}
