'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatarCnpjInput, formatarDataSomente, formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { FASE_LABELS } from '@/lib/cs/constantes'
import type { DadosCS } from '@/lib/cs/useDadosCS'
import { useTelefonesOmie } from '@/lib/cs/useTelefonesOmie'

const JANELA_DIAS = 30
const MS_DIA = 86_400_000

interface ClienteRecente {
  chave: string
  nome: string
  cnpj: string | null
  telefone: string | null
  contato: string | null
  email: string | null
  cidade: string | null
  omieId: number | null
  ultimoPedidoEm: string
}

function soDigitos(v: string | null): string {
  return (v ?? '').replace(/\D/g, '')
}

// Clientes da MATSEG com pedido FATURADO e ENTREGUE nos últimos 30 dias.
// "Entregue" é o status ENTREGUE do pedido no CRM (só chega nele depois de
// PEDIDO_EFETUADO, ou seja, depois de faturado). Mostra o cliente, não o pedido.
export function PosVendaRecentes({ dados }: { dados: DadosCS }) {
  const [supabase] = useState(() => createClient())
  const [lista, setLista] = useState<ClienteRecente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ocultarContatados, setOcultarContatados] = useState(false)
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    setErro(null)
    try {
      const { data: emp, error: e0 } = await supabase.from('empresas').select('id').eq('slug', 'matseg').maybeSingle()
      if (e0) throw e0
      if (!emp) throw new Error('Empresa MATSEG não encontrada.')

      const corte = new Date(Date.now() - JANELA_DIAS * MS_DIA)
      const busca45 = new Date(Date.now() - 45 * MS_DIA).toISOString()

      const { data: pedidos, error: e1 } = await supabase
        .from('pedidos')
        .select(
          'cliente_nome, cliente_cnpj, cliente_omie_id, cliente_telefone, cliente_contato, entregue_em, data_entrega_real, ultima_movimentacao',
        )
        .eq('empresa_id', emp.id)
        .eq('status', 'ENTREGUE')
        .gte('ultima_movimentacao', busca45)
        .range(0, 4999)
      if (e1) throw e1

      const { data: cadastro, error: e2 } = await supabase
        .from('clientes')
        .select('razao_social, nome_fantasia, cnpj, email, telefone, contato, cidade, estado, omie_cliente_id')
        .eq('empresa_id', emp.id)
        .range(0, 4999)
      if (e2) throw e2

      const porCnpj = new Map<string, (typeof cadastro)[number]>()
      const porOmie = new Map<number, (typeof cadastro)[number]>()
      for (const c of cadastro ?? []) {
        const d = soDigitos(c.cnpj)
        if (d) porCnpj.set(d, c)
        if (c.omie_cliente_id) porOmie.set(Number(c.omie_cliente_id), c)
      }

      const mapa = new Map<string, ClienteRecente>()
      for (const p of pedidos ?? []) {
        const quando = p.entregue_em ?? p.data_entrega_real ?? p.ultima_movimentacao
        if (!quando || new Date(quando) < corte) continue
        const cnpj = soDigitos(p.cliente_cnpj)
        const cad = (cnpj && porCnpj.get(cnpj)) || (p.cliente_omie_id ? porOmie.get(Number(p.cliente_omie_id)) : undefined)
        const chave = cnpj || (p.cliente_omie_id ? `omie:${p.cliente_omie_id}` : p.cliente_nome.trim().toLowerCase())
        const atual = mapa.get(chave)
        if (atual && atual.ultimoPedidoEm >= quando) continue
        mapa.set(chave, {
          chave,
          nome: cad?.nome_fantasia || cad?.razao_social || p.cliente_nome,
          cnpj: cad?.cnpj ?? p.cliente_cnpj,
          telefone: cad?.telefone || p.cliente_telefone,
          contato: cad?.contato || p.cliente_contato,
          email: cad?.email ?? null,
          cidade: cad ? [cad.cidade, cad.estado].filter(Boolean).join('/') || null : null,
          omieId: p.cliente_omie_id ? Number(p.cliente_omie_id) : cad?.omie_cliente_id ? Number(cad.omie_cliente_id) : null,
          ultimoPedidoEm: quando,
        })
      }
      setLista(Array.from(mapa.values()).sort((a, b) => b.ultimoPedidoEm.localeCompare(a.ultimoPedidoEm)))
    } catch (e) {
      setErro(e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Erro ao carregar.')
    } finally {
      setCarregando(false)
    }
  }, [supabase])

  useEffect(() => {
    void carregar()
    // Telefone novo cadastrado no CRM aparece sozinho: recarrega ao voltar para a aba e a cada 3 min.
    const timer = setInterval(() => void carregar(), 3 * 60_000)
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void carregar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [carregar])

  const telefonesOmie = useTelefonesOmie(
    lista.filter((c) => !c.telefone && c.omieId).map((c) => c.omieId as number),
    'matseg',
  )

  // Já houve contato de CS com o cliente depois da última entrega?
  const contatados = useMemo(() => {
    const set = new Set<string>()
    for (const c of lista) {
      const cnpj = soDigitos(c.cnpj)
      const nome = c.nome.trim().toLowerCase()
      const achou = dados.contatos.some(
        (k) =>
          k.status !== 'em_andamento' &&
          k.criado_em >= c.ultimoPedidoEm &&
          ((cnpj && k.cliente_cnpj === cnpj) || k.cliente_nome.trim().toLowerCase() === nome),
      )
      if (achou) set.add(c.chave)
    }
    return set
  }, [lista, dados.contatos])

  const comTelefone = useMemo(
    () => lista.map((c) => (c.telefone || !c.omieId ? c : { ...c, telefone: telefonesOmie[String(c.omieId)] ?? null })),
    [lista, telefonesOmie],
  )

  const visiveis = comTelefone.filter(
    (c) =>
      (!ocultarContatados || !contatados.has(c.chave)) &&
      (!busca.trim() || c.nome.toLowerCase().includes(busca.trim().toLowerCase()) || soDigitos(c.cnpj).includes(soDigitos(busca))),
  )

  return (
    <div className="flex flex-col gap-3 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          MATSEG · clientes com pedido faturado e entregue nos últimos {JANELA_DIAS} dias:{' '}
          <span className="font-semibold text-primary">{lista.length}</span>
          {lista.length > 0 && ` (${contatados.size} já contatados)`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome ou CNPJ"
            className="input-field w-48 rounded-md px-2.5 py-1.5 text-sm"
          />
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={ocultarContatados} onChange={(e) => setOcultarContatados(e.target.checked)} />
            Ocultar já contatados
          </label>
          <button
            onClick={() => void carregar()}
            className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-primary/80 hover:bg-white/10"
          >
            Atualizar
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-accent-danger">{erro}</p>}
      {carregando && <p className="text-sm text-muted">Carregando…</p>}
      {!carregando && !erro && visiveis.length === 0 && (
        <p className="text-sm text-muted">Nenhum cliente nesta janela.</p>
      )}

      <ul className="flex flex-col gap-2">
        {visiveis.map((c) => {
          const tel = soDigitos(c.telefone)
          const msg = `Olá${c.contato ? `, ${c.contato.split(/[—,·]/)[0].trim()}` : ''}! Aqui é da MATSEG. Seu pedido chegou tudo certo? Qualquer ajuste, é só me falar.`
          return (
            <li key={c.chave} className="rounded-lg border border-white/10 bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-primary">{c.nome}</p>
                  {c.cnpj && <p className="text-xs text-muted">CNPJ {formatarCnpjInput(c.cnpj)}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Último pedido entregue</p>
                  <p className="text-sm font-medium text-primary">{formatarDataSomente(c.ultimoPedidoEm)}</p>
                  {contatados.has(c.chave) && (
                    <span className="mt-1 inline-block rounded-full border border-accent-success/40 bg-accent-success/10 px-2 py-0.5 text-[11px] text-accent-success">
                      ✓ {FASE_LABELS.pos_entrega} feito
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-primary/80">
                {c.contato && <span>👤 {c.contato}</span>}
                {c.telefone ? <span>📞 {formatarTelefoneInput(c.telefone)}</span> : <span className="text-accent-danger">Sem telefone cadastrado</span>}
                {c.email && <span>✉ {c.email}</span>}
                {c.cidade && <span>📍 {c.cidade}</span>}
              </div>
              {tel && (
                <a
                  href={`https://wa.me/${tel.startsWith('55') ? tel : `55${tel}`}?text=${encodeURIComponent(msg)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block rounded-md border border-accent-success/40 bg-accent-success/10 px-3 py-1.5 text-xs font-medium text-accent-success hover:bg-accent-success/20"
                >
                  💬 Abrir no WhatsApp
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
