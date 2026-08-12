import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'
import { chamarOmie, obterCredenciaisOmiePorSlug } from '@/lib/omie/chamar-omie'

// Nunca expor OMIE_APP_KEY_*/OMIE_APP_SECRET_* no client — só lidas aqui, server-side.
const OMIE_CRM_TAREFAS_URL = 'https://app.omie.com.br/api/v1/crm/tarefas/'

const TAMANHO_PAGINA = 100
const LIMITE_PAGINAS = 20 // segurança: teto de 2000 registros por clique

const TAMANHO_RESUMO = 300

// Converte 'DD/MM/AAAA' (formato confirmado ao vivo no retorno do
// ListarTarefas) para 'YYYY-MM-DD' (coluna `date` do Postgres).
function dataOmieParaIso(data: unknown): string | null {
  if (typeof data !== 'string') return null
  const [dia, mes, ano] = data.split('/')
  if (!dia || !mes || !ano) return null
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
}

function truncar(texto: string, tamanho: number): string {
  if (texto.length <= tamanho) return texto
  return `${texto.slice(0, tamanho).trimEnd()}...`
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

  // Importação do Omie é exclusiva do gestor (mesma regra da fase 31).
  if (!profile || profile.setor !== 'gestor') {
    return NextResponse.json(
      { erro: 'Apenas o gestor pode importar tarefas do Omie.' },
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

    // Traz só as pendentes (cRealizada: 'N') — filtro confirmado ao vivo
    // (parâmetro não documentado no portal do desenvolvedor Omie): baixou
    // total_de_registros de 5033 para 83 num teste real contra a conta da
    // RHOCAL. Sem esse filtro, o botão importaria anos de histórico já
    // concluído — decisão consciente de trazer só o que ainda está aberto.
    const cadastrosBrutos: Record<string, unknown>[] = []
    let pagina = 1
    let totalDePaginas = 1

    do {
      let resultado: Record<string, unknown>
      try {
        resultado = await chamarOmie(
          OMIE_CRM_TAREFAS_URL,
          'ListarTarefas',
          { pagina, registros_por_pagina: TAMANHO_PAGINA, cRealizada: 'N' },
          credenciais,
        )
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : ''
        if (mensagem.toLowerCase().includes('não existem registros')) break
        throw err
      }

      if (Array.isArray(resultado.cadastros)) {
        cadastrosBrutos.push(...(resultado.cadastros as Record<string, unknown>[]))
      }
      totalDePaginas = typeof resultado.total_de_paginas === 'number' ? resultado.total_de_paginas : 1
      pagina += 1
    } while (pagina <= totalDePaginas && pagina <= LIMITE_PAGINAS)

    // Campos achatados direto no item (sem sub-objetos, diferente do
    // ListarOportunidades) — formato confirmado ao vivo (fase 33):
    // cDescricao (log corrido, não uma descrição curta — ver migração
    // 0007), cImportante/cUrgente/cRealizada ('S'/'N'), dData ('DD/MM/AAAA'),
    // nCodOp (código da Oportunidade — mesmo espaço de nCodOp do
    // ListarOportunidades), nCodTarefa (id da tarefa), nCodUsuario/
    // nIncluidoPor (códigos de usuário do Omie, sem mapeamento pro nosso
    // profiles.id — responsavel fica null nas tarefas importadas).
    const itens = cadastrosBrutos
      .map((item) => {
        const omieId = typeof item.nCodTarefa === 'number' ? item.nCodTarefa : null
        const nCodOp = typeof item.nCodOp === 'number' ? item.nCodOp : null
        const descricaoCompleta = typeof item.cDescricao === 'string' ? item.cDescricao : ''
        return {
          omieId,
          nCodOp,
          descricao: truncar(descricaoCompleta.trim() || 'Tarefa importada do Omie', TAMANHO_RESUMO),
          descricaoCompleta,
          dataPrevista: dataOmieParaIso(item.dData),
          importante: item.cImportante === 'S',
          urgente: item.cUrgente === 'S',
          situacao: item.cRealizada === 'S' ? 'Realizada' : 'Pendente',
          concluida: item.cRealizada === 'S',
        }
      })
      .filter((item): item is typeof item & { omieId: number } => item.omieId !== null)

    if (itens.length === 0) {
      return NextResponse.json({ importadas: 0, ignoradas: 0, semOportunidadeVinculada: 0 })
    }

    // Evita duplicar: só importa tarefas cujo omie_tarefa_id ainda não existe
    // no nosso banco para esta empresa.
    const { data: existentes } = await supabase
      .from('tarefas')
      .select('omie_tarefa_id')
      .eq('empresa_id', empresa.id)
      .in(
        'omie_tarefa_id',
        itens.map((item) => item.omieId),
      )

    const idsExistentes = new Set((existentes ?? []).map((e) => e.omie_tarefa_id))
    const novos = itens.filter((item) => !idsExistentes.has(item.omieId))

    if (novos.length === 0) {
      return NextResponse.json({ importadas: 0, ignoradas: itens.length, semOportunidadeVinculada: 0 })
    }

    // Vincula à oportunidade nossa via omie_oportunidade_id = nCodOp — só
    // funciona pras oportunidades já trazidas pelo "Importar do Omie" (fase
    // 31). Tarefa sem match fica com oportunidade_id null (não é erro, só
    // não tem onde linkar ainda) — segue importada mesmo assim, nada é
    // descartado.
    const codigosOpUnicos = Array.from(
      new Set(novos.map((item) => item.nCodOp).filter((codigo): codigo is number => codigo !== null)),
    )
    const oportunidadePorCodigo = new Map<number, string>()
    if (codigosOpUnicos.length > 0) {
      const { data: oportunidades } = await supabase
        .from('oportunidades')
        .select('id, omie_oportunidade_id')
        .eq('empresa_id', empresa.id)
        .in('omie_oportunidade_id', codigosOpUnicos)

      for (const o of oportunidades ?? []) {
        if (o.omie_oportunidade_id !== null) oportunidadePorCodigo.set(o.omie_oportunidade_id, o.id)
      }
    }

    let semOportunidadeVinculada = 0
    const { error: erroInsercao } = await supabase.from('tarefas').insert(
      novos.map((item) => {
        const oportunidadeId = item.nCodOp !== null ? oportunidadePorCodigo.get(item.nCodOp) ?? null : null
        if (!oportunidadeId) semOportunidadeVinculada += 1
        return {
          empresa_id: empresa.id,
          oportunidade_id: oportunidadeId,
          descricao: item.descricao,
          descricao_completa_omie: item.descricaoCompleta || null,
          data_prevista: item.dataPrevista,
          importante: item.importante,
          urgente: item.urgente,
          situacao: item.situacao,
          concluida: item.concluida,
          responsavel: null,
          omie_tarefa_id: item.omieId,
          criado_por: user.id,
        }
      }),
    )

    if (erroInsercao) {
      throw new Error(
        `Tarefas encontradas no Omie, mas houve um erro ao salvar no banco: ${erroInsercao.message}`,
      )
    }

    return NextResponse.json({
      importadas: novos.length,
      ignoradas: itens.length - novos.length,
      semOportunidadeVinculada,
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao falar com o Omie.'
    await registrarErro(supabase, {
      rota: '/api/omie/importar-tarefas',
      mensagem,
      colaboradorId: user.id,
    })
    return NextResponse.json({ erro: mensagem }, { status: 502 })
  }
}
