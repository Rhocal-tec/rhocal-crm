'use client'

import { useEffect, useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/client'
import { OrcamentoPdfDocument, EMPRESA_PDF_PADRAO } from './OrcamentoPdfDocument'
import type { Database, SetorTipo } from '@/types/database'

type Pedido = Database['public']['Tables']['pedidos']['Row']
type PedidoItem = Database['public']['Tables']['pedido_itens']['Row']
type Empresa = Database['public']['Tables']['empresas']['Row']

export function OrcamentoPdfButton({
  pedido,
  itens,
  setor,
}: {
  pedido: Pedido
  itens: PedidoItem[]
  setor: SetorTipo
}) {
  const [supabase] = useState(() => createClient())
  const [nomeVendedor, setNomeVendedor] = useState<string | null>(null)
  const [empresaPedido, setEmpresaPedido] = useState<Empresa | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const podeBaixar = setor === 'comercial' || setor === 'gestor'
  const todosItensComPreco = itens.length > 0 && itens.every((item) => item.preco_venda !== null)

  useEffect(() => {
    if (!podeBaixar) return
    let ativo = true

    async function carregar() {
      const { data } = await supabase
        .from('profiles')
        .select('nome')
        .eq('id', pedido.criado_por)
        .maybeSingle()
      if (ativo) setNomeVendedor(data?.nome ?? null)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [pedido.criado_por, podeBaixar, supabase])

  // O PDF reflete a empresa DONA do pedido (a que criou), não a empresa
  // ativa no seletor do header no momento de gerar o documento.
  useEffect(() => {
    if (!podeBaixar || !pedido.empresa_id) return
    let ativo = true

    async function carregar() {
      const { data } = await supabase
        .from('empresas')
        .select('*')
        .eq('id', pedido.empresa_id as string)
        .maybeSingle()
      if (ativo) setEmpresaPedido(data ?? null)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [pedido.empresa_id, podeBaixar, supabase])

  if (!podeBaixar) return null

  async function baixarPdf() {
    setErro(null)
    setGerando(true)
    try {
      const blob = await pdf(
        <OrcamentoPdfDocument
          pedido={pedido}
          itens={itens}
          nomeVendedor={nomeVendedor}
          dataEmissao={new Date()}
          empresa={empresaPedido ?? EMPRESA_PDF_PADRAO}
        />,
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `orcamento-${pedido.numero}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch {
      setErro('Não foi possível gerar o PDF. Tente novamente.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <button
        type="button"
        onClick={baixarPdf}
        disabled={!todosItensComPreco || gerando}
        title={
          !todosItensComPreco
            ? 'Preencha o preço de venda de todos os itens para gerar o PDF'
            : undefined
        }
        className="self-start rounded-md border border-accent-primary/40 bg-accent-primary/10 px-3 py-1.5 text-xs font-semibold text-accent-primary transition-colors hover:bg-accent-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {gerando ? 'Gerando PDF…' : 'Baixar PDF do Orçamento'}
      </button>
      {erro && <p className="text-xs text-accent-danger">{erro}</p>}
    </div>
  )
}
