import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'
import { chamarOmie, obterCredenciaisOmiePorSlug } from '@/lib/omie/chamar-omie'

// Nunca expor OMIE_APP_KEY_*/OMIE_APP_SECRET_* no client — só lidas aqui, server-side.
const OMIE_CRM_OPORTUNIDADES_URL = 'https://app.omie.com.br/api/v1/crm/oportunidades/'
const OMIE_CRM_CONTAS_URL = 'https://app.omie.com.br/api/v1/crm/contas/'

// Só importa oportunidades cadastradas no Omie (outrasInf.dInclusao) nos
// últimos N dias — evita trazer anos de histórico antigo a cada clique.
const DIAS_LIMITE_IMPORTACAO = 30

// Converte "DD/MM/AAAA" (formato Omie) para Date. Retorna null se o formato
// vier diferente do esperado — tratado como "fora do prazo" (não importa).
function paraDataOmie(data: string | null): Date | null {
  if (!data) return null
  const match = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const [, dia, mes, ano] = match
  return new Date(Number(ano), Number(mes) - 1, Number(dia))
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

  // Importação do Omie é exclusiva do gestor (fase 31).
  if (!profile || profile.setor !== 'gestor') {
    return NextResponse.json(
      { erro: 'Apenas o gestor pode importar oportunidades do Omie.' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const empresaSlug = typeof body?.empresaSlug === 'string' ? body.empresaSlug : null
  if (!empresaSlug) {
    return NextResponse.json({ erro: 'Empresa não informada.' }, { status: 400 })
  }

  const { data: empresa, error: erroEmpresa } = await supabase
    .from('empresas')
    .select('id')
    .eq('slug', empresaSlug)
    .single()

  if (erroEmpresa || !empresa) {
    return NextResponse.json({ erro: 'Empresa não encontrada.' }, { status: 404 })
  }

  try {
    const credenciais = obterCredenciaisOmiePorSlug(empresaSlug)

    // Formato confirmado ao vivo: o array vem em `cadastros`, teto real de
    // 100 registros por página mesmo pedindo mais.
    //
    // `ordenar_por` só aceita 'CODIGO'/'DESCRICAO' (fault ao tentar
    // 'dInclusao') — não existe ordenação direta por data. Porém
    // `ordem_decrescente: 'S'` é aceito e inverte a ordem padrão (que sem
    // ele trazia os registros MAIS ANTIGOS primeiro — dez/2023 num teste —
    // por isso a importação nunca achava nada dentro do prazo). Com ele, a
    // primeira página passa a trazer os mais recentes primeiro.
    //
    // Essa ordenação não é estritamente cronológica por dInclusao — parece
    // seguir algum código/sequência interna que só geralmente acompanha a
    // data (confirmado ao vivo: dentro da mesma página de 100 registros a
    // data cai de forma decrescente, mas com saltos pontuais). Por isso a
    // paginação nunca para no primeiro item fora do prazo, só quando uma
    // página INTEIRA vier com zero registros dentro dos últimos
    // DIAS_LIMITE_IMPORTACAO dias, ou ao atingir o limite de segurança.
    const MAX_PAGINAS_IMPORTACAO = 10
    const REGISTROS_POR_PAGINA = 100

    const limiteData = new Date()
    limiteData.setDate(limiteData.getDate() - DIAS_LIMITE_IMPORTACAO)

    const cadastrosBrutos: Record<string, unknown>[] = []
    for (let pagina = 1; pagina <= MAX_PAGINAS_IMPORTACAO; pagina++) {
      let resultadoPagina: Record<string, unknown>
      try {
        resultadoPagina = await chamarOmie(
          OMIE_CRM_OPORTUNIDADES_URL,
          'ListarOportunidades',
          {
            pagina,
            registros_por_pagina: REGISTROS_POR_PAGINA,
            apenas_importado_api: 'N',
            ordem_decrescente: 'S',
          },
          credenciais,
        )
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : ''
        if (mensagem.toLowerCase().includes('não existem registros')) break
        throw err
      }

      if (!Array.isArray(resultadoPagina.cadastros)) {
        throw new Error(
          'Não foi possível interpretar a resposta do Omie (formato inesperado). Confirme os nomes dos campos com um teste ao vivo antes de tentar de novo.',
        )
      }

      const cadastrosPagina = resultadoPagina.cadastros as Record<string, unknown>[]
      if (cadastrosPagina.length === 0) break

      cadastrosBrutos.push(...cadastrosPagina)

      const algumDentroDoPrazoNaPagina = cadastrosPagina.some((item) => {
        const outrasInf = (item.outrasInf as Record<string, unknown>) ?? {}
        const data = paraDataOmie(
          typeof outrasInf.dInclusao === 'string' ? outrasInf.dInclusao : null,
        )
        return data !== null && data >= limiteData
      })
      if (!algumDentroDoPrazoNaPagina) break

      const totalPaginas =
        typeof resultadoPagina.total_de_paginas === 'number'
          ? resultadoPagina.total_de_paginas
          : null
      if (totalPaginas !== null && pagina >= totalPaginas) break
    }

    if (cadastrosBrutos.length === 0) {
      return NextResponse.json({ importadas: 0, ignoradas: 0, ignoradasPorData: 0 })
    }

    // Cada item vem com os dados agrupados em sub-objetos (identificacao,
    // ticket, fasesStatus, ...) — nada solto na raiz do item.
    const itens = cadastrosBrutos
      .map((item) => {
        const identificacao = (item.identificacao as Record<string, unknown>) ?? {}
        const ticket = (item.ticket as Record<string, unknown>) ?? {}
        const fasesStatus = (item.fasesStatus as Record<string, unknown>) ?? {}
        const outrasInf = (item.outrasInf as Record<string, unknown>) ?? {}

        return {
          omieId: typeof identificacao.nCodOp === 'number' ? identificacao.nCodOp : null,
          // nCodConta é o código da "Conta" no CRM do Omie (entidade própria,
          // diferente do cadastro geral de Clientes) — resolvida abaixo via
          // ConsultarConta. cDesOp é uma descrição da oportunidade (ex:
          // "CLIENTE LTDA - Solução 01 (1)"), não o nome limpo do cliente.
          contaId: typeof identificacao.nCodConta === 'number' ? identificacao.nCodConta : null,
          valorEstimado: typeof ticket.nTicket === 'number' ? ticket.nTicket : null,
          // Códigos de fase/status/motivo são específicos da conta e opacos
          // sem uma tradução ainda não investigada (ver fase 31 do
          // CLAUDE.md) — guardados brutos, só para referência manual futura.
          faseBruta: JSON.stringify({
            nCodFase: fasesStatus.nCodFase ?? null,
            nCodStatus: fasesStatus.nCodStatus ?? null,
            nCodMotivo: fasesStatus.nCodMotivo ?? null,
          }),
          dataInclusao: typeof outrasInf.dInclusao === 'string' ? outrasInf.dInclusao : null,
        }
      })
      .filter((item): item is typeof item & { omieId: number } => item.omieId !== null)

    if (itens.length === 0) {
      return NextResponse.json({ importadas: 0, ignoradas: 0, ignoradasPorData: 0 })
    }

    // Só traz oportunidades recentes (dInclusao dentro dos últimos
    // DIAS_LIMITE_IMPORTACAO dias) — dInclusao ausente ou em formato
    // inesperado é tratado como fora do prazo (não importa por segurança,
    // já que não dá pra confirmar que está dentro da janela). limiteData já
    // foi calculado acima, antes do loop de páginas.
    const itensDentroDoPrazo = itens.filter((item) => {
      const data = paraDataOmie(item.dataInclusao)
      return data !== null && data >= limiteData
    })

    if (itensDentroDoPrazo.length === 0) {
      return NextResponse.json({
        importadas: 0,
        ignoradas: 0,
        ignoradasPorData: itens.length,
      })
    }

    // Evita duplicar: só importa oportunidades cujo omie_oportunidade_id
    // ainda não existe no nosso banco para esta empresa.
    const { data: existentes } = await supabase
      .from('oportunidades')
      .select('omie_oportunidade_id')
      .eq('empresa_id', empresa.id)
      .in(
        'omie_oportunidade_id',
        itensDentroDoPrazo.map((item) => item.omieId),
      )

    const idsExistentes = new Set((existentes ?? []).map((e) => e.omie_oportunidade_id))
    const novos = itensDentroDoPrazo.filter((item) => !idsExistentes.has(item.omieId))

    if (novos.length === 0) {
      return NextResponse.json({
        importadas: 0,
        ignoradas: itensDentroDoPrazo.length,
        ignoradasPorData: itens.length - itensDentroDoPrazo.length,
      })
    }

    // Resolve cada cliente (nCodConta) uma única vez via ConsultarConta,
    // mesmo que várias oportunidades novas pertençam à mesma conta —
    // confirmado ao vivo: endpoint crm/contas/, call ConsultarConta, param
    // `{ nCod: <código> }` (camelCase — este módulo CRM não segue o padrão
    // snake_case do resto da integração Omie deste projeto). A resposta já
    // traz nome (identificacao.cNome), CNPJ (identificacao.cDoc) e telefone
    // (telefone_email.cNumTel) numa única chamada.
    const codigosContaUnicos = Array.from(new Set(novos.map((item) => item.contaId))).filter(
      (codigo): codigo is number => codigo !== null,
    )
    const contaPorCodigo = new Map<
      number,
      { nome: string | null; cnpj: string | null; telefone: string | null }
    >()
    let falhaSistemicaContas = false

    for (const codigo of codigosContaUnicos) {
      if (falhaSistemicaContas) break
      try {
        const respostaConta = await chamarOmie(
          OMIE_CRM_CONTAS_URL,
          'ConsultarConta',
          { nCod: codigo },
          credenciais,
        )
        const identificacaoConta = respostaConta.identificacao as Record<string, unknown> | undefined
        const telefoneEmailConta = respostaConta.telefone_email as Record<string, unknown> | undefined

        contaPorCodigo.set(codigo, {
          nome: (identificacaoConta?.cNome as string) || null,
          cnpj: (identificacaoConta?.cDoc as string) || null,
          telefone: (telefoneEmailConta?.cNumTel as string) || null,
        })
      } catch {
        // Se a primeira tentativa já falhar, é provável que o formato da
        // chamada esteja errado (não só aquela conta específica) — desiste
        // do resto em vez de repetir o mesmo erro para cada código, e cai no
        // nome genérico de fallback abaixo para todas.
        if (contaPorCodigo.size === 0 && codigo === codigosContaUnicos[0]) {
          falhaSistemicaContas = true
        }
      }
    }

    const { error: erroInsercao } = await supabase.from('oportunidades').insert(
      // status não é informado — assume o default da coluna (NOVO_LEAD),
      // independente da etapa em que a oportunidade esteja no Omie.
      novos.map((item) => {
        const conta = item.contaId !== null ? contaPorCodigo.get(item.contaId) : undefined
        return {
          empresa_id: empresa.id,
          cliente_nome: conta?.nome || `Cliente Omie #${item.contaId ?? item.omieId}`,
          cliente_cnpj: conta?.cnpj ?? null,
          cliente_telefone: conta?.telefone ?? null,
          valor_estimado: item.valorEstimado,
          omie_oportunidade_id: item.omieId,
          omie_fase_bruta: item.faseBruta,
          criado_por: user.id,
        }
      }),
    )

    if (erroInsercao) {
      throw new Error(
        `Oportunidades encontradas no Omie, mas houve um erro ao salvar no banco: ${erroInsercao.message}`,
      )
    }

    return NextResponse.json({
      importadas: novos.length,
      ignoradas: itensDentroDoPrazo.length - novos.length,
      ignoradasPorData: itens.length - itensDentroDoPrazo.length,
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    await registrarErro(supabase, {
      rota: '/api/omie/importar-oportunidades',
      mensagem,
      colaboradorId: user.id,
    })
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
