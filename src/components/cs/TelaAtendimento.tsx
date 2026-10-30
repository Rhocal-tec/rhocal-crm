'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarCnpjInput, formatarDataSomente, formatarMoeda, formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { STATUS_LABELS } from '@/lib/kanban/status'
import {
  CANAIS,
  FASE_BADGE,
  FASE_LABELS,
  MOTIVOS_ESCOLHA,
  MOTIVOS_NOTA,
  ORIGENS,
  ROTEIROS,
} from '@/lib/cs/constantes'
import type { ItemFila } from '@/lib/cs/fila'
import { chaveItemOmie, type ClienteOmieCompleto } from '@/lib/omie/cliente-completo'
import { podeVerReclamacoesCS } from '@/lib/cs/permissions'
import type { DadosCS } from '@/lib/cs/useDadosCS'
import { FichaClienteModal } from '@/components/inteligencia/FichaClienteModal'
import { ClienteFormModal } from '@/components/clientes/ClienteFormModal'
import { ReclamacaoForm } from './ReclamacaoForm'
import { RepasseForm } from './RepasseForm'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']
type ClienteRow = Database['public']['Tables']['clientes']['Row']

interface PesquisaForm {
  nota: number | null
  motivos: string[]
  comentario: string
  p1: string
  p2: string[]
  p3Sim: boolean | null
  p3Nome: string
  p3Texto: string
  p4: string
  p5: string
  ajustes: string
  proximaReposicao: string
  aceita: boolean | null
}

const PESQUISA_VAZIA: PesquisaForm = {
  nota: null,
  motivos: [],
  comentario: '',
  p1: '',
  p2: [],
  p3Sim: null,
  p3Nome: '',
  p3Texto: '',
  p4: '',
  p5: '',
  ajustes: '',
  proximaReposicao: '',
  aceita: null,
}

function maisFrequentes(valores: (string | null)[], limite = 6): string[] {
  const contagem = new Map<string, number>()
  for (const v of valores) {
    const t = v?.trim()
    if (!t) continue
    contagem.set(t, (contagem.get(t) ?? 0) + 1)
  }
  return Array.from(contagem.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([t]) => t)
}

