import { NextResponse } from 'next/server'
import { timingSafeEqual, createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { chaveTelefone } from '@/lib/bridge/telefone'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { STATUS_LABELS } from '@/lib/kanban/status'

// Ponte servidor-a-servidor com o CRM WhatsApp: SOMENTE LEITURA, protegida
// por BRIDGE_SECRET (header x-bridge-secret). Sem sessão de usuário — usa o
// client admin (service role), por isso devolve só campos explicitamente
// listados (nunca CPF, dados bancários nem dados de outros clientes).
export const dynamic = 'force-dynamic'
export const maxDuration = 15

function segredoValido(recebido: string | null): boolean {
  const esperado = process.env.BRIDGE_SECRET
  if (!esperado || !recebido) return false
  // Hash antes de comparar: tamanhos iguais, tempo constante.
  const a = createHash('sha256').update(recebido).digest()
  const b = createHash('sha256').update(esperado).digest()
  return timingSafeEqual(a, b)
}

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

function variantesCnpj(d: string): string[] {
  const v = [d]
  if (d.length === 14) {
    v.push(`${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`)
  }
  return v
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

export async function GET(request: Request) {
  if (!segredoValido(request.headers.get('x-bridge-secret'))) {
    return new NextResponse(null, { status: 401 })
  }

  const url = new URL(request.url)
  const phone = url.searchParams.get('phone')
  const cnpj = soDigitos(url.searchParams.get('cnpj'))
  const chave = chaveTelefone(phone)
  if (!chave && cnpj.length < 11) {
    return NextResponse.json({ encontrado: false, clientes: [] })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const origem = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || url.origin

  try {
    const ids = new Set<string>()
    const cnpjsExtras = new Set<string>()
    const omieExtras = new Set<number>()

    if (chave) {
      // Pré-filtro pelos 4 últimos dígitos (contíguos em qualquer formatação),
      // confirmado em JS pela chave DDD+8 — dispensa índice por expressão.
      const fim = soDigitos(phone).slice(-4)
      const padrao = `%${fim}`
      const bate = (v: string | null) => chaveTelefone(v) === chave

      const [cli, opp, ped] = await Promise.all([
        supabase.from('clientes').select('id, telefone').ilike('telefone', padrao).limit(200),
        supabase
          .from('oportunidades')
          .select('cliente_cnpj, cliente_telefone, contato_telefone, whatsapp_empresa, whatsapp_comprador')
          .or(
            ['cliente_telefone', 'contato_telefone', 'whatsapp_empresa', 'whatsapp_comprador']
              .map((c) => `${c}.ilike.${padrao}`)
              .join(','),
          )
          .limit(200),
        supabase
          .from('pedidos')
          .select('cliente_cnpj, cliente_omie_id, cliente_telefone')
          .ilike('cliente_telefone', padrao)
          .limit(200),
      ])
      for (const c of cli.data ?? []) if (bate(c.telefone)) ids.add(c.id)
      for (const o of opp.data ?? []) {
        if ([o.cliente_telefone, o.contato_telefone, o.whatsapp_empresa, o.whatsapp_comprador].some(bate)) {
          const d = soDigitos(o.cliente_cnpj)
          if (d.length >= 11) cnpjsExtras.add(d)
        }
      }
      for (const p of ped.data ?? []) {
        if (!bate(p.cliente_telefone)) continue
        const d = soDigitos(p.cliente_cnpj)
        if (d.length >= 11) cnpjsExtras.add(d)
        if (p.cliente_omie_id) omieExtras.add(p.cliente_omie_id)
      }
    }
    if (cnpj.length >= 11) cnpjsExtras.add(cnpj)

    const filtrosCliente: string[] = []
    Array.from(cnpjsExtras).forEach((d) => variantesCnpj(d).forEach((v) => filtrosCliente.push(`cnpj.eq.${v}`)))
    if (omieExtras.size) filtrosCliente.push(`omie_cliente_id.in.(${Array.from(omieExtras).join(',')})`)
    if (filtrosCliente.length) {
      const { data } = await supabase.from('clientes').select('id').or(filtrosCliente.join(',')).limit(50)
      for (const c of data ?? []) ids.add(c.id)
    }

    if (ids.size === 0) return NextResponse.json({ encontrado: false, clientes: [] })

    const { data: clientesDb } = await supabase
      .from('clientes')
      .select('id, razao_social, nome_fantasia, cnpj, cidade, estado, omie_cliente_id')
      .in('id', Array.from(ids).slice(0, 10))

    const clientes = await Promise.all(
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

    return NextResponse.json({ encontrado: clientes.length > 0, clientes })
  } catch (err) {
    console.error('[bridge/cliente]', err instanceof Error ? err.message : err)
    return NextResponse.json({ erro: 'Falha ao consultar.' }, { status: 500 })
  }
}
