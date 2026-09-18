// scripts/backfill-mobcall-usuario.mjs
//
// Cruzamento direto chamada -> colaborador via IDs internos da Mobcall
// (payload_bruto.sourceUserId/destinationUserId), mais confiável que a
// heurística de DID usada antes. Precisa da coluna profiles.mobcall_user_id
// (migration 0026_mobcall_user_id.sql) já aplicada no Supabase.
//
// 1) Preenche profiles.mobcall_user_id pros 4 colaboradores já mapeados
//    (só se ainda estiver null — idempotente).
// 2) Pra cada chamada com usuario_id ainda nulo, extrai sourceUserId ou
//    destinationUserId (o que vier preenchido) de payload_bruto, cruza
//    contra o mapa de profiles e grava chamadas.usuario_id.
// 3) Pra cada chamada que ganhou usuario_id (agora ou antes) e ainda está
//    com empresa_id nulo, tenta resolver empresa_id via oportunidade já
//    vinculada (oportunidade_id) — não tenta vincular oportunidade aqui,
//    isso é papel do backfill-empresa-chamadas.mjs / da própria rota de
//    sync. Sem oportunidade com empresa, fica null — nunca chuta.
//
// Idempotente: só toca profiles.mobcall_user_id nulo e chamadas.usuario_id/
// empresa_id nulos. Não deleta nada (regra de ouro do projeto).
//
// Uso:
//   node --env-file=.env.local scripts/backfill-mobcall-usuario.mjs
//   node --env-file=.env.local scripts/backfill-mobcall-usuario.mjs --dry-run

import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente.\n' +
      'Rode com: node --env-file=.env.local scripts/backfill-mobcall-usuario.mjs',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Mapeamento confirmado manualmente (fases de investigação Mobcall x profiles).
const MAPEAMENTO = [
  { profileId: '694f5d7a-2e9c-454e-8681-ad7953e99459', nome: 'Nicoly Santos', mobcallUserId: '336' },
  { profileId: 'd24657de-8c94-4d72-bda1-df10247fc502', nome: 'Ana Nascimento', mobcallUserId: '338' },
  { profileId: 'd10e89a9-4b3e-44cb-a1bb-73abbb62059e', nome: 'Alexsandro da Hora', mobcallUserId: '340' },
  { profileId: 'a9e0a0cc-8f51-4c25-ad53-29872d0b56fb', nome: 'Rodrigo da Hora', mobcallUserId: '342' },
]

async function preencherMapeamento() {
  console.log('=== 1) profiles.mobcall_user_id ===')
  for (const { profileId, nome, mobcallUserId } of MAPEAMENTO) {
    const { data: perfil, error: erroLeitura } = await supabase
      .from('profiles')
      .select('id, mobcall_user_id')
      .eq('id', profileId)
      .single()

    if (erroLeitura || !perfil) {
      console.warn(`  aviso: perfil ${nome} (${profileId}) não encontrado — pulando`)
      continue
    }

    if (perfil.mobcall_user_id) {
      console.log(`  ${nome}: já tinha mobcall_user_id=${perfil.mobcall_user_id} — mantido`)
      continue
    }

    if (DRY_RUN) {
      console.log(`  (dry-run) ${nome}: gravaria mobcall_user_id=${mobcallUserId}`)
      continue
    }

    const { error } = await supabase
      .from('profiles')
      .update({ mobcall_user_id: mobcallUserId })
      .eq('id', profileId)

    if (error) {
      console.warn(`  aviso: falha ao gravar mobcall_user_id de ${nome}: ${error.message}`)
      continue
    }
    console.log(`  ${nome}: mobcall_user_id=${mobcallUserId} gravado`)
  }
}

