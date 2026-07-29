import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'
import { chamarOmie, resolverCredenciaisOmie } from '@/lib/omie/chamar-omie'

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

  if (!profile || (profile.setor !== 'comercial' && profile.setor !== 'gestor')) {
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
    const credenciais = await resolverCredenciaisOmie(supabase, body)

    let resultado: Record<string, unknown>
    try {
      resultado = await chamarOmie(
        OMIE_CLIENTES_URL,
        'ListarClientes',
        {
          pagina: 1,
          registros_por_pagina: 1,
          apenas_importado_api: 'N',
          clientesFiltro: { cnpj_cpf: cnpj },
        },
        credenciais,
      )
    } catch (err) {
      // O Omie sinaliza "nenhum cliente bate com o filtro" como uma falha
      // (faultstring "Não existem registros para a página...") em vez de uma
      // lista vazia. Trata como "não encontrado" — outros erros (credenciais,
      // rede, etc.) continuam propagando normalmente.
      const mensagem = err instanceof Error ? err.message : ''
      if (mensagem.toLowerCase().includes('não existem registros')) {
        return NextResponse.json({ encontrado: false })
      }
      throw err
    }

    const bruto = Array.isArray(resultado.clientes_cadastro) ? resultado.clientes_cadastro : []
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