function alternar(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        ativo
          ? 'border-accent-primary bg-accent-primary/20 text-accent-primary'
          : 'border-white/15 text-primary/80 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

export function TelaAtendimento({
  item,
  proximo,
  dados,
  empresaId,
  empresaNome,
  empresaSlug,
  profile,
  onSair,
  onProximo,
  recarregar,
}: {
  item: ItemFila
  proximo: ItemFila | null
  dados: DadosCS
  empresaId: string
  empresaNome: string
  empresaSlug: string
  profile: Profile
  onSair: () => void
  onProximo: (proximo: ItemFila | null) => void
  recarregar: () => void
}) {
  const [supabase] = useState(() => createClient())
  const { cliente, fase } = item
  const cnpjDigitos = cliente.cnpj?.replace(/\D/g, '') ?? null

  // Retoma um rascunho em andamento deste cliente/fase, se houver.
  const rascunho = useMemo(
    () => dados.contatos.find((c) => c.cliente_chave === cliente.chave && c.fase === fase && c.status === 'em_andamento'),
    [dados.contatos, cliente.chave, fase],
  )
  const pesquisaRascunho = useMemo(
    () => (rascunho ? dados.pesquisas.find((p) => p.contato_id === rascunho.id) : undefined),
    [dados.pesquisas, rascunho],
  )

  const [contatoId, setContatoId] = useState<string | null>(rascunho?.id ?? null)
  const contatoIdRef = useRef<string | null>(rascunho?.id ?? null)
  const criandoRef = useRef<Promise<string | null> | null>(null)
  const [canal, setCanal] = useState(rascunho?.canal ?? 'whatsapp')
  const [observacao, setObservacao] = useState(rascunho?.observacao ?? '')
  const [pesquisa, setPesquisa] = useState<PesquisaForm>(
    pesquisaRascunho
      ? {
          nota: pesquisaRascunho.nota,
          motivos: pesquisaRascunho.motivos,
          comentario: pesquisaRascunho.comentario ?? '',
          p1: pesquisaRascunho.p1_palavra ?? '',
          p2: pesquisaRascunho.p2_motivos,
          p3Sim: pesquisaRascunho.p3_outros_fornecedores,
          p3Nome: pesquisaRascunho.p3_nome ?? '',
          p3Texto: pesquisaRascunho.p3_texto ?? '',
          p4: pesquisaRascunho.p4_mudaria ?? '',
          p5: pesquisaRascunho.p5_origem ?? '',
          ajustes: pesquisaRascunho.ajustes_pedido ?? '',
          proximaReposicao: pesquisaRascunho.proxima_reposicao ?? '',
          aceita: pesquisaRascunho.aceita_contato,
        }
      : PESQUISA_VAZIA,
  )
  const [sujo, setSujo] = useState(false)
  const [estadoSalvo, setEstadoSalvo] = useState<'' | 'salvando' | 'salvo' | 'erro'>('')
  const [reclamacaoAberta, setReclamacaoAberta] = useState(false)
  // Houve repasse neste atendimento: o contato conta hoje e volta na fila amanhã.
  const [repasseFeito, setRepasseFeito] = useState(false)
  const [modalReclamacao, setModalReclamacao] = useState(false)
  const [modalRepasse, setModalRepasse] = useState(false)
  const [fichaAberta, setFichaAberta] = useState(false)
  const [cadastroAberto, setCadastroAberto] = useState(false)
  const [cadastroExistente, setCadastroExistente] = useState<ClienteRow | null>(null)
  const [abrindoCadastro, setAbrindoCadastro] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Abre o cadastro do cliente para a CS completar telefone, contato, e-mail etc.
  async function abrirCadastro() {
    setAbrindoCadastro(true)
    let achado: ClienteRow | null = null
    if (cliente.clienteId) {
      const { data } = await supabase.from('clientes').select('*').eq('id', cliente.clienteId).maybeSingle()
      achado = data
    }
    if (!achado && cliente.omieClienteId) {
      const { data } = await supabase.from('clientes').select('*').eq('omie_cliente_id', cliente.omieClienteId).limit(1)
      achado = data?.[0] ?? null
    }
    if (!achado && cnpjDigitos) {
      const { data } = await supabase.from('clientes').select('*').eq('cnpj', cnpjDigitos).limit(1)
      achado = data?.[0] ?? null
    }
    setCadastroExistente(achado)
    setAbrindoCadastro(false)
    setCadastroAberto(true)
  }

  // Dados completos do cliente no Omie (telefones, e-mail, contato, endereço…). Também
  // são gravados no cadastro do CRM, só nos campos que estavam vazios.
  const [omie, setOmie] = useState<ClienteOmieCompleto | null>(null)
  const [omieEstado, setOmieEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')
  const [omieErro, setOmieErro] = useState<string | null>(null)
  const [omieVersao, setOmieVersao] = useState(0)
  useEffect(() => {
    const item = { omieId: cliente.omieClienteId, cnpj: cliente.cnpj }
    if (!item.omieId && !(item.cnpj ?? '').replace(/\D/g, '')) {
      setOmieEstado('erro')
      setOmieErro('Cliente sem código nem CNPJ para consultar no Omie.')
      return
    }
    let ativo = true
    setOmieEstado('carregando')
    setOmieErro(null)
    fetch('/api/omie/cliente-completo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresaSlug, itens: [item] }),
    })
      .then(async (r) => {
        const json = (await r.json().catch(() => null)) as {
          erro?: string
          resultados?: Record<string, { dados: ClienteOmieCompleto | null; erro: string | null }>
          persistidos?: number
        } | null
        if (!ativo) return
        if (!r.ok || !json) throw new Error(json?.erro ?? 'Não foi possível consultar o Omie.')
        const res = json.resultados?.[chaveItemOmie(item)]
        if (!res?.dados) throw new Error(res?.erro ?? 'Cliente não encontrado no Omie.')
        setOmie(res.dados)
        setOmieEstado('ok')
        if ((json.persistidos ?? 0) > 0) recarregar()
      })
      .catch((e: unknown) => {
        if (!ativo) return
        setOmieEstado('erro')
        setOmieErro(e instanceof Error ? e.message : 'Erro ao consultar o Omie.')
      })
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.chave, empresaSlug, omieVersao])
  const telefoneEfetivo = cliente.telefone ?? omie?.telefone1 ?? omie?.telefone2 ?? null
  const contatoEfetivo = cliente.contato ?? omie?.contato ?? null
  const emailEfetivo = cliente.email ?? omie?.email ?? null

  // Cria o contato (rascunho) na primeira interação — nada é gravado se a CS só abrir e pular.
  const garantirContato = useCallback(async (): Promise<string | null> => {
    if (contatoIdRef.current) return contatoIdRef.current
    if (criandoRef.current) return criandoRef.current
    criandoRef.current = (async () => {
      const { data, error } = await supabase
        .from('cs_contatos')
        .insert({
          empresa_id: empresaId,
          cliente_chave: cliente.chave,
          cliente_nome: cliente.nome,
          cliente_cnpj: cnpjDigitos,
          fase,
          canal,
          status: 'em_andamento',
          usuario_id: profile.id,
        })
        .select('id')
        .single()
      criandoRef.current = null
      if (error || !data) {
        setErro(`Não foi possível iniciar o registro: ${error?.message ?? 'sem resposta'}`)
        return null
      }
      contatoIdRef.current = data.id
      setContatoId(data.id)
      return data.id
    })()
    return criandoRef.current
  }, [supabase, empresaId, cliente.chave, cliente.nome, cnpjDigitos, fase, canal, profile.id])

  const persistir = useCallback(async () => {
    setEstadoSalvo('salvando')
    const id = await garantirContato()
    if (!id) {
      setEstadoSalvo('erro')
      return
    }
    const [r1, r2] = await Promise.all([
      supabase.from('cs_contatos').update({ canal, observacao: observacao.trim() || null }).eq('id', id),
      supabase.from('cs_pesquisas').upsert(
        {
          contato_id: id,
          nota: pesquisa.nota,
          motivos: pesquisa.motivos,
          comentario: pesquisa.comentario.trim() || null,
          p1_palavra: pesquisa.p1.trim() || null,
          p2_motivos: pesquisa.p2,
          p3_outros_fornecedores: pesquisa.p3Sim,
          p3_nome: pesquisa.p3Nome.trim() || null,
          p3_texto: pesquisa.p3Texto.trim() || null,
          p4_mudaria: pesquisa.p4.trim() || null,
          p5_origem: pesquisa.p5 || null,
          ajustes_pedido: pesquisa.ajustes.trim() || null,
          proxima_reposicao: pesquisa.proximaReposicao || null,
          aceita_contato: pesquisa.aceita,
        },
        { onConflict: 'contato_id' },
      ),
    ])
    setEstadoSalvo(r1.error || r2.error ? 'erro' : 'salvo')
    if (!r1.error && !r2.error) setSujo(false)
  }, [garantirContato, supabase, canal, observacao, pesquisa])

  // Salvamento automático: meio segundo depois da última alteração.
  useEffect(() => {
    if (!sujo) return
    const t = setTimeout(() => {
      void persistir()
    }, 500)
    return () => clearTimeout(t)
  }, [sujo, persistir])

  function alterar(patch: Partial<PesquisaForm>) {
    setPesquisa((atual) => ({ ...atual, ...patch }))
    setSujo(true)
  }

  function definirNota(n: number) {
    alterar({ nota: n })
    // Nota de 0 a 6 abre sozinha o formulário de reclamação, já ligado ao atendimento.
    if (n <= 6 && !reclamacaoAberta) setModalReclamacao(true)
  }

  async function finalizar(status: 'respondeu' | 'sem_retorno') {
    setErro(null)
    setFinalizando(true)
    await persistir()
    const id = contatoIdRef.current ?? (await garantirContato())
    if (!id) {
      setFinalizando(false)
      return
    }
    const { error } = await supabase
      .from('cs_contatos')
      .update({
        status: reclamacaoAberta ? 'reclamacao_aberta' : repasseFeito ? 'repassado' : status,
        canal,
        observacao: observacao.trim() || null,
      })
      .eq('id', id)
    setFinalizando(false)
    if (error) {
      setErro(`Não foi possível fechar o registro: ${error.message}`)
      return
    }
    recarregar()
    onProximo(proximo)
  }

  // Atalhos: 0–9 e "1" seguido de "0" (10) para a nota; Ctrl+Enter = salvar e próximo.
  const finalizarRef = useRef(finalizar)
  finalizarRef.current = finalizar
  const definirNotaRef = useRef(definirNota)
  definirNotaRef.current = definirNota
  useEffect(() => {
    let pendenteUm: ReturnType<typeof setTimeout> | null = null
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null
      const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT')
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void finalizarRef.current('respondeu')
        return
      }
      if (digitando || e.ctrlKey || e.metaKey || e.altKey) return
      if (!/^[0-9]$/.test(e.key)) return
      if (pendenteUm) {
        clearTimeout(pendenteUm)
        pendenteUm = null
        if (e.key === '0') {
          definirNotaRef.current(10)
          return
        }
        definirNotaRef.current(1)
      }
      if (e.key === '1') {
        pendenteUm = setTimeout(() => {
          pendenteUm = null
          definirNotaRef.current(1)
        }, 450)
        return
      }
      definirNotaRef.current(Number(e.key))
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (pendenteUm) clearTimeout(pendenteUm)
    }
  }, [])

  const sugestoesP1 = useMemo(() => maisFrequentes(dados.pesquisas.map((p) => p.p1_palavra)), [dados.pesquisas])
  const concorrentes = useMemo(() => maisFrequentes(dados.pesquisas.map((p) => p.p3_nome), 10), [dados.pesquisas])

  const produtos = cliente.itensMaisComprados.slice(0, 2).map((i) => i.descricao).join(' e ') || 'seus produtos'
  const nomeContato = (contatoEfetivo ?? '').split(/[—,·]/)[0].trim() || cliente.nome
  const mensagem = ROTEIROS[fase].mensagem
    .replace(/\{nome\}/g, nomeContato)
    .replace(/\{empresa\}/g, empresaNome)
    .replace(/\{produtos\}/g, produtos)
  const telefoneDigitos = (telefoneEfetivo ?? '').replace(/\D/g, '')
  const linkWhatsapp = telefoneDigitos
    ? `https://wa.me/${telefoneDigitos.startsWith('55') ? telefoneDigitos : `55${telefoneDigitos}`}?text=${encodeURIComponent(mensagem)}`
    : null

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      setErro('Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }

  const percepcaoPreenchida = [
    pesquisa.p1.trim(),
    pesquisa.p2.length > 0,
    pesquisa.p3Sim !== null,
    pesquisa.p4.trim(),
    pesquisa.p5,
  ].filter(Boolean).length

  const contatosAnteriores = dados.contatos
    .filter((c) => c.cliente_chave === cliente.chave && c.status !== 'em_andamento')
    .slice(0, 8)
  const reclamacoesCliente = (podeVerReclamacoesCS(profile.setor) ? dados.reclamacoes : []).filter(
    (r) =>
      (cnpjDigitos && r.cliente_cnpj === cnpjDigitos) ||
      r.cliente_nome.trim().toLowerCase() === cliente.nome.trim().toLowerCase(),
  )

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onSair} className="text-sm text-muted hover:text-primary">
            ← Voltar à fila
          </button>
          <h2 className="font-heading text-lg font-semibold text-primary">{cliente.nome}</h2>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${FASE_BADGE[fase]}`}>
            {FASE_LABELS[fase]}
          </span>
          <span className="text-xs text-muted">{item.detalhe}</span>
          {item.sugerirLigacao && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300">
              📞 2ª falta — tente ligar
            </span>
          )}
        </div>
        <span className="text-xs text-muted">
          {estadoSalvo === 'salvando' && 'Salvando…'}
          {estadoSalvo === 'salvo' && '✓ Salvo automaticamente'}
          {estadoSalvo === 'erro' && <span className="text-accent-danger">Falha ao salvar</span>}
        </span>
      </div>

      <div className="grid flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[280px_minmax(0,1fr)_260px]">
        {/* ===== Ficha do cliente ===== */}
        <aside className="flex flex-col gap-3 text-sm">
          <div className="rounded-lg border border-white/10 bg-surface p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Cliente</p>
            <p className="font-medium text-primary">{cliente.razaoSocial ?? cliente.nome}</p>
            {cliente.cnpj && <p className="text-xs text-muted">CNPJ {cliente.cnpj}</p>}
            {contatoEfetivo && <p className="mt-1 text-xs text-primary/80">{contatoEfetivo}</p>}
            {telefoneEfetivo ? (
              <p className="text-xs text-primary/80">📞 {formatarTelefoneInput(telefoneEfetivo)}</p>
            ) : (
              <p className="text-xs text-accent-danger">Sem telefone no CRM nem no Omie</p>
            )}
            {emailEfetivo && <p className="text-xs text-primary/80">{emailEfetivo}</p>}
            {(cliente.cidade || cliente.estado) && (
              <p className="text-xs text-muted">{[cliente.cidade, cliente.estado].filter(Boolean).join('/')}</p>
            )}
            <p className="mt-1 text-xs text-muted">Vendedora: {cliente.vendedorNome ?? '—'}</p>
            <button
              onClick={() => setFichaAberta(true)}
              className="mt-2 rounded-md border border-white/15 px-2 py-1 text-xs text-primary/80 hover:bg-white/10"
            >
              Ver ficha completa
            </button>
            <button
              onClick={abrirCadastro}
              disabled={abrindoCadastro}
              className="ml-2 mt-2 rounded-md bg-accent-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
            >
              {abrindoCadastro ? 'Abrindo…' : '✏️ Adicionar/editar dados'}
            </button>
          </div>

          <div className="rounded-lg border border-white/10 bg-surface p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Dados do Omie</p>
            {omieEstado === 'carregando' && <p className="text-xs text-muted">Buscando no Omie…</p>}
            {omieEstado === 'erro' && (
              <div>
                <p className="text-xs text-accent-danger">{omieErro}</p>
                <button
                  onClick={() => setOmieVersao((v) => v + 1)}
                  className="mt-1 rounded-md border border-white/15 px-2 py-1 text-xs text-primary/80 hover:bg-white/10"
                >
                  Tentar de novo
                </button>
              </div>
            )}
            {omieEstado === 'ok' && omie && (
              <ul className="mt-1 space-y-0.5 text-xs text-primary/90">
                {omie.inativo && <li className="text-amber-300">⚠ Cliente inativo no Omie</li>}
                {omie.razaoSocial && <li>{omie.razaoSocial}</li>}
                {omie.nomeFantasia && <li className="text-muted">Fantasia: {omie.nomeFantasia}</li>}
                {omie.cnpj && <li className="text-muted">CNPJ/CPF: {formatarCnpjInput(omie.cnpj)}</li>}
                {omie.contato && <li>👤 {omie.contato}</li>}
                {omie.telefone1 && <li>📞 {formatarTelefoneInput(omie.telefone1)}</li>}
                {omie.telefone2 && <li>📞 {formatarTelefoneInput(omie.telefone2)} (2º)</li>}
                {omie.email && <li>✉ {omie.email}</li>}
                {(omie.endereco || omie.cidade) && (
                  <li className="text-muted">
                    📍 {[omie.endereco, omie.numero, omie.complemento, omie.bairro].filter(Boolean).join(', ')}
                    {omie.cidade && ` — ${omie.cidade}`}
                    {omie.estado && `/${omie.estado}`}
                    {omie.cep && ` · CEP ${omie.cep}`}
                  </li>
                )}
                {omie.inscricaoEstadual && <li className="text-muted">IE: {omie.inscricaoEstadual}</li>}
                {omie.observacao && <li className="text-muted">Obs.: {omie.observacao}</li>}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-surface p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Compras</p>
            <p className="text-xs text-primary/90">
              Última compra: {cliente.ultimaCompra ? formatarDataSomente(cliente.ultimaCompra) : '—'}
              {cliente.diasDesdeUltimaCompra !== null && ` (${cliente.diasDesdeUltimaCompra} dias)`}
            </p>
            <p className="text-xs text-muted">
              {cliente.qtdPedidosEfetuados} pedido(s) efetuado(s)
              {cliente.ticketMedio !== null && ` · ticket ${formatarMoeda(cliente.ticketMedio)}`}
            </p>
            <ul className="mt-2 space-y-1">
              {cliente.historicoPedidos.slice(0, 5).map((p) => (
                <li key={p.id} className="text-xs text-primary/80">
                  #{p.numero} · {formatarDataSomente(p.dataEfetuacao ?? p.criado_em)} · {STATUS_LABELS[p.status] ?? p.status}
                  {p.total > 0 && ` · ${formatarMoeda(p.total)}`}
                </li>
              ))}
            </ul>
            {cliente.itensMaisComprados.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                Mais comprados: {cliente.itensMaisComprados.slice(0, 4).map((i) => i.descricao).join(', ')}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-surface p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Linha do tempo CS</p>
            {contatosAnteriores.length === 0 && reclamacoesCliente.length === 0 && (
              <p className="text-xs text-muted">Nenhum contato anterior.</p>
            )}
            <ul className="mt-1 space-y-1">
              {reclamacoesCliente.slice(0, 4).map((r) => (
                <li key={r.id} className="text-xs text-accent-danger">
                  ⚠ {formatarDataSomente(r.aberta_em)} · {r.categoria} ({r.status.replace(/_/g, ' ')})
                </li>
              ))}
              {contatosAnteriores.map((c) => (
                <li key={c.id} className="text-xs text-primary/80">
                  {formatarDataSomente(c.criado_em)} · {FASE_LABELS[c.fase as keyof typeof FASE_LABELS] ?? c.fase} ·{' '}
                  {c.status.replace(/_/g, ' ')}
                  {c.observacao && <span className="block text-muted">{c.observacao}</span>}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ===== Roteiro e pesquisa ===== */}
        <section className="flex flex-col gap-4">
          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">Roteiro — {FASE_LABELS[fase]}</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-primary/90">
              {ROTEIROS[fase].roteiro.map((passo) => (
                <li key={passo}>{passo}</li>
              ))}
            </ol>
            <p className="mt-3 rounded-md bg-white/5 p-2.5 text-sm text-primary/90">{mensagem}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copiar}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-primary/80 hover:bg-white/10"
              >
                {copiado ? '✓ Copiado' : '📋 Copiar mensagem'}
              </button>
              {linkWhatsapp ? (
                <a
                  href={linkWhatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-accent-success/40 bg-accent-success/10 px-3 py-1.5 text-xs font-medium text-accent-success hover:bg-accent-success/20"
                >
                  💬 Abrir no WhatsApp
                </a>
              ) : (
                <span className="text-xs text-muted">Cliente sem telefone cadastrado.</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">
              Nota (clique ou tecle 0–9; 1 e 0 = 10)
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => definirNota(n)}
                  className={`h-9 w-9 rounded-md border text-sm font-semibold transition-colors ${
                    pesquisa.nota === n
                      ? n <= 6
                        ? 'border-accent-danger bg-accent-danger/25 text-accent-danger'
                        : n <= 8
                          ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                          : 'border-accent-success bg-accent-success/20 text-accent-success'
                      : 'border-white/15 text-primary/80 hover:bg-white/10'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-wide text-muted">Motivo da nota (pode marcar mais de um)</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MOTIVOS_NOTA.map((m) => (
                <Chip key={m} ativo={pesquisa.motivos.includes(m)} onClick={() => alterar({ motivos: alternar(pesquisa.motivos, m) })}>
                  {m}
                </Chip>
              ))}
            </div>
            <input
              type="text"
              value={pesquisa.comentario}
              onChange={(e) => alterar({ comentario: e.target.value })}
              placeholder="Comentário da nota (opcional)"
              className="input-field mt-3 w-full rounded-md px-2.5 py-1.5 text-sm"
            />
          </div>

          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">Percepção da marca</p>

            <label className="mt-2 block text-xs text-muted">P1 · Em uma palavra, como descreve a {empresaNome}?</label>
            <input
              type="text"
              value={pesquisa.p1}
              onChange={(e) => alterar({ p1: e.target.value })}
              className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            />
            {sugestoesP1.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {sugestoesP1.map((s) => (
                  <Chip key={s} ativo={pesquisa.p1 === s} onClick={() => alterar({ p1: s })}>
                    {s}
                  </Chip>
                ))}
              </div>
            )}

            <label className="mt-3 block text-xs text-muted">P2 · Por que escolheu a {empresaNome}?</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MOTIVOS_ESCOLHA.map((m) => (
                <Chip key={m} ativo={pesquisa.p2.includes(m)} onClick={() => alterar({ p2: alternar(pesquisa.p2, m) })}>
                  {m}
                </Chip>
              ))}
            </div>

            <label className="mt-3 block text-xs text-muted">P3 · Compra de outros fornecedores?</label>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Chip ativo={pesquisa.p3Sim === true} onClick={() => alterar({ p3Sim: pesquisa.p3Sim === true ? null : true })}>
                Sim
              </Chip>
              <Chip ativo={pesquisa.p3Sim === false} onClick={() => alterar({ p3Sim: pesquisa.p3Sim === false ? null : false })}>
                Não
              </Chip>
              {pesquisa.p3Sim && (
                <>
                  <input
                    type="text"
                    list="cs-concorrentes"
                    value={pesquisa.p3Nome}
                    onChange={(e) => alterar({ p3Nome: e.target.value })}
                    placeholder="Qual fornecedor?"
                    className="input-field w-48 rounded-md px-2.5 py-1 text-sm"
                  />
                  <datalist id="cs-concorrentes">
                    {concorrentes.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <input
                    type="text"
                    value={pesquisa.p3Texto}
                    onChange={(e) => alterar({ p3Texto: e.target.value })}
                    placeholder="O que ele faz melhor?"
                    className="input-field min-w-[160px] flex-1 rounded-md px-2.5 py-1 text-sm"
                  />
                </>
              )}
            </div>

            <label className="mt-3 block text-xs text-muted">P4 · O que a {empresaNome} poderia mudar?</label>
            <textarea
              value={pesquisa.p4}
              onChange={(e) => alterar({ p4: e.target.value })}
              rows={2}
              className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            />

            <label className="mt-3 block text-xs text-muted">P5 · Como conheceu a {empresaNome}?</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ORIGENS.map((o) => (
                <Chip key={o} ativo={pesquisa.p5 === o} onClick={() => alterar({ p5: pesquisa.p5 === o ? '' : o })}>
                  {o}
                </Chip>
              ))}
            </div>

            {fase === 'percepcao' && pesquisa.nota !== null && percepcaoPreenchida < 3 && (
              <p className="mt-3 text-xs text-amber-300/90">
                ℹ Faltam {3 - percepcaoPreenchida} das perguntas de percepção (P1 a P5) para completar a pesquisa — você
                ainda pode salvar assim.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-surface p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted">Pedido e reposição</p>
            <input
              type="text"
              value={pesquisa.ajustes}
              onChange={(e) => alterar({ ajustes: e.target.value })}
              placeholder="Ajustes no pedido (opcional)"
              className="input-field mt-2 w-full rounded-md px-2.5 py-1.5 text-sm"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted">Próxima reposição</label>
              <input
                type="date"
                value={pesquisa.proximaReposicao}
                onChange={(e) => alterar({ proximaReposicao: e.target.value })}
                className="input-field rounded-md px-2.5 py-1 text-sm"
              />
              <span className="text-xs text-muted">
                (entra na fila de recompra {dados.config.recompra_antecedencia} dias antes)
              </span>
            </div>
          </div>
        </section>

        {/* ===== Ações ===== */}
        <aside className="flex flex-col gap-3">
          <div className="rounded-lg border border-white/10 bg-surface p-3">
            <label className="block text-xs text-muted">Canal</label>
            <select
              value={canal}
              onChange={(e) => {
                setCanal(e.target.value)
                setSujo(true)
              }}
              className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            >
              {CANAIS.filter((c) => c.valor === 'whatsapp' || c.valor === 'telefone').map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.label}
                </option>
              ))}
            </select>
            <label className="mt-3 block text-xs text-muted">Observação do atendimento</label>
            <textarea
              value={observacao}
              onChange={(e) => {
                setObservacao(e.target.value)
                setSujo(true)
              }}
              rows={3}
              className="input-field mt-1 w-full rounded-md px-2.5 py-1.5 text-sm"
            />
          </div>

          <button
            onClick={() => finalizar('respondeu')}
            disabled={finalizando}
            className="rounded-md bg-accent-primary px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
          >
            ✓ Salvar e próximo
            <span className="block text-[10px] font-normal opacity-80">Ctrl + Enter</span>
          </button>
          <button
            onClick={() => finalizar('sem_retorno')}
            disabled={finalizando}
            className="rounded-md border border-white/15 px-3 py-2 text-sm font-medium text-primary/80 hover:bg-white/10 disabled:opacity-50"
          >
            📵 Sem retorno (volta à lista) e próximo
          </button>
          <button
            onClick={() => setModalReclamacao(true)}
            className="rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm font-medium text-accent-danger hover:bg-accent-danger/20"
          >
            ⚠ Abrir reclamação{reclamacaoAberta && ' (já aberta)'}
          </button>
          <button
            onClick={() => setModalRepasse(true)}
            className="rounded-md border border-white/15 px-3 py-2 text-sm font-medium text-primary/80 hover:bg-white/10"
          >
            ↪ Fazer repasse
          </button>
          <button
            onClick={() => onProximo(proximo)}
            disabled={finalizando}
            className="text-xs text-muted hover:text-primary"
          >
            Pular sem salvar →
          </button>
          {erro && <p className="text-xs text-accent-danger">{erro}</p>}
          <p className="text-[11px] text-muted">
            {proximo ? `Próximo da fila: ${proximo.cliente.nome}` : 'Este é o último cliente da fila.'}
          </p>
          <p className="text-[11px] text-muted">
            Sem retorno: o cliente continua na lista. Só sai quando houver conclusão. Repasse: volta amanhã.
          </p>
          {contatoId && <p className="text-[10px] text-muted/60">Registro em andamento</p>}
        </aside>
      </div>

      <ReclamacaoForm
        open={modalReclamacao}
        onClose={() => setModalReclamacao(false)}
        empresaId={empresaId}
        usuarioId={profile.id}
        clienteNome={cliente.nome}
        clienteCnpj={cnpjDigitos}
        prazoHoras={dados.config.prazo_reclamacao_horas}
        garantirContato={garantirContato}
        onCriada={() => {
          setReclamacaoAberta(true)
          recarregar()
        }}
      />
      <RepasseForm
        open={modalRepasse}
        onClose={() => setModalRepasse(false)}
        empresaId={empresaId}
        usuarioId={profile.id}
        clienteNome={cliente.nome}
        clienteCnpj={cnpjDigitos}
        vendedorId={cliente.vendedorId}
        garantirContato={garantirContato}
        onCriado={() => {
          setRepasseFeito(true)
          recarregar()
        }}
      />
      <FichaClienteModal cliente={fichaAberta ? cliente : null} onClose={() => setFichaAberta(false)} />
      <ClienteFormModal
        open={cadastroAberto}
        onClose={() => setCadastroAberto(false)}
        clienteExistente={cadastroExistente}
        onSaved={() => {
          setCadastroAberto(false)
          recarregar()
        }}
        cnpjInicial={cliente.cnpj ?? undefined}
        razaoSocialInicial={cliente.razaoSocial ?? cliente.nome}
        telefoneInicial={cliente.telefone ?? undefined}
        contatoInicial={cliente.contato ?? undefined}
      />
    </div>
  )
}
