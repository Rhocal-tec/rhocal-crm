import { NextResponse } from 'next/server'
import { chaveTelefone } from '@/lib/bridge/telefone'
import {
  clienteAdmin,
  montarClientes,
  origemApp,
  respostaNaoAutorizada,
  segredoValido,
  soDigitos,
  variantesCnpj,
} from '@/lib/bridge/servidor'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { STATUS_LABELS } from '@/lib/kanban/status'

// Ponte servidor-a-servidor com o CRM WhatsApp: SOMENTE LEITURA, protegida
// por BRIDGE_SECRET (header x-bridge-secret). Devolve só campos explicitamente
// listados (nunca CPF, dados bancários nem dados de outros clientes).
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  if (!segredoValido(request.headers.get('x-bridge-secret'))) return respostaNaoAutorizada()

  const url = new URL(request.url)
  const phone = url.searchParams.get('phone')
  const clienteId = url.searchParams.get('cliente_id')
  const cnpj = soDigitos(url.searchParams.get('cnpj'))
  const chave = chaveTelefone(phone)
  const idValido = clienteId && UUID.test(clienteId) ? clienteId : null

  if (!chave && cnpj.length < 11 && !idValido) {
    return NextResponse.json({ encontrado: false, clientes: [] })
  }

  const supabase = clienteAdmin()
  const origem = origemApp(url)

  try {
    // Busca direta por id: mesmo formato de resposta.
    if (idValido) {
      const clientes = await montarClientes(supabase, [idValido], origem)
      return NextResponse.json({ encontrado: clientes.length > 0, clientes })
    }

    const ids = new Set<string>()
    const cnpjsExtras = new Set<string>()
    const omieExtras = new Set<number>()
    const nomesExtras = new Set<string>()
    // Oportunidades/pedidos que bateram pelo telefone (para o "sem cadastro").
    const oppsSolta: Array<{
      id: string
      numero: number
      cliente_nome: string
      status: string
      produto_servico: string | null
    }> = []
    const pedsSolta: Array<{ id: string; numero: number; cliente_nome: string; status: string }> = []

    if (chave) {
      // Pré-filtro pelos 4 últimos dígitos (contíguos em qualquer formatação),
      // confirmado em JS pela chave DDD+8 — dispensa índice por expressão.
      const fim = soDigitos(phone).slice(-4)
      const padrao = `%${fim}`
      const bate = (v: string | null) => chaveTelefone(v) === chave

      const [cli, extra, opp, ped] = await Promise.all([
        supabase.from('clientes').select('id, telefone').ilike('telefone', padrao).limit(200),
        // Telefones adicionais (vinculados pelo CRM WhatsApp). Se a tabela
        // ainda não existe, o erro é ignorado.
        supabase.from('cliente_telefones').select('cliente_id, telefone').ilike('telefone', padrao).limit(200),
        supabase
          .from('oportunidades')
          .select(
            'id, numero, status, produto_servico, cliente_nome, cliente_cnpj, cliente_telefone, contato_telefone, whatsapp_empresa, whatsapp_comprador',
          )
          .or(
            ['cliente_telefone', 'contato_telefone', 'whatsapp_empresa', 'whatsapp_comprador']
              .map((c) => `${c}.ilike.${padrao}`)
              .join(','),
          )
          .order('criado_em', { ascending: false })
          .limit(200),
        supabase
          .from('pedidos')
          .select('id, numero, status, cliente_nome, cliente_cnpj, cliente_omie_id, cliente_telefone')
          .ilike('cliente_telefone', padrao)
          .order('criado_em', { ascending: false })
          .limit(200),
      ])
      for (const c of cli.data ?? []) if (bate(c.telefone)) ids.add(c.id)
      for (const t of extra.data ?? []) if (bate(t.telefone)) ids.add(t.cliente_id)
      for (const o of opp.data ?? []) {
        if (![o.cliente_telefone, o.contato_telefone, o.whatsapp_empresa, o.whatsapp_comprador].some(bate)) continue
        const d = soDigitos(o.cliente_cnpj)
        if (d.length >= 11) cnpjsExtras.add(d)
        if (o.cliente_nome) nomesExtras.add(o.cliente_nome)
        oppsSolta.push(o)
      }
      for (const p of ped.data ?? []) {
        if (!bate(p.cliente_telefone)) continue
        const d = soDigitos(p.cliente_cnpj)
        if (d.length >= 11) cnpjsExtras.add(d)
        if (p.cliente_omie_id) omieExtras.add(p.cliente_omie_id)
        if (p.cliente_nome) nomesExtras.add(p.cliente_nome)
        pedsSolta.push(p)
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
    // Sem CNPJ/omie nos registros: tenta ligar pelo nome exato.
    if (ids.size === 0 && nomesExtras.size) {
      const { data } = await supabase
        .from('clientes')
        .select('id')
        .in('razao_social', Array.from(nomesExtras).slice(0, 20))
        .limit(10)
      for (const c of data ?? []) ids.add(c.id)
    }

    if (ids.size > 0) {
      const clientes = await montarClientes(supabase, Array.from(ids), origem)
      return NextResponse.json({ encontrado: clientes.length > 0, clientes })
    }

    // Nenhum cadastro em `clientes`: devolve o que existe em oportunidades/pedidos.
    if (oppsSolta.length || pedsSolta.length) {
      const nome = oppsSolta[0]?.cliente_nome ?? pedsSolta[0]?.cliente_nome ?? null
      return NextResponse.json({
        encontrado: true,
        clientes: [
          {
            id: null,
            sem_cadastro: true,
            nome,
            cnpj: null,
            cidade: null,
            oportunidades: oppsSolta.slice(0, 5).map((o) => ({
              id: o.id,
              titulo: o.produto_servico || `Oportunidade #${o.numero}`,
              etapa: OPORTUNIDADE_STATUS_LABELS[o.status as keyof typeof OPORTUNIDADE_STATUS_LABELS] ?? o.status,
              link: `${origem}/oportunidades`,
            })),
            orcamentos: pedsSolta.slice(0, 5).map((p) => ({
              numero: p.numero,
              status: STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status,
              link: `${origem}/dashboard`,
            })),
            link: oppsSolta.length ? `${origem}/oportunidades` : `${origem}/dashboard`,
          },
        ],
      })
    }

    return NextResponse.json({ encontrado: false, clientes: [] })
  } catch (err) {
    console.error('[bridge/cliente]', err instanceof Error ? err.message : err)
    return NextResponse.json({ erro: 'Falha ao consultar.' }, { status: 500 })
  }
}
