'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { formatarDataSomente } from '@/lib/kanban/formatacao'
import { resumirFiltrosSalvos } from './FiltrosInteligencia'
import type { Database } from '@/types/database'

type Campanha = Database['public']['Tables']['campanhas']['Row']
type CampanhaCliente = Database['public']['Tables']['campanha_clientes']['Row']

interface PedidoPosterior {
  id: string
  cliente_nome: string
  cliente_cnpj: string | null
  cliente_omie_id: number | null
  criado_em: string
}

interface ResultadoCampanha {
  total: number
  convertidos: number
}

// Prioridade de identificador cliente_omie_codigo > CNPJ > nome normalizado
// — mesma ordem usada no matching da fase 35. `pedidos` já vem ordenado
// ascendente por criado_em, então o primeiro match é o pedido mais antigo
// depois da campanha.
function encontrarPedidoCorrespondente(
  cliente: CampanhaCliente,
  pedidos: PedidoPosterior[],
): PedidoPosterior | null {
  if (cliente.cliente_omie_codigo) {
    const porOmie = pedidos.find(
      (p) => p.cliente_omie_id !== null && String(p.cliente_omie_id) === cliente.cliente_omie_codigo,
    )
    if (porOmie) return porOmie
  }

  const cnpjCliente = cliente.cliente_cnpj ? cliente.cliente_cnpj.replace(/\D/g, '') : null
  if (cnpjCliente) {
    const porCnpj = pedidos.find((p) => p.cliente_cnpj && p.cliente_cnpj.replace(/\D/g, '') === cnpjCliente)
    if (porCnpj) return porCnpj
  }

  const nomeCliente = cliente.cliente_nome.trim().toLowerCase()
  return pedidos.find((p) => p.cliente_nome.trim().toLowerCase() === nomeCliente) ?? null
}

// Fase 36.3: sub-aba "Campanhas" — lista as campanhas salvas e calcula/
// persiste o resultado (quantos clientes incluídos compraram de novo depois
// da campanha) sob demanda, via "Ver resultado".
export function CampanhasTab() {
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [calculando, setCalculando] = useState<string | null>(null)
  const [resultados, setResultados] = useState<Record<string, ResultadoCampanha>>({})
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaAtiva) return
    let ativo = true
    setCarregando(true)

    supabase
      .from('campanhas')
      .select('*')
      .eq('empresa_id', empresaAtiva.id)
      .order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) {
          setErro('Não foi possível carregar as campanhas.')
        } else {
          setCampanhas(data ?? [])
        }
        setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [supabase, empresaAtiva])

  async function verResultado(campanha: Campanha) {
    setErro(null)
    setCalculando(campanha.id)

    try {
      const { data: clientesCampanha, error: erroClientes } = await supabase
        .from('campanha_clientes')
        .select('*')
        .eq('campanha_id', campanha.id)
      if (erroClientes) throw erroClientes

      const { data: pedidosPosteriores, error: erroPedidos } = await supabase
        .from('pedidos')
        .select('id, cliente_nome, cliente_cnpj, cliente_omie_id, criado_em')
        .eq('empresa_id', campanha.empresa_id)
        .gt('criado_em', campanha.criado_em)
        .order('criado_em', { ascending: true })
      if (erroPedidos) throw erroPedidos

      const pedidos = (pedidosPosteriores ?? []) as PedidoPosterior[]
      const clientesCampanhaLista = (clientesCampanha ?? []) as CampanhaCliente[]

      let convertidos = 0
      await Promise.all(
        clientesCampanhaLista.map(async (cliente) => {
          const pedido = encontrarPedidoCorrespondente(cliente, pedidos)
          if (pedido) {
            convertidos += 1
            await supabase
              .from('campanha_clientes')
              .update({ status: 'convertido', convertido_em: pedido.criado_em, pedido_id: pedido.id })
              .eq('id', cliente.id)
          } else {
            await supabase
              .from('campanha_clientes')
              .update({ status: 'nao_convertido', convertido_em: null, pedido_id: null })
              .eq('id', cliente.id)
          }
        }),
      )

      setResultados((atual) => ({
        ...atual,
        [campanha.id]: { total: clientesCampanhaLista.length, convertidos },
      }))
    } catch (err) {
      console.error('Erro ao calcular resultado da campanha:', err)
      setErro('Não foi possível calcular o resultado desta campanha. Tente novamente.')
    } finally {
      setCalculando(null)
    }
  }

  if (carregando) {
    return <p className="mt-8 text-center text-sm text-muted">Carregando…</p>
  }

  if (campanhas.length === 0) {
    return (
      <p className="mt-8 text-center text-sm text-muted">
        Nenhuma campanha salva ainda. Use &quot;Salvar como campanha&quot; na aba Segmentação.
      </p>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {erro && <p className="text-sm text-accent-danger">{erro}</p>}

      {campanhas.map((campanha) => {
        const resultado = resultados[campanha.id]
        const percentual =
          resultado && resultado.total > 0 ? Math.round((resultado.convertidos / resultado.total) * 100) : null

        return (
          <div key={campanha.id} className="rounded-lg border border-white/10 bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-primary">{campanha.nome}</p>
                {campanha.descricao && <p className="mt-0.5 text-xs text-muted">{campanha.descricao}</p>}
                <p className="mt-1 text-xs text-muted">
                  {formatarDataSomente(campanha.criado_em)} · {campanha.total_clientes} cliente(s)
                </p>
                <p className="mt-1 text-xs text-primary/70">{resumirFiltrosSalvos(campanha.filtros_aplicados)}</p>
              </div>
              <button
                type="button"
                onClick={() => verResultado(campanha)}
                disabled={calculando === campanha.id}
                className="shrink-0 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-primary/80 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {calculando === campanha.id ? 'Calculando…' : 'Ver resultado'}
              </button>
            </div>

            {resultado && (
              <p className="mt-3 rounded-md border border-accent-success/30 bg-accent-success/10 px-3 py-2 text-xs text-accent-success">
                {resultado.convertidos} de {resultado.total} cliente(s) fizeram pelo menos 1 pedido depois desta
                campanha{percentual !== null ? ` (${percentual}%)` : ''}.
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
