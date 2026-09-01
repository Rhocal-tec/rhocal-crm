import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registrarErro } from '@/lib/omie/registrar-erro'
import { obterCredenciaisOmiePorEmpresaId, type CredenciaisOmie } from '@/lib/omie/chamar-omie'

// Nunca expor OMIE_APP_KEY_*/OMIE_APP_SECRET_* no client — só lidas aqui, server-side.
const OMIE_CRM_TAREFAS_URL = 'https://app.omie.com.br/api/v1/crm/tarefas/'

// DEBUG TEMPORÁRIO (fase 33.4) — chamarOmie() (lib/omie/chamar-omie.ts) só
// preserva `faultstring` em caso de erro, descartando o resto do corpo
// (faultcode, e qualquer outro campo). Pra ver a resposta REALMENTE
// completa do Omie na primeira escrita de teste contra IncluirTarefa/
// AlterarTarefa (nunca confirmada ao vivo até agora), esta rota usa um
// fetch bruto só aqui, sem passar pelo helper compartilhado. Remover e
// voltar a usar chamarOmie() assim que o formato estiver validado.
async function chamarOmieComLogCompleto(
  call: string,
  param: Record<string, unknown>,
  credenciais: CredenciaisOmie,
): Promise<Record<string, unknown>> {
  console.log(`[sincronizar-tarefa] DEBUG payload ${call}:`, JSON.stringify(param))

  const resposta = await fetch(OMIE_CRM_TAREFAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      call,
      app_key: credenciais.appKey,
      app_secret: credenciais.appSecret,
      param: [param],
    }),
  })

  const textoBruto = await resposta.text()
  console.log(`[sincronizar-tarefa] DEBUG resposta bruta ${call} (HTTP ${resposta.status}):`, textoBruto)

  const dados = JSON.parse(textoBruto) as Record<string, unknown>
  if (typeof dados.faultstring === 'string') {
    throw new Error(dados.faultstring)
  }
  return dados
}

// Converte um `date` do Postgres ('YYYY-MM-DD', sem hora) pro formato do
// Omie (DD/MM/AAAA) fatiando a string em vez de passar por `Date` — mesmo
// cuidado de formatarDataSomente (lib/kanban/formatacao.ts): interpretar
// 'YYYY-MM-DD' como Date cria meia-noite UTC, que vira o dia anterior ao
// converter pro fuso do Brasil.
function dataPrevistaParaOmie(data: string | null): string {
  if (!data) {
    const hoje = new Date()
    const dia = String(hoje.getDate()).padStart(2, '0')
    const mes = String(hoje.getMonth() + 1).padStart(2, '0')
    return `${dia}/${mes}/${hoje.getFullYear()}`
  }
  const [ano, mes, dia] = data.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

// Sincronização best-effort, nunca bloqueante: chamado depois de criar/editar
// uma tarefa no nosso CRM (TarefasTab, kanban de Tarefas, encadeamento).
// IncluirTarefa/AlterarTarefa foram inferidos por simetria com os campos que
// o próprio ListarTarefas devolve (fase 33) — NÃO foram confirmados ao vivo
// com uma escrita de teste, pra não gerar dado de teste na conta real de
// produção do Omie sem autorização. Por isso qualquer fault aqui vira só um
// registro em error_log (fase 25): a tela do usuário nunca trava por causa
// disso, e o dado sempre fica salvo no nosso banco independente do Omie.
export async function POST(request: Request) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const tarefaId = typeof body?.tarefaId === 'string' ? body.tarefaId : null
  if (!tarefaId) {
    return NextResponse.json({ erro: 'Tarefa não informada.' }, { status: 400 })
  }

  const { data: tarefa, error: erroTarefa } = await supabase
    .from('tarefas')
    .select('*')
    .eq('id', tarefaId)
    .single()

  if (erroTarefa || !tarefa) {
    return NextResponse.json({ sincronizada: false, motivo: 'tarefa_nao_encontrada' })
  }

  // O módulo CRM do Omie só tem tarefas presas a Oportunidades — tarefas
  // vinculadas a pedido_id (kanban de pedidos) não têm onde ser refletidas
  // lá. Isso não é uma falha, só não se aplica: sai sem tentar nada e sem
  // registrar erro.
  if (!tarefa.oportunidade_id) {
    return NextResponse.json({ sincronizada: false, motivo: 'sem_oportunidade_vinculada' })
  }

  const { data: oportunidade } = await supabase
    .from('oportunidades')
    .select('omie_oportunidade_id, empresa_id')
    .eq('id', tarefa.oportunidade_id)
    .single()

  // Oportunidade ainda não sincronizada com o Omie (sem omie_oportunidade_id)
  // — idem, não é erro, só não tem pra onde mandar ainda.
  if (!oportunidade?.omie_oportunidade_id) {
    return NextResponse.json({ sincronizada: false, motivo: 'oportunidade_nao_sincronizada' })
  }

  try {
    const credenciais = await obterCredenciaisOmiePorEmpresaId(supabase, oportunidade.empresa_id)

    const payload: Record<string, unknown> = {
      nCodOp: oportunidade.omie_oportunidade_id,
      cDescricao: (tarefa.descricao_completa_omie || tarefa.descricao).slice(0, 4000),
      dData: dataPrevistaParaOmie(tarefa.data_prevista),
      // Fase 39: usa hora_prevista (vinda do cHora na importação) quando existe;
      // '09:00' só como fallback quando a tarefa não tem horário definido.
      cHora:
        typeof tarefa.hora_prevista === 'string' && /^\d{1,2}:\d{2}/.test(tarefa.hora_prevista.trim())
          ? tarefa.hora_prevista.trim().slice(0, 5)
          : '09:00',
      cImportante: tarefa.importante ? 'S' : 'N',
      cUrgente: tarefa.urgente ? 'S' : 'N',
      // Fase 40: 'Cancelada' também marca cRealizada:'S' — o Omie CRM não tem
      // conceito de "cancelada", então tirar da lista de pendentes lá é o
      // comportamento mais próximo do esperado.
      cRealizada: tarefa.situacao === 'Realizada' || tarefa.situacao === 'Cancelada' ? 'S' : 'N',
    }

    if (tarefa.omie_tarefa_id) {
      await chamarOmieComLogCompleto('AlterarTarefa', { ...payload, nCodTarefa: tarefa.omie_tarefa_id }, credenciais)
      return NextResponse.json({ sincronizada: true, acao: 'alterada' })
    }

    const resultado = await chamarOmieComLogCompleto('IncluirTarefa', payload, credenciais)
    const novoCodigo = typeof resultado.nCodTarefa === 'number' ? resultado.nCodTarefa : null

    if (novoCodigo) {
      await supabase.from('tarefas').update({ omie_tarefa_id: novoCodigo }).eq('id', tarefaId)
    }

    return NextResponse.json({ sincronizada: true, acao: 'incluida' })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro desconhecido ao sincronizar tarefa com o Omie.'
    // LOG TEMPORÁRIO (fase 33.4) — ver comentário acima.
    console.log('[sincronizar-tarefa] DEBUG erro capturado:', err)
    await registrarErro(supabase, {
      rota: '/api/omie/sincronizar-tarefa',
      mensagem,
      colaboradorId: user.id,
    })
    return NextResponse.json({ sincronizada: false, erro: mensagem })
  }
}
