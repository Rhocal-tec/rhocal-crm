import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'
import { buscarComFallbackRhocal, chamarOmie } from '@/lib/omie/chamar-omie'
import type { Database } from '@/types/database'
import {
  chaveItemOmie,
  normalizarClienteOmie,
  type ClienteOmieCompleto,
  type ItemSincronizarOmie,
} from '@/lib/omie/cliente-completo'

// Nunca expor OMIE_APP_KEY_*/OMIE_APP_SECRET_* no client — só lidas aqui, server-side.
const OMIE_CLIENTES_URL = 'https://app.omie.com.br/api/v1/geral/clientes/'
const MAX_ITENS = 20
const PAUSA_ENTRE_CHAMADAS_MS = 250

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function consultar(
  supabase: ReturnType<typeof createClient>,
  empresaSlug: string,
  item: ItemSincronizarOmie,
): Promise<Record<string, unknown> | null> {
  const executar = async (credenciais: Parameters<typeof chamarOmie>[3]) => {
    if (item.omieId) {
      const cadastro = await chamarOmie(OMIE_CLIENTES_URL, 'ConsultarCliente', { codigo_cliente_omie: item.omieId }, credenciais)
      return [cadastro]
    }
    const cnpj = (item.cnpj ?? '').replace(/\D/g, '')
    if (cnpj.length < 11) return []
    const formatado =
      cnpj.length === 14
        ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
        : cnpj.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
    for (const f of [formatado, cnpj]) {
      try {
        const r = await chamarOmie(
          OMIE_CLIENTES_URL,
          'ListarClientes',
          { pagina: 1, registros_por_pagina: 1, apenas_importado_api: 'N', clientesFiltro: { cnpj_cpf: f } },
          credenciais,
        )
        const lista = Array.isArray(r.clientes_cadastro) ? (r.clientes_cadastro as Record<string, unknown>[]) : []
        if (lista.length > 0) return lista
      } catch (err) {
        const m = err instanceof Error ? err.message : ''
        if (!m.toLowerCase().includes('não existem registros')) throw err
      }
    }
    return []
  }

  // O Omie recusa chamadas em sequência rápida — uma segunda tentativa depois de uma pausa resolve a maioria.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const lista = await buscarComFallbackRhocal<Record<string, unknown>>(supabase, { empresaSlug }, executar)
      return lista[0] ?? null
    } catch (err) {
      if (tentativa === 1) throw err
      await esperar(1500)
    }
  }
  return null
}

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const empresaSlug = typeof body?.empresaSlug === 'string' ? body.empresaSlug : null
  if (!empresaSlug) return NextResponse.json({ erro: 'Empresa não informada.' }, { status: 400 })

  const itens: ItemSincronizarOmie[] = (Array.isArray(body?.itens) ? body.itens : [])
    .map((i: { omieId?: unknown; cnpj?: unknown }) => ({
      omieId: Number.isFinite(Number(i.omieId)) && Number(i.omieId) > 0 ? Number(i.omieId) : null,
      cnpj: typeof i.cnpj === 'string' ? i.cnpj.replace(/\D/g, '') || null : null,
    }))
    .filter((i: ItemSincronizarOmie) => i.omieId || i.cnpj)
    .slice(0, MAX_ITENS)
  if (itens.length === 0) return NextResponse.json({ resultados: {}, persistidos: 0 })

  const resultados: Record<string, { dados: ClienteOmieCompleto | null; erro: string | null }> = {}
  try {
    for (const item of itens) {
      const chave = chaveItemOmie(item)
      try {
        const bruto = await consultar(supabase, empresaSlug, item)
        resultados[chave] = { dados: bruto ? normalizarClienteOmie(bruto) : null, erro: bruto ? null : 'Cliente não encontrado no Omie.' }
      } catch (err) {
        resultados[chave] = { dados: null, erro: err instanceof Error ? err.message : 'Erro ao consultar o Omie.' }
      }
      await esperar(PAUSA_ENTRE_CHAMADAS_MS)
    }

    // ===== Grava no cadastro de clientes do CRM (só preenche o que está vazio) =====
    let persistidos = 0
    let erroPersistencia: string | null = null
    const encontrados = Object.values(resultados)
      .map((r) => r.dados)
      .filter((d): d is ClienteOmieCompleto => d !== null)

    if (encontrados.length > 0) {
      const ids = encontrados.map((d) => d.omieId).filter((v): v is number => v !== null)
      const cnpjs = encontrados.map((d) => d.cnpj).filter((v): v is string => v !== null)
      const existentes = new Map<string, Record<string, unknown>>()
      if (ids.length > 0) {
        const { data } = await supabase.from('clientes').select('*').in('omie_cliente_id', ids)
        for (const r of data ?? []) existentes.set(`o:${r.omie_cliente_id}`, r)
      }
      if (cnpjs.length > 0) {
        const { data } = await supabase.from('clientes').select('*').in('cnpj', cnpjs)
        for (const r of data ?? []) existentes.set(`c:${r.cnpj}`, r)
      }
      const { data: emp } = await supabase.from('empresas').select('id').eq('slug', empresaSlug).maybeSingle()

      for (const d of encontrados) {
        const linha = (d.omieId && existentes.get(`o:${d.omieId}`)) || (d.cnpj && existentes.get(`c:${d.cnpj}`)) || null
        const campos: Record<string, string | number | null> = {
          nome_fantasia: d.nomeFantasia,
          cnpj: d.cnpj,
          telefone: d.telefone1 ?? d.telefone2,
          contato: d.contato,
          email: d.email,
          endereco: d.endereco,
          endereco_numero: d.numero,
          bairro: d.bairro,
          cidade: d.cidade,
          estado: d.estado,
          cep: d.cep,
          observacoes: d.observacao,
          omie_cliente_id: d.omieId,
        }
        if (linha) {
          const patch: Record<string, string | number> = {}
          for (const [col, valor] of Object.entries(campos)) {
            if (valor !== null && (linha[col] === null || linha[col] === undefined || linha[col] === '')) patch[col] = valor
          }
          if (Object.keys(patch).length > 0) {
            const { error } = await supabase.from('clientes').update(patch as Database['public']['Tables']['clientes']['Update']).eq('id', linha.id as string)
            if (error) erroPersistencia = error.message
            else persistidos += 1
          }
        } else if (d.razaoSocial) {
          const { error } = await supabase
            .from('clientes')
            .insert({ razao_social: d.razaoSocial, ...campos, criado_por: user.id, empresa_id: emp?.id ?? null })
          if (error) erroPersistencia = error.message
          else persistidos += 1
        }
      }
    }

    return NextResponse.json({ resultados, persistidos, erroPersistencia })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    await registrarErro(supabase, { rota: '/api/omie/cliente-completo', mensagem, colaboradorId: user.id })
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
