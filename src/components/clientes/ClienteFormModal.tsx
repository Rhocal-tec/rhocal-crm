'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { Modal } from '@/components/ui/Modal'
import { formatarTelefoneInput, formatarCnpjInput } from '@/lib/kanban/formatacao'
import type { Database } from '@/types/database'

type ClienteRow = Database['public']['Tables']['clientes']['Row']

interface FormState {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  telefone: string
  contato: string
  email: string
  logradouro: string
  numero: string
  bairro: string
  cidade: string
  estado: string
  cep: string
  observacoes: string
}

function formVazio(): FormState {
  return {
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    telefone: '',
    contato: '',
    email: '',
    logradouro: '',
    numero: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: '',
    observacoes: '',
  }
}

function formDoCliente(cliente: ClienteRow): FormState {
  return {
    razaoSocial: cliente.razao_social,
    nomeFantasia: cliente.nome_fantasia ?? '',
    cnpj: formatarCnpjInput(cliente.cnpj ?? ''),
    telefone: cliente.telefone ? formatarTelefoneInput(cliente.telefone) : '',
    contato: cliente.contato ?? '',
    email: cliente.email ?? '',
    logradouro: cliente.endereco ?? '',
    numero: cliente.endereco_numero ?? '',
    bairro: cliente.bairro ?? '',
    cidade: cliente.cidade ?? '',
    estado: cliente.estado ?? '',
    cep: cliente.cep ?? '',
    observacoes: cliente.observacoes ?? '',
  }
}

