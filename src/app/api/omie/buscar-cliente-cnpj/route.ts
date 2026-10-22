import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'
import { buscarComFallbackRhocal, chamarOmie } from '@/lib/omie/chamar-omie'

// Nunca expor OMIE_APP_KEY_*/OMIE_APP_SECRET_* no client — só lidas aqui, server-side.
const OMIE_CLIENTES_URL = 'https://app.omie.com.br/api/v1/geral/clientes/'

interface ClienteOmie {
  codigoClienteOmie: number
  razaoSocial: string
  nomeFantasia: string | null
  cnpjCpf: string | null
}

export async function POST(request: Request) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('setor')
    .eq('id', user.id)
    .single()

  // Antes exclusivo de comercial/gestor (a única chamada era da criação de
  // pedido). A partir da fase 34, o módulo de Clientes também usa esta rota
  // e é visível a todos os perfis — liberada pra qualquer autenticado, mesmo
  // padrão já usado em buscar-clientes-nome.
  if (!profile) {
    return NextResponse.json(
      { erro: 'Seu perfil não pode buscar clientes no Omie.' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const cnpj = typeof body?.cnpj === 'string' ? body.cnpj.replace(/\D/g, '') : ''
  if (cnpj.length !== 14) {
    return NextResponse.json({ erro: 'CNPJ inválido.' }, { status: 400 })
  }

  try {
    // Pedido já existente (busca feita de dentro do pedido) usa a empresa
    // dona dele; sem pedidoId (criação de um orçamento novo) usa a empresa
    // ativa no seletor, enviada pelo client como empresaSlug.
    // O Omie guarda o CNPJ com máscara (00.000.000/0000-00) e o filtro compara
    // texto — por isso tenta formatado e, se não achar, só dígitos. Se a empresa
    // ativa (ex: MATSEG) falhar ou não achar, repete com as credenciais da RHOCAL.
    const cnpjFormatado = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    const bruto = await buscarComFallbackRhocal<Record<string, unknown>>(
      supabase,
      body,
      async (credenciais) => {
        for (const formato of [cnpjFormatado, cnpj]) {
          try {
            const resultado = await chamarOmie(
              OMIE_CLIENTES_URL,
              'ListarClientes',
              {
                pagina: 1,
                registros_por_pagina: 1,
                apenas_importado_api: 'N',
                clientesFiltro: { cnpj_cpf: formato },
              },
              credenciais,
            )
            const lista = Array.isArray(resultado.clientes_cadastro) ? resultado.clientes_cadastro : []
            if (lista.length > 0) return lista
          } catch (err) {
            // "Não existem registros" = nenhum cliente com esse filtro.
            const mensagem = err instanceof Error ? err.message : ''
            if (!mensagem.toLowerCase().includes('não existem registros')) throw err
          }
        }
        return []
      },
    )
    if (bruto.length === 0) {
      return NextResponse.json({ encontrado: false })
    }

    const c = bruto[0] as Record<string, unknown>
    const cliente: ClienteOmie = {
      codigoClienteOmie: c.codigo_cliente_omie as number,
      razaoSocial: c.razao_social as string,
      nomeFantasia: (c.nome_fantasia as string) ?? null,
      cnpjCpf: (c.cnpj_cpf as string) ?? null,
    }

    return NextResponse.json({ encontrado: true, cliente })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    await registrarErro(supabase, {
      rota: '/api/omie/buscar-cliente-cnpj',
      mensagem,
      colaboradorId: user.id,
    })
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
