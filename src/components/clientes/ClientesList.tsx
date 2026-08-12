'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { formatarTelefoneInput, formatarCnpjInput } from '@/lib/kanban/formatacao'
import { ClienteFormModal } from './ClienteFormModal'
import type { Database, SetorTipo } from '@/types/database'

type Cliente = Database['public']['Tables']['clientes']['Row']

// Fase 34: cadastro próprio de clientes, visível a todos os perfis. Não é
// escopado por empresa (clientes são compartilhados entre RHOCAL/MATSEG no
// Omie — ver CLAUDE.md) — só o botão de importação usa a empresa ativa para
// resolver as credenciais Omie.
export function ClientesList({ setor }: { setor: SetorTipo }) {
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [termo, setTermo] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null)
  const [importando, setImportando] = useState(false)
  const [mensagemImportacao, setMensagemImportacao] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setLoading(true)

    supabase
      .from('clientes')
      .select('*')
      .order('razao_social', { ascending: true })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) console.error('Erro ao carregar clientes:', error.message)
        setClientes(data ?? [])
        setLoading(false)
      })

    return () => {
      ativo = false
    }
  }, [supabase])

  useEffect(() => {
    if (!mensagemImportacao) return
    const timeout = setTimeout(() => setMensagemImportacao(null), 8000)
    return () => clearTimeout(timeout)
  }, [mensagemImportacao])

  const clientesFiltrados = useMemo(() => {
    const termoBusca = termo.trim().toLowerCase()
    if (!termoBusca) return clientes
    const termoDigitos = termoBusca.replace(/\D/g, '')
    return clientes.filter((c) => {
      const nomeBate =
        c.razao_social.toLowerCase().includes(termoBusca) ||
        (c.nome_fantasia ?? '').toLowerCase().includes(termoBusca)
      const cnpjBate = termoDigitos.length >= 3 && (c.cnpj ?? '').includes(termoDigitos)
      return nomeBate || cnpjBate
    })
  }, [clientes, termo])

  function abrirNovo() {
    setClienteEditando(null)
    setModalAberto(true)
  }

  function abrirEdicao(cliente: Cliente) {
    setClienteEditando(cliente)
    setModalAberto(true)
  }

  function aoSalvar(cliente: Cliente) {
    setClientes((atual) => {
      const existe = atual.some((c) => c.id === cliente.id)
      const atualizados = existe ? atual.map((c) => (c.id === cliente.id ? cliente : c)) : [...atual, cliente]
      return [...atualizados].sort((a, b) => a.razao_social.localeCompare(b.razao_social))
    })
    setClienteEditando(cliente)
  }

  async function importarDoOmie() {
    if (!empresaAtiva) return
    setImportando(true)
    setMensagemImportacao(null)

    try {
      const resposta = await fetch('/api/omie/importar-clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaSlug: empresaAtiva.slug }),
      })
      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok || !dados || dados.erro) {
        setMensagemImportacao(dados?.erro ?? 'Não foi possível importar clientes do Omie agora.')
        return
      }

      const partes = [`${dados.importadas} novo(s) cliente(s) importado(s) do Omie`]
      if (dados.ignoradas > 0) partes.push(`${dados.ignoradas} já existiam`)
      setMensagemImportacao(`${partes.join(' · ')}.`)

      if (dados.importadas > 0) {
        const { data } = await supabase.from('clientes').select('*').order('razao_social', { ascending: true })
        if (data) setClientes(data)
      }
    } catch {
      setMensagemImportacao('Não foi possível importar clientes do Omie agora.')
    } finally {
      setImportando(false)
    }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-muted">Carregando clientes…</div>
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4">
        <input
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar por nome ou CNPJ…"
          className="input-field w-full max-w-sm rounded-md px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          {setor === 'gestor' && (
            <button
              onClick={importarDoOmie}
              disabled={importando || !empresaAtiva}
              className="rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-2 text-sm font-medium text-accent-compras transition-colors hover:bg-accent-compras/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importando ? 'Importando…' : 'Importar clientes do Omie'}
            </button>
          )}
          <button
            onClick={abrirNovo}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark"
          >
            + Novo Cliente
          </button>
        </div>
      </div>

      {mensagemImportacao && (
        <div className="mx-6 mt-4 rounded-md border border-accent-compras/40 bg-accent-compras/10 px-4 py-2 text-sm text-accent-compras">
          {mensagemImportacao}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {clientesFiltrados.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted">
            {clientes.length === 0
              ? 'Nenhum cliente cadastrado ainda.'
              : 'Nenhum cliente encontrado para essa busca.'}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Razão social</th>
                  <th className="px-4 py-2.5 font-medium">CNPJ</th>
                  <th className="px-4 py-2.5 font-medium">Telefone</th>
                  <th className="px-4 py-2.5 font-medium">Cidade/UF</th>
                  <th className="px-4 py-2.5 font-medium">Omie</th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((cliente) => (
                  <tr
                    key={cliente.id}
                    onClick={() => abrirEdicao(cliente)}
                    className="cursor-pointer border-t border-white/5 hover:bg-white/5"
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-primary">{cliente.razao_social}</span>
                      {cliente.nome_fantasia && (
                        <span className="ml-1.5 text-xs text-muted">({cliente.nome_fantasia})</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-primary/80">
                      {cliente.cnpj ? formatarCnpjInput(cliente.cnpj) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-primary/80">
                      {cliente.telefone ? formatarTelefoneInput(cliente.telefone) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-primary/80">
                      {cliente.cidade ? `${cliente.cidade}${cliente.estado ? `/${cliente.estado}` : ''}` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {cliente.omie_cliente_id ? (
                        <span className="rounded-full bg-accent-success/15 px-2 py-0.5 text-xs font-medium text-accent-success">
                          ✓ #{cliente.omie_cliente_id}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ClienteFormModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        clienteExistente={clienteEditando}
        onSaved={aoSalvar}
      />
    </div>
  )
}
