import { NextResponse } from 'next/server'
import { chaveTelefone, telefoneComPais } from '@/lib/bridge/telefone'
import { clienteAdmin, respostaNaoAutorizada, segredoValido } from '@/lib/bridge/servidor'

// Grava um telefone de WhatsApp vinculado no cliente, SEM sobrescrever nada:
// vai para a tabela cliente_telefones (clientes só tem um campo `telefone`).
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!segredoValido(request.headers.get('x-bridge-secret'))) return respostaNaoAutorizada()

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ erro: 'Cliente inválido.' }, { status: 400 })

  const corpo = (await request.json().catch(() => null)) as { phone?: unknown; por_email?: unknown } | null
  const telefone = telefoneComPais(typeof corpo?.phone === 'string' ? corpo.phone : null)
  const chave = chaveTelefone(telefone)
  if (!telefone || !chave) return NextResponse.json({ erro: 'Telefone inválido.' }, { status: 400 })
  const email = typeof corpo?.por_email === 'string' ? corpo.por_email.trim().slice(0, 200) : ''
  if (!email) return NextResponse.json({ erro: 'por_email é obrigatório.' }, { status: 400 })

  const supabase = clienteAdmin()
  try {
    const { data: cliente, error: errCli } = await supabase
      .from('clientes')
      .select('id, telefone')
      .eq('id', id)
      .maybeSingle()
    if (errCli) throw new Error(errCli.message)
    if (!cliente) return NextResponse.json({ erro: 'Cliente não encontrado.' }, { status: 404 })

    if (chaveTelefone(cliente.telefone) === chave) return NextResponse.json({ ja_existia: true })

    const { data: extras, error: errExtra } = await supabase
      .from('cliente_telefones')
      .select('telefone')
      .eq('cliente_id', id)
    if (errExtra) throw new Error(errExtra.message)
    if ((extras ?? []).some((t) => chaveTelefone(t.telefone) === chave)) {
      return NextResponse.json({ ja_existia: true })
    }

    const { error } = await supabase
      .from('cliente_telefones')
      .insert({ cliente_id: id, telefone, origem: 'crm-whatsapp', criado_por_email: email })
    if (error) throw new Error(error.message)

    return NextResponse.json({ ja_existia: false, adicionado: true })
  } catch (err) {
    console.error('[bridge/clientes/telefone]', err instanceof Error ? err.message : err)
    return NextResponse.json({ erro: 'Falha ao gravar.' }, { status: 500 })
  }
}
