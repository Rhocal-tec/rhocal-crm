import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'
import { chamarOmie, obterCredenciaisOmiePorSlug } from '@/lib/omie/chamar-omie'

// Nunca expor OMIE_APP_KEY_*/OMIE_APP_SECRET_* no client — só lidas aqui, server-side.
const OMIE_CLIENTES_URL = 'https://app.omie.com.br/api/v1/geral/clientes/'

const TAMANHO_PAGINA = 100
const LIMITE_PAGINAS = 20 // segurança: teto de 2000 registros por clique

function campoTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
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

  // Importação do Omie é exclusiva do gestor (mesma regra das fases 31/33.3).
  if (!profile || profile.setor !== 'gestor') {
    return NextResponse.json(
      { erro: 'Apenas o gestor pode importar clientes do Omie.' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const empresaSlug = typeof body?.empresaSlug === 'string' ? body.empresaSlug : null
  if (!empresaSlug) {
    return NextResponse.json({ erro: 'Empresa não informada.' }, { status: 400 })
  }

  try {
    const credenciais = obterCredenciaisOmiePorSlug(empresaSlug)

    // Mesmo comportamento já confirmado nos outros Listar* do Omie
    // (fases 31/33.3): teto real de 100 registros por página, mesmo pedindo
    // mais — paginação percorrida até total_de_paginas ou o limite de
    // segurança abaixo.
    const cadastrosBrutos: Record<string, unknown>[] = []
    let pagina = 1
    let totalDePaginas = 1

    do {
      let resultado: Record<string, unknown>
      try {
        resultado = await chamarOmie(
          OMIE_CLIENTES_URL,
          'ListarClientes',
          { pagina, registros_por_pagina: TAMANHO_PAGINA, apenas_importado_api: 'N' },
          credenciais,
        )
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : ''
        if (mensagem.toLowerCase().includes('não existem registros')) break
        throw err
      }

      if (Array.isArray(resultado.clientes_cadastro)) {
        cadastrosBrutos.push(...(resultado.clientes_cadastro as Record<string, unknown>[]))
      }
      totalDePaginas = typeof resultado.total_de_paginas === 'number' ? resultado.total_de_paginas : 1
      pagina += 1
    } while (pagina <= totalDePaginas && pagina <= LIMITE_PAGINAS)

    const itens = cadastrosBrutos
      .map((c) => {
        const omieId = typeof c.codigo_cliente_omie === 'number' ? c.codigo_cliente_omie : null
        const razaoSocial = campoTexto(c.razao_social)
        if (!omieId || !razaoSocial) return null
        return {
          omieId,
          razaoSocial,
          nomeFantasia: campoTexto(c.nome_fantasia),
          cnpj: campoTexto(c.cnpj_cpf)?.replace(/\D/g, '') || null,
          telefoneDdd: campoTexto(c.telefone1_ddd),
          telefoneNumero: campoTexto(c.telefone1_numero),
          endereco: campoTexto(c.endereco),
          enderecoNumero: campoTexto(c.endereco_numero),
          bairro: campoTexto(c.bairro),
          cidade: campoTexto(c.cidade),
          estado: campoTexto(c.estado),
          cep: campoTexto(c.cep),
          email: campoTexto(c.email),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    if (itens.length === 0) {
      return NextResponse.json({ importadas: 0, ignoradas: 0 })
    }

    // Evita duplicar: só importa clientes cujo omie_cliente_id ainda não
    // existe no nosso banco (a tabela não é escopada por empresa — clientes
    // são compartilhados entre RHOCAL/MATSEG no Omie, fase 30).
    const { data: existentes } = await supabase
      .from('clientes')
      .select('omie_cliente_id')
      .in(
        'omie_cliente_id',
        itens.map((item) => item.omieId),
      )

    const idsExistentes = new Set((existentes ?? []).map((e) => e.omie_cliente_id))
    const novos = itens.filter((item) => !idsExistentes.has(item.omieId))

    if (novos.length === 0) {
      return NextResponse.json({ importadas: 0, ignoradas: itens.length })
    }

    const { error: erroInsercao } = await supabase.from('clientes').insert(
      novos.map((item) => ({
        razao_social: item.razaoSocial,
        nome_fantasia: item.nomeFantasia,
        cnpj: item.cnpj,
        telefone: item.telefoneDdd && item.telefoneNumero ? `${item.telefoneDdd}${item.telefoneNumero}` : null,
        email: item.email,
        endereco: item.endereco,
        endereco_numero: item.enderecoNumero,
        bairro: item.bairro,
        cidade: item.cidade,
        estado: item.estado,
        cep: item.cep,
        omie_cliente_id: item.omieId,
        criado_por: user.id,
      })),
    )

    if (erroInsercao) {
      // CNPJ duplicado (índice único parcial) é o caso mais provável aqui —
      // dois clientes do Omie com o mesmo CNPJ (raro, mas possível em bases
      // antigas). Não tenta resolver sozinho: melhor reportar e deixar o
      // gestor arrumar manualmente do que arriscar sobrescrever um registro.
      throw new Error(
        `Clientes encontrados no Omie, mas houve um erro ao salvar no banco: ${erroInsercao.message}`,
      )
    }

    return NextResponse.json({
      importadas: novos.length,
      ignoradas: itens.length - novos.length,
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    await registrarErro(supabase, {
      rota: '/api/omie/importar-clientes',
      mensagem,
      colaboradorId: user.id,
    })
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