async function backfillUsuarioId() {
  console.log('\n=== 2) chamadas.usuario_id ===')

  const { data: perfis, error: erroPerfis } = await supabase
    .from('profiles')
    .select('id, mobcall_user_id')
    .not('mobcall_user_id', 'is', null)
  if (erroPerfis) throw new Error(`erro ao ler profiles: ${erroPerfis.message}`)

  const perfilPorMobcallUserId = new Map(
    (perfis ?? []).map((p) => [p.mobcall_user_id, p.id]),
  )

  const { data: chamadas, error: erroChamadas } = await supabase
    .from('chamadas')
    .select('id, payload_bruto, usuario_id')
    .is('usuario_id', null)
  if (erroChamadas) throw new Error(`erro ao listar chamadas: ${erroChamadas.message}`)

  console.log(`${chamadas.length} chamada(s) com usuario_id nulo encontrada(s).`)

  let resolvidas = 0
  let semCorrespondencia = 0
  const idsResolvidos = []

  for (const chamada of chamadas) {
    const p = chamada.payload_bruto
    const mobcallUserId = p?.sourceUserId ?? p?.destinationUserId
    const perfilId = mobcallUserId != null ? perfilPorMobcallUserId.get(String(mobcallUserId)) : undefined

    if (!perfilId) {
      semCorrespondencia++
      continue
    }

    if (DRY_RUN) {
      resolvidas++
      idsResolvidos.push(chamada.id)
      continue
    }

    const { error } = await supabase.from('chamadas').update({ usuario_id: perfilId }).eq('id', chamada.id)
    if (error) {
      console.warn(`  aviso: falha ao atualizar chamada ${chamada.id}: ${error.message}`)
      continue
    }
    resolvidas++
    idsResolvidos.push(chamada.id)
  }

  console.log(`Chamadas com usuario_id resolvido: ${resolvidas}`)
  console.log(`Chamadas sem correspondência (sourceUserId/destinationUserId não mapeado): ${semCorrespondencia}`)

  return idsResolvidos
}

async function backfillEmpresaId(idsComUsuarioResolvido) {
  console.log('\n=== 3) chamadas.empresa_id (via oportunidade já vinculada) ===')

  // Reavalia todas as chamadas com empresa_id nulo (não só as recém-
  // resolvidas no passo 2 — cobre também chamadas que já tinham usuario_id
  // de antes mas empresa_id ainda nulo).
  const { data: chamadas, error } = await supabase
    .from('chamadas')
    .select('id, oportunidade_id, usuario_id')
    .is('empresa_id', null)
  if (error) throw new Error(`erro ao listar chamadas: ${error.message}`)

  const comOportunidade = chamadas.filter((c) => c.oportunidade_id)
  console.log(`${chamadas.length} chamada(s) com empresa_id nulo; ${comOportunidade.length} têm oportunidade_id.`)

  if (comOportunidade.length === 0) {
    console.log('Chamadas com empresa_id preenchido: 0')
    return
  }

  const idsOportunidade = Array.from(new Set(comOportunidade.map((c) => c.oportunidade_id)))
  const { data: oportunidades, error: erroOp } = await supabase
    .from('oportunidades')
    .select('id, empresa_id')
    .in('id', idsOportunidade)
  if (erroOp) throw new Error(`erro ao ler oportunidades: ${erroOp.message}`)

  const empresaPorOportunidade = new Map()
  for (const o of oportunidades ?? []) {
    if (o.empresa_id) empresaPorOportunidade.set(o.id, o.empresa_id)
  }

  let atualizadas = 0
  let semResolucao = 0

  for (const chamada of comOportunidade) {
    const empresaId = empresaPorOportunidade.get(chamada.oportunidade_id)
    if (!empresaId) {
      semResolucao++
      continue
    }

    if (DRY_RUN) {
      atualizadas++
      continue
    }

    const { error: erroUpdate } = await supabase
      .from('chamadas')
      .update({ empresa_id: empresaId })
      .eq('id', chamada.id)
    if (erroUpdate) {
      console.warn(`  aviso: falha ao atualizar chamada ${chamada.id}: ${erroUpdate.message}`)
      continue
    }
    atualizadas++
  }

  console.log(`Chamadas com empresa_id preenchido: ${atualizadas}`)
  console.log(`Chamadas com oportunidade mas sem empresa_id na oportunidade: ${semResolucao}`)
  console.log(
    `Chamadas que continuam sem empresa_id (sem oportunidade vinculada): ${
      chamadas.length - comOportunidade.length
    }`,
  )

  void idsComUsuarioResolvido // só documental — a query já releu tudo do zero
}

async function main() {
  console.log(`=== backfill mobcall usuario_id/empresa_id ${DRY_RUN ? '(dry-run — nada será gravado)' : ''} ===`)
  await preencherMapeamento()
  const idsResolvidos = await backfillUsuarioId()
  await backfillEmpresaId(idsResolvidos)
  if (DRY_RUN) console.log('\n(dry-run — nada foi gravado; rode sem --dry-run pra aplicar)')
}

main().catch((err) => {
  console.error('Falhou:', err instanceof Error ? err.message : err)
  process.exit(1)
})
