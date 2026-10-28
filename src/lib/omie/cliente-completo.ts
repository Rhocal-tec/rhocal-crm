// Dados completos de um cliente no Omie (ConsultarCliente / ListarClientes),
// já normalizados. Arquivo sem dependências de servidor: o client também importa
// os tipos.
export interface ClienteOmieCompleto {
  omieId: number | null
  razaoSocial: string | null
  nomeFantasia: string | null
  cnpj: string | null
  contato: string | null
  telefone1: string | null
  telefone2: string | null
  email: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  inscricaoEstadual: string | null
  observacao: string | null
  inativo: boolean
}

export interface ItemSincronizarOmie {
  omieId: number | null
  cnpj: string | null
}

export function chaveItemOmie(item: ItemSincronizarOmie): string {
  return item.omieId ? `o:${item.omieId}` : `c:${(item.cnpj ?? '').replace(/\D/g, '')}`
}

function texto(v: unknown): string | null {
  if (typeof v === 'number') return String(v)
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function telefone(ddd: unknown, numero: unknown): string | null {
  const n = texto(numero)?.replace(/\D/g, '')
  if (!n) return null
  return `${texto(ddd)?.replace(/\D/g, '') ?? ''}${n}`
}

export function normalizarClienteOmie(c: Record<string, unknown>): ClienteOmieCompleto {
  return {
    omieId: typeof c.codigo_cliente_omie === 'number' ? c.codigo_cliente_omie : null,
    razaoSocial: texto(c.razao_social),
    nomeFantasia: texto(c.nome_fantasia),
    cnpj: texto(c.cnpj_cpf)?.replace(/\D/g, '') || null,
    contato: texto(c.contato),
    telefone1: telefone(c.telefone1_ddd, c.telefone1_numero),
    telefone2: telefone(c.telefone2_ddd, c.telefone2_numero),
    email: texto(c.email),
    endereco: texto(c.endereco),
    numero: texto(c.endereco_numero),
    complemento: texto(c.complemento),
    bairro: texto(c.bairro),
    cidade: texto(c.cidade),
    estado: texto(c.estado),
    cep: texto(c.cep),
    inscricaoEstadual: texto(c.inscricao_estadual),
    observacao: texto(c.observacao),
    inativo: c.inativo === 'S',
  }
}
