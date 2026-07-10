'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Modal } from '@/components/ui/Modal'

interface ItemForm {
  descricao: string
  quantidade: string
  ca: string
}

function itemVazio(): ItemForm {
  return { descricao: '', quantidade: '1', ca: '' }
}

export function NovoOrcamentoModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [cnpj, setCnpj] = useState('')
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [avisoCnpj, setAvisoCnpj] = useState<string | null>(null)
  const [clienteOmieId, setClienteOmieId] = useState<number | null>(null)
  const [clienteNome, setClienteNome] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([itemVazio()])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function resetar() {
    setCnpj('')
    setBuscandoCnpj(false)
    setAvisoCnpj(null)
    setClienteOmieId(null)
    setClienteNome('')
    setItens([itemVazio()])
    setErro(null)
  }

  async function handleBlurCnpj() {
    const digitos = cnpj.replace(/\D/g, '')
    if (digitos.length !== 14) {
      setAvisoCnpj(null)
      return
    }

    setAvisoCnpj(null)
    setBuscandoCnpj(true)
    try {
      const resposta = await fetch('/api/omie/buscar-cliente-cnpj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: digitos }),
      })
      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok || !dados || dados.erro) {
        setClienteOmieId(null)
        setAvisoCnpj('Não foi possível consultar o Omie agora. Preencha o nome manualmente.')
        return
      }

      if (dados.encontrado && dados.cliente) {
        setClienteNome(dados.cliente.razaoSocial)
        setClienteOmieId(dados.cliente.codigoClienteOmie)
        setAvisoCnpj(null)
      } else {
        setClienteOmieId(null)
        setAvisoCnpj('CNPJ não encontrado no Omie — preencha o nome manualmente.')
      }
    } finally {
      setBuscandoCnpj(false)
    }
  }

  function fechar() {
    if (salvando) return
    resetar()
    onClose()
  }

  function atualizarItem(index: number, campo: keyof ItemForm, valor: string) {
    setItens((atual) =>
      atual.map((item, i) => (i === index ? { ...item, [campo]: valor } : item)),
    )
  }

  function adicionarItem() {
    setItens((atual) => [...atual, itemVazio()])
  }

  function removerItem(index: number) {
    setItens((atual) => atual.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!user) return

    const clienteValido = clienteNome.trim()
    if (!clienteValido) {
      setErro('Informe o nome do cliente.')
      return
    }

    const itensValidos = itens.map((item) => ({
      descricao: item.descricao.trim(),
      quantidade: Number(item.quantidade),
      ca: item.ca.trim() || null,
    }))

    if (itensValidos.length === 0) {
      setErro('Adicione ao menos um item.')
      return
    }
    const itemInvalido = itensValidos.find(
      (item) => !item.descricao || !Number.isFinite(item.quantidade) || item.quantidade <= 0,
    )
    if (itemInvalido) {
      setErro('Cada item precisa de descrição e quantidade maior que zero.')
      return
    }

    setSalvando(true)

    const { data: pedido, error: erroPedido } = await supabase
      .from('pedidos')
      .insert({
        cliente_nome: clienteValido,
        cliente_omie_id: clienteOmieId,
        criado_por: user.id,
      })
      .select()
      .single()

    if (erroPedido || !pedido) {
      setErro('Não foi possível criar o orçamento. Tente novamente.')
      setSalvando(false)
      return
    }

    const { error: erroItens } = await supabase.from('pedido_itens').insert(
      itensValidos.map((item) => ({
        pedido_id: pedido.id,
        descricao: item.descricao,
        quantidade: item.quantidade,
        ca: item.ca,
      })),
    )

    if (erroItens) {
      setErro(
        'O orçamento foi criado, mas houve um erro ao salvar os itens. Abra o pedido para conferir.',
      )
      setSalvando(false)
      return
    }

    setSalvando(false)
    resetar()
    onClose()
  }

  return (
    <Modal open={open} onClose={fechar} title="Novo Orçamento" widthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="block text-sm font-medium text-primary/80">CNPJ (opcional)</label>
          <div className="relative mt-1">
            <input
              type="text"
              inputMode="numeric"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              onBlur={handleBlurCnpj}
              className="input-field w-full rounded-md px-3 py-2 pr-9 text-sm"
              placeholder="00.000.000/0000-00"
              disabled={salvando}
            />
            {buscandoCnpj && (
              <span
                aria-hidden="true"
                className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-accent-primary"
              />
            )}
          </div>
          {avisoCnpj && <p className="mt-1 text-xs text-muted">{avisoCnpj}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-primary/80">Nome do cliente</label>
          <input
            type="text"
            value={clienteNome}
            onChange={(e) => setClienteNome(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
            placeholder="Ex: Cliente Teste LTDA"
            disabled={salvando}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-primary/80">Itens</span>
            <button
              type="button"
              onClick={adicionarItem}
              disabled={salvando}
              className="text-sm font-medium text-accent-compras hover:text-primary"
            >
              + Adicionar item
            </button>
          </div>

          <div className="mt-2 flex flex-col gap-3">
            {itens.map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-md border border-white/10 bg-surface-alt p-3"
              >
                <div className="grid flex-1 grid-cols-6 gap-2">
                  <div className="col-span-3">
                    <label className="block text-xs text-muted">Descrição *</label>
                    <input
                      type="text"
                      value={item.descricao}
                      onChange={(e) =>
                        atualizarItem(index, 'descricao', e.target.value)
                      }
                      className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                      disabled={salvando}
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs text-muted">Qtd. *</label>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      value={item.quantidade}
                      onChange={(e) =>
                        atualizarItem(index, 'quantidade', e.target.value)
                      }
                      className="input-field mt-1 w-full rounded-md px-2 py-1.5 font-mono text-sm"
                      disabled={salvando}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-muted">CA (opcional)</label>
                    <input
                      type="text"
                      value={item.ca}
                      onChange={(e) => atualizarItem(index, 'ca', e.target.value)}
                      className="input-field mt-1 w-full rounded-md px-2 py-1.5 font-mono text-sm"
                      disabled={salvando}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removerItem(index)}
                  disabled={salvando || itens.length === 1}
                  title={
                    itens.length === 1
                      ? 'É necessário ao menos 1 item'
                      : 'Remover item'
                  }
                  className="mt-5 rounded-md p-1.5 text-muted hover:bg-white/10 hover:text-accent-danger disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {erro && (
          <div className="rounded-md border border-accent-danger/30 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={fechar}
            disabled={salvando}
            className="rounded-md border border-white/15 px-4 py-2 text-sm text-primary/80 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
          >
            {salvando ? 'Criando…' : 'Criar Orçamento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
