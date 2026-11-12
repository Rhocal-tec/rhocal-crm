import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clienteAdmin } from '@/lib/bridge/servidor'
import { podeAcessarProdutividade } from '@/lib/produtividade/permissions'
import type { IndicadoresWhatsapp, RespostaWhatsappProdutividade } from '@/lib/produtividade/whatsapp'

// Indicadores de WhatsApp por funcionário, vindos do CRM WhatsApp pela ponte.
// O BRIDGE_SECRET fica só aqui (servidor). Cruza pelo E-MAIL: perfil deste CRM
// → e-mail do login (auth) → usuário do CRM WhatsApp.
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const URL_PADRAO = 'https://crm-whatsapp-rhocal.vercel.app'
const TIMEOUT_MS = 8000
const CACHE_MS = 5 * 60 * 1000
const DATA = /^\d{4}-\d{2}-\d{2}$/

type UsuarioBridge = IndicadoresWhatsapp & { email: string; nome?: string }
type RespostaBridge = { regras?: Record<string, string>; usuarios?: UsuarioBridge[] }

// Cache por período (5 min), em memória da instância.
const cache = new Map<string, { em: number; dados: RespostaBridge }>()

async function buscarBridge(de: string, ate: string): Promise<RespostaBridge> {
  const chave = `${de}|${ate}`
  const hit = cache.get(chave)
  if (hit && Date.now() - hit.em < CACHE_MS) return hit.dados

  const base = (process.env.CRM_WHATSAPP_URL || URL_PADRAO).replace(/\/$/, '')
  const resp = await fetch(`${base}/api/bridge/produtividade?de=${de}&ate=${ate}`, {
    headers: { 'x-bridge-secret': process.env.BRIDGE_SECRET ?? '' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const dados = (await resp.json()) as RespostaBridge
  if (!Array.isArray(dados.usuarios)) throw new Error('resposta inesperada')
  cache.set(chave, { em: Date.now(), dados })
  return dados
}

export async function GET(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })

  const { data: perfil } = await supabase.from('profiles').select('setor').eq('id', user.id).single()
  if (!perfil || !podeAcessarProdutividade(perfil.setor)) {
    return NextResponse.json({ erro: 'Sem permissão.' }, { status: 403 })
  }
  const ehGestor = perfil.setor === 'gestor'

  const params = new URL(request.url).searchParams
  const de = params.get('de') ?? ''
  const ate = params.get('ate') ?? ''
  if (!DATA.test(de) || !DATA.test(ate) || ate < de) {
    return NextResponse.json({ erro: 'Período inválido.' }, { status: 400 })
  }

  const vazio: RespostaWhatsappProdutividade = { indisponivel: true, regras: {}, porPerfil: {}, equipe: null }

  try {
    const bridge = await buscarBridge(de, ate)
    const porEmail = new Map<string, UsuarioBridge>()
    for (const u of bridge.usuarios ?? []) porEmail.set(u.email.trim().toLowerCase(), u)

    // E-mail → id do perfil (e-mails ficam no auth, não em profiles).
    const admin = clienteAdmin()
    const idPorEmail = new Map<string, string>()
    for (let pagina = 1; pagina <= 5; pagina++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 })
      if (error) throw new Error(error.message)
      for (const u of data.users) if (u.email) idPorEmail.set(u.email.trim().toLowerCase(), u.id)
      if (data.users.length < 1000) break
    }

    const porPerfil: Record<string, IndicadoresWhatsapp> = {}
    for (const [email, u] of Array.from(porEmail.entries())) {
      const id = idPorEmail.get(email)
      if (!id) continue
      // Não-gestor só recebe o próprio.
      if (!ehGestor && id !== user.id) continue
      const { email: _e, nome: _n, ...indicadores } = u
      void _e
      void _n
      porPerfil[id] = indicadores
    }

    let equipe: RespostaWhatsappProdutividade['equipe'] = null
    if (ehGestor) {
      const us = bridge.usuarios ?? []
      // 1ª resposta da equipe: média ponderada pelas conversas atendidas.
      let soma = 0
      let peso = 0
      for (const u of us) {
        if (u.tempo_medio_primeira_resposta_min !== null && u.conversas_atendidas > 0) {
          soma += u.tempo_medio_primeira_resposta_min * u.conversas_atendidas
          peso += u.conversas_atendidas
        }
      }
      equipe = {
        conversas_atendidas: us.reduce((s, u) => s + u.conversas_atendidas, 0),
        tempo_medio_primeira_resposta_min: peso > 0 ? soma / peso : null,
        sem_resposta_agora: us.reduce((s, u) => s + u.sem_resposta_agora, 0),
        esquecidas: us.reduce((s, u) => s + u.esquecidas, 0),
      }
    }

    const corpo: RespostaWhatsappProdutividade = {
      indisponivel: false,
      regras: bridge.regras ?? {},
      porPerfil,
      equipe,
    }
    return NextResponse.json(corpo)
  } catch (err) {
    console.error('[whatsapp/produtividade]', err instanceof Error ? err.message : err)
    return NextResponse.json(vazio)
  }
}
