import type { createClient } from '@/lib/supabase/client'

type SupabaseBrowserClient = ReturnType<typeof createClient>

// Fase 34: a busca de cliente em Novo Orçamento/Novo Lead consulta primeiro
// a tabela `clientes` local (mais rápida, sem round-trip ao Omie) antes de,
// quando aplicável, cair no Omie/Receita Federal.
export interface ClienteSugestao {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  cnpj: string | null
  telefone: string | null
  contato: string | null
  omieClienteId: number | null
}

// Shape do `select` usado abaixo (subconjunto de `clientes`, não a linha
// inteira) — evita acoplar este mapeamento ao Row completo da tabela.
interface ClienteRowParcial {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  telefone: string | null
  contato: string | null
  omie_cliente_id: number | null
}

function mapear(row: ClienteRowParcial): ClienteSugestao {
  return {
    id: row.id,
    razaoSocial: row.razao_social,
    nomeFantasia: row.nome_fantasia,
    cnpj: row.cnpj,
    telefone: row.telefone,
    contato: row.contato,
    omieClienteId: row.omie_cliente_id,
  }
}

export async function buscarClientesLocalPorNome(
  supabase: SupabaseBrowserClient,
  termo: string,
  limite = 8,
): Promise<ClienteSugestao[]> {
  const termoEscapado = termo.replace(/[%,]/g, '')
  if (!termoEscapado) return []

  const { data, error } = await supabase
    .from('clientes')
    .select('id, razao_social, nome_fantasia, cnpj, telefone, contato, omie_cliente_id')
    .or(`razao_social.ilike.%${termoEscapado}%,nome_fantasia.ilike.%${termoEscapado}%`)
    .limit(limite)

  if (error || !data) return []
  return data.map(mapear)
}

export async function buscarClienteLocalPorCnpj(
  supabase: SupabaseBrowserClient,
  cnpjDigitos: string,
): Promise<ClienteSugestao | null> {
  if (cnpjDigitos.length !== 14) return null

  const { data, error } = await supabase
    .from('clientes')
    .select('id, razao_social, nome_fantasia, cnpj, telefone, contato, omie_cliente_id')
    .eq('cnpj', cnpjDigitos)
    .maybeSingle()

  if (error || !data) return null
  return mapear(data)
}
