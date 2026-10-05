import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { chamarOmie, obterCredenciaisOmiePorSlug } from '@/lib/omie/chamar-omie'

// Nunca expor OMIE_APP_KEY_*/OMIE_APP_SECRET_* no client — só lidas aqui, server-side.
const OMIE_CLIENTES_URL = 'https://app.omie.com.br/api/v1/geral/clientes/'

const MAX_CODIGOS = 60
const CONCORRENCIA = 5

function campoTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

// Telefone principal do cadastro Omie (DDD + número, só dígitos); cai pro
// telefone 2 e pro celular-comercial se o 1 estiver vazio.
function extrairTelefone(cadastro: Record<string, unknown>): string | null {
  for (const n of ['1', '2']) {
    const ddd = campoTexto(cadastro[`telefone${n}_ddd`])
    const numero = campoTexto(cadastro[`telefone${n}_numero`])
    if (numero) return `${ddd ?? ''}${numero}`.replace(/\D/g, '')
  }
  return null
}

// Busca o telefone de clientes direto no Omie (ConsultarCliente), para os que
// ainda não foram importados pro cadastro `clientes` do CRM. Só leitura — não
// grava nada no banco.
export async function POST(request: Request) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const empresaSlug = typeof body?.empresaSlug === 'string' ? body.empresaSlug : null
  const codigos: number[] = Array.isArray(body?.codigos)
    ? Array.from(
        new Set(
          (body.codigos as unknown[])
            .map((c) => Number(c))
            .filter((n) => Number.isFinite(n) && n > 0),
        ),
      ).slice(0, MAX_CODIGOS)
    : []

  if (!empresaSlug) {
    return NextResponse.json({ erro: 'Empresa não informada.' }, { status: 400 })
  }
  if (codigos.length === 0) {
    return NextResponse.json({ telefones: {} })
  }

  try {
    const credenciais = obterCredenciaisOmiePorSlug(empresaSlug)
    const telefones: Record<string, string> = {}
    const fila = [...codigos]

    const trabalhador = async () => {
      while (fila.length > 0) {
        const codigo = fila.shift()
        if (codigo === undefined) return
        try {
          const cadastro = await chamarOmie(
            OMIE_CLIENTES_URL,
            'ConsultarCliente',
            { codigo_cliente_omie: codigo },
            credenciais,
          )
          const telefone = extrairTelefone(cadastro)
          if (telefone) telefones[String(codigo)] = telefone
        } catch {
          // Cliente não encontrado/erro pontual: segue sem telefone.
        }
      }
    }

    await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador))

    return NextResponse.json({ telefones })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Erro ao consultar o Omie.'
    return NextResponse.json({ erro: mensagem }, { status: 500 })
  }
}
