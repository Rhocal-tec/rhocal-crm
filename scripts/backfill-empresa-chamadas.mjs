// scripts/backfill-empresa-chamadas.mjs
//
// Backfill de chamadas.empresa_id pras chamadas registradas ANTES da correção
// multi-empresa em click-to-call/route.ts e mobcall/sync/route.ts (essas
// rotas só passaram a preencher o campo dali em diante). Sem isso, chamadas
// antigas ficam invisíveis pros dois lados do filtro por empresa no Painel
// (ChamadasPorFuncionario.tsx usa .eq('empresa_id', empresaId) — null nunca
// bate com nenhuma empresa).
//
// Mesma heurística das rotas: empresa da OPORTUNIDADE vinculada.
//   1) Chamada sem oportunidade_id tenta linkar via vincular_chamada_oportunidade
//      (função já existente no Postgres, casa pelos últimos 8 dígitos do
//      telefone contra oportunidades.cliente_telefone).
//   2) Chamada com oportunidade (já tinha, ou acabou de ganhar uma) recebe
//      empresa_id = oportunidades.empresa_id dessa oportunidade.
//   3) Chamada que continua sem oportunidade fica com empresa_id null — não
//      dá pra adivinhar a empresa sem nenhum vínculo, e isso não é um erro.
//
// Idempotente: só toca chamadas com empresa_id ainda nulo, então rodar de novo
// não faz mal. Não deleta nada (regra de ouro do projeto).
//
// Uso (precisa do Node 20.6+, que já lê --env-file nativamente):
//   node --env-file=.env.local scripts/backfill-empresa-chamadas.mjs
//   node --env-file=.env.local scripts/backfill-empresa-chamadas.mjs --dry-run

import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')
const TAMANHO_LOTE = 500

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente.\n' +
      'Rode com: node --env-file=.env.local scripts/backfill-empresa-chamadas.mjs',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function buscarChamadasSemEmpresa() {
  const linhas = []
  let de = 0
  for (;;) {
    const { data, error } = await supabase
      .from('chamadas')
      .select('id, oportunidade_id')
      .is('empresa_id', null)
      .range(de, de + TAMANHO_LOTE - 1)
    if (error) throw new Error(`erro ao listar chamadas: ${error.message}`)
    if (!data || data.length === 0) break
    linhas.push(...data)
    if (data.length < TAMANHO_LOTE) break
    de += TAMANHO_LOTE
  }
  return linhas
}

async function main() {
  console.log(`=== backfill chamadas.empresa_id ${DRY_RUN ? '(dry-run — nada será gravado)' : ''} ===`)

  const chamadas = await buscarChamadasSemEmpresa()
  console.log(`${chamadas.length} chamada(s) com empresa_id nulo encontrada(s).`)
  if (chamadas.length === 0) return

  // 1) Tenta vincular oportunidade nas que ainda não têm — mesma heurística
  // de telefone usada pela sincronização periódica (mobcall/sync/route.ts).
  const semOportunidade = chamadas.filter((c) => !c.oportunidade_id)
  let novosVinculos = 0

  if (!DRY_RUN) {
    for (const chamada of semOportunidade) {
      const { error } = await supabase.rpc('vincular_chamada_oportunidade', {
        chamada_id: chamada.id,
      })
      if (error) {
        console.warn(`  aviso: falha ao tentar vincular chamada ${chamada.id}: ${error.message}`)
        continue
      }
      novosVinculos++
    }
  } else {
    console.log(
      `  (dry-run pula a tentativa de vínculo em ${semOportunidade.length} chamada(s) sem oportunidade — resultado abaixo considera só os vínculos que já existiam)`,
    )
  }

  // 2) Recarrega pra pegar oportunidade_id recém-vinculado no passo 1 (sem
  // efeito no dry-run, que não alterou nada).
  const paraResolver = DRY_RUN ? chamadas : await buscarChamadasSemEmpresa()

  const idsOportunidade = Array.from(
    new Set(paraResolver.map((c) => c.oportunidade_id).filter(Boolean)),
  )

  const empresaPorOportunidade = new Map()
  if (idsOportunidade.length > 0) {
    const { data: oportunidades, error } = await supabase
      .from('oportunidades')
      .select('id, empresa_id')
      .in('id', idsOportunidade)
    if (error) throw new Error(`erro ao ler oportunidades: ${error.message}`)
    for (const o of oportunidades ?? []) {
      if (o.empresa_id) empresaPorOportunidade.set(o.id, o.empresa_id)
    }
  }

  let atualizadas = 0
  let semResolucao = 0

  for (const chamada of paraResolver) {
    const empresaId = chamada.oportunidade_id
      ? empresaPorOportunidade.get(chamada.oportunidade_id)
      : null

    if (!empresaId) {
      semResolucao++
      continue
    }

    if (DRY_RUN) {
      atualizadas++
      continue
    }

    const { error } = await supabase.from('chamadas').update({ empresa_id: empresaId }).eq('id', chamada.id)
    if (error) {
      console.warn(`  aviso: falha ao atualizar chamada ${chamada.id}: ${error.message}`)
      continue
    }
    atualizadas++
  }

  console.log(`Novos vínculos de oportunidade (heurística de telefone): ${novosVinculos}`)
  console.log(`Chamadas com empresa_id preenchido: ${atualizadas}`)
  console.log(`Chamadas que continuam sem empresa_id (sem oportunidade vinculável): ${semResolucao}`)
  if (DRY_RUN) console.log('\n(dry-run — nada foi gravado; rode sem --dry-run pra aplicar)')
}

main().catch((err) => {
  console.error('Falhou:', err instanceof Error ? err.message : err)
  process.exit(1)
})