export function ClienteFormModal({
  open,
  onClose,
  clienteExistente,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  clienteExistente: ClienteRow | null
  onSaved: (cliente: ClienteRow) => void
}) {
  const { user } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [form, setForm] = useState<FormState>(formVazio())
  const [omieClienteId, setOmieClienteId] = useState<number | null>(null)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [avisoCnpj, setAvisoCnpj] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Se a sincronização com o Omie falhar no primeiro "Salvar", o cliente já
  // foi salvo localmente (fonte de verdade primária) — guarda o id pra um
  // segundo clique em "Salvar" virar update em vez de tentar inserir de novo
  // e esbarrar no CNPJ já cadastrado.
  const [idSalvoNestaSessao, setIdSalvoNestaSessao] = useState<string | null>(null)

  // Reabre o formulário sempre pronto: vazio pra um cliente novo, ou
  // pré-preenchido quando é edição — inclusive trocando de um cliente pro
  // outro sem fechar e reabrir o modal.
  useEffect(() => {
    if (!open) return
    setForm(clienteExistente ? formDoCliente(clienteExistente) : formVazio())
    setOmieClienteId(clienteExistente?.omie_cliente_id ?? null)
    setAvisoCnpj(null)
    setErro(null)
    setIdSalvoNestaSessao(null)
  }, [open, clienteExistente])

  function atualizarCampo(campo: keyof FormState, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
  }

  function fechar() {
    if (salvando) return
    onClose()
  }

  async function handleBlurCnpj() {
    const digitos = form.cnpj.replace(/\D/g, '')
    if (digitos.length !== 14) {
      setAvisoCnpj(null)
      return
    }

    setAvisoCnpj(null)
    setBuscandoCnpj(true)
    try {
      const respostaOmie = await fetch('/api/omie/buscar-cliente-cnpj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: digitos, empresaSlug: empresaAtiva?.slug }),
      })
      const dadosOmie = await respostaOmie.json().catch(() => null)

      if (respostaOmie.ok && dadosOmie && !dadosOmie.erro && dadosOmie.encontrado && dadosOmie.cliente) {
        setForm((atual) => ({
          ...atual,
          razaoSocial: dadosOmie.cliente.razaoSocial || atual.razaoSocial,
          nomeFantasia: dadosOmie.cliente.nomeFantasia || atual.nomeFantasia,
        }))
        setOmieClienteId(dadosOmie.cliente.codigoClienteOmie)
        setAvisoCnpj(null)
        return
      }

      // Não encontrado no Omie — cai para o fallback da Receita Federal
      // (fase 23), que preenche razão social/nome fantasia/telefone/endereço
      // (o cliente ainda não tem codigo_cliente_omie).
      setOmieClienteId(null)
      const respostaReceita = await fetch('/api/cnpj/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: digitos }),
      })
      const dadosReceita = await respostaReceita.json().catch(() => null)

      if (
        respostaReceita.ok &&
        dadosReceita &&
        !dadosReceita.erro &&
        dadosReceita.encontrado &&
        dadosReceita.cliente
      ) {
        const c = dadosReceita.cliente
        setForm((atual) => ({
          ...atual,
          razaoSocial: c.razaoSocial || c.nomeFantasia || atual.razaoSocial,
          nomeFantasia: c.nomeFantasia || atual.nomeFantasia,
          telefone: c.telefone && !atual.telefone ? formatarTelefoneInput(c.telefone) : atual.telefone,
          logradouro: c.logradouro || atual.logradouro,
          numero: c.numero || atual.numero,
          bairro: c.bairro || atual.bairro,
          cidade: c.municipio || atual.cidade,
          estado: c.uf || atual.estado,
          cep: c.cep || atual.cep,
        }))
        setAvisoCnpj('Cliente encontrado na Receita Federal, mas ainda não está cadastrado no Omie.')
        return
      }

      setAvisoCnpj('CNPJ não encontrado no Omie nem na Receita Federal — preencha manualmente.')
    } catch {
      setAvisoCnpj('Não foi possível consultar CNPJ agora. Preencha manualmente.')
    } finally {
      setBuscandoCnpj(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!user) return

    const razaoSocial = form.razaoSocial.trim()
    const cnpjDigitos = form.cnpj.replace(/\D/g, '')
    if (!razaoSocial) {
      setErro('Informe a razão social.')
      return
    }
    if (cnpjDigitos.length !== 14) {
      setErro('Informe um CNPJ válido (14 dígitos).')
      return
    }

    setSalvando(true)

    // Sincroniza com o Omie primeiro (Incluir ou Alterar, conforme já exista
    // omie_cliente_id) — best-effort: se falhar, segue salvando localmente
    // mesmo assim, só avisando no banner (fase 34, mesmo padrão das outras
    // integrações Omie: nunca bloqueia o CRM).
    const telefoneDigitos = form.telefone.replace(/\D/g, '')
    const telefoneDdd = telefoneDigitos.length >= 10 ? telefoneDigitos.slice(0, 2) : ''
    const telefoneNumero = telefoneDigitos.length >= 10 ? telefoneDigitos.slice(2) : ''

    let omieClienteIdFinal = omieClienteId
    let avisoSincronizacao: string | null = null

    try {
      const resposta = await fetch('/api/omie/cadastrar-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razaoSocial,
          nomeFantasia: form.nomeFantasia.trim(),
          cnpj: cnpjDigitos,
          telefoneDdd,
          telefoneNumero,
          endereco: form.logradouro.trim(),
          enderecoNumero: form.numero.trim(),
          bairro: form.bairro.trim(),
          cidade: form.cidade.trim(),
          estado: form.estado.trim(),
          email: form.email.trim(),
          empresaSlug: empresaAtiva?.slug,
          codigoClienteOmie: omieClienteId ?? undefined,
        }),
      })
      const dados = await resposta.json().catch(() => null)

      if (resposta.ok && dados && typeof dados.codigoClienteOmie === 'number') {
        omieClienteIdFinal = dados.codigoClienteOmie
      } else {
        avisoSincronizacao =
          dados?.erro ?? 'Não foi possível sincronizar com o Omie agora. O cliente foi salvo só localmente.'
      }
    } catch {
      avisoSincronizacao = 'Não foi possível sincronizar com o Omie agora. O cliente foi salvo só localmente.'
    }

    const linha = {
      razao_social: razaoSocial,
      nome_fantasia: form.nomeFantasia.trim() || null,
      cnpj: cnpjDigitos,
      telefone: form.telefone.trim() || null,
      contato: form.contato.trim() || null,
      email: form.email.trim() || null,
      endereco: form.logradouro.trim() || null,
      endereco_numero: form.numero.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim() || null,
      estado: form.estado.trim() || null,
      cep: form.cep.trim() || null,
      observacoes: form.observacoes.trim() || null,
      omie_cliente_id: omieClienteIdFinal,
    }

    const idParaAtualizar = clienteExistente?.id ?? idSalvoNestaSessao

    const { data: salvo, error } = idParaAtualizar
      ? await supabase.from('clientes').update(linha).eq('id', idParaAtualizar).select().single()
      : await supabase
          .from('clientes')
          .insert({ ...linha, criado_por: user.id })
          .select()
          .single()

    setSalvando(false)

    if (error || !salvo) {
      setErro(
        error?.message.includes('clientes_cnpj_unico')
          ? 'Já existe um cliente cadastrado com este CNPJ.'
          : 'Não foi possível salvar o cliente. Tente novamente.',
      )
      return
    }

    setIdSalvoNestaSessao(salvo.id)
    onSaved(salvo)

    if (avisoSincronizacao) {
      setErro(avisoSincronizacao)
      return
    }

    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title={clienteExistente ? 'Editar Cliente' : 'Novo Cliente'}
      widthClassName="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-primary/80">CNPJ</label>
          <div className="relative mt-1 w-1/2 min-w-[220px]">
            <input
              type="text"
              inputMode="numeric"
              value={form.cnpj}
              onChange={(e) => atualizarCampo('cnpj', formatarCnpjInput(e.target.value))}
              onBlur={handleBlurCnpj}
              className="input-field w-full rounded-md px-3 py-2 pr-9 font-mono text-sm"
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
          {omieClienteId !== null && (
            <p className="mt-1 text-xs text-accent-success">
              ✓ Sincronizado com o Omie (código #{omieClienteId})
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-primary/80">Razão social</label>
            <input
              type="text"
              value={form.razaoSocial}
              onChange={(e) => atualizarCampo('razaoSocial', e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              disabled={salvando}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary/80">
              Nome fantasia (opcional)
            </label>
            <input
              type="text"
              value={form.nomeFantasia}
              onChange={(e) => atualizarCampo('nomeFantasia', e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              disabled={salvando}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-primary/80">
              Telefone (opcional)
            </label>
            <input
              type="tel"
              value={form.telefone}
              onChange={(e) => atualizarCampo('telefone', formatarTelefoneInput(e.target.value))}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="(11) 91234-5678"
              disabled={salvando}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary/80">Contato (opcional)</label>
            <input
              type="text"
              value={form.contato}
              onChange={(e) => atualizarCampo('contato', e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="Ex: Maria Compras"
              disabled={salvando}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary/80">E-mail (opcional)</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => atualizarCampo('email', e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              disabled={salvando}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-primary/80">
              Logradouro (opcional)
            </label>
            <input
              type="text"
              value={form.logradouro}
              onChange={(e) => atualizarCampo('logradouro', e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              disabled={salvando}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary/80">Número (opcional)</label>
            <input
              type="text"
              value={form.numero}
              onChange={(e) => atualizarCampo('numero', e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              disabled={salvando}
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-primary/80">Bairro (opcional)</label>
            <input
              type="text"
              value={form.bairro}
              onChange={(e) => atualizarCampo('bairro', e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              disabled={salvando}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary/80">Cidade (opcional)</label>
            <input
              type="text"
              value={form.cidade}
              onChange={(e) => atualizarCampo('cidade', e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              disabled={salvando}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary/80">UF</label>
            <input
              type="text"
              maxLength={2}
              value={form.estado}
              onChange={(e) => atualizarCampo('estado', e.target.value.toUpperCase())}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm uppercase"
              disabled={salvando}
            />
          </div>
        </div>

        <div className="w-1/4 min-w-[130px]">
          <label className="block text-sm font-medium text-primary/80">CEP (opcional)</label>
          <input
            type="text"
            value={form.cep}
            onChange={(e) => atualizarCampo('cep', e.target.value)}
            className="input-field mt-1 w-full rounded-md px-3 py-2 font-mono text-sm"
            disabled={salvando}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-primary/80">Observações (opcional)</label>
          <textarea
            value={form.observacoes}
            onChange={(e) => atualizarCampo('observacoes', e.target.value)}
            rows={3}
            className="input-field mt-1 w-full resize-none rounded-md px-3 py-2 text-sm"
            placeholder="Preferências, particularidades do relacionamento, etc."
            disabled={salvando}
          />
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
            {erro ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
