'use client'

// Segmentação automática de clientes (a partir dos dados já calculados pela
// Inteligência: temperatura, churn, score de propensão) com sugestão de
// texto de campanha por segmento, e criação da campanha com um clique.
//
// Onde usar: dentro de InteligenciaComercial.tsx, passando a lista de
// clientes já carregada (mesma fonte usada na tabela/ficha de clientes).
// <SegmentacaoCampanhas clientes={clientes} empresaId={empresaAtiva?.id ?? null} />
//
// Client Supabase compartilhado do app (`@/lib/supabase/client` + `useAuth()`
// do AuthContext) — nunca um `createClient` avulso de `@supabase/supabase-js`,
// que rodaria sem a sessão em cookie do resto do app e cairia como anônimo
// nas policies "campanhas escrita"/"campanha_clientes escrita" (to
// authenticated). Mesmo padrão de insert já usado em SalvarCampanhaModal.tsx.

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { ClienteInteligencia } from '@/lib/inteligencia/agregar'

type SegmentoId = 'churn' | 'esfriando' | 'inativos' | 'upsell'

interface Segmento {
  id: SegmentoId
  titulo: string
  corCard: string
  corTitulo: string
  descricao: string
  filtro: (c: ClienteInteligencia) => boolean
  textoSugerido: (c: ClienteInteligencia) => string
}

const SEGMENTOS: Segmento[] = [
  {
    id: 'churn',
    titulo: '🔴 Risco de Churn',
    corCard: 'border-accent-danger/30 bg-accent-danger/10',
    corTitulo: 'text-accent-danger',
    descricao: 'Clientes com alerta de churn ativo — pararam de comprar no ritmo normal.',
    filtro: (c) => c.emRiscoChurn,
    textoSugerido: (c) =>
      `Olá${c.contato ? ' ' + c.contato : ''}! Notamos que faz um tempo desde sua última compra com a gente${
        c.diasDesdeUltimaCompra ? ` (${c.diasDesdeUltimaCompra} dias)` : ''
      }. Está tudo bem? Temos novidades que podem te interessar — vamos conversar?`,
  },
  {
    id: 'esfriando',
    titulo: '🟡 Esfriando',
    corCard: 'border-accent-alert/30 bg-accent-alert/10',
    corTitulo: 'text-accent-alert',
    descricao: 'Temperatura amarela — relacionamento esfriando, ainda dá tempo de reaquecer.',
    filtro: (c) => c.temperaturaAutomatica === 'amarelo',
    textoSugerido: (c) =>
      `Oi${c.contato ? ' ' + c.contato : ''}, tudo bem? Faz um tempinho que não conversamos — separei algumas novidades da RHOCAL que fazem sentido pro seu negócio. Posso te mandar?`,
  },
  {
    id: 'inativos',
    titulo: '⚪ Inativos',
    corCard: 'border-white/15 bg-white/5',
    corTitulo: 'text-muted',
    descricao: 'Sem dado recente de interação — candidatos a reengajamento.',
    filtro: (c) => c.temperaturaAutomatica === 'cinza',
    textoSugerido: (c) =>
      `Olá${c.contato ? ' ' + c.contato : ''}! Já faz um tempo que não temos contato. Gostaríamos de retomar — temos condições especiais pra clientes como você. Podemos agendar uma conversa rápida?`,
  },
  {
    id: 'upsell',
    titulo: '🟢 Oportunidade de Upsell',
    corCard: 'border-accent-success/30 bg-accent-success/10',
    corTitulo: 'text-accent-success',
    descricao: 'Temperatura verde + score de propensão alto — momento bom pra oferecer mais.',
    filtro: (c) => c.temperaturaAutomatica === 'verde' && c.scorePropensao >= 70,
    textoSugerido: (c) =>
      `Oi${c.contato ? ' ' + c.contato : ''}! Vi que você é cliente frequente da RHOCAL${
        c.itensMaisComprados?.[0] ? ` (principalmente ${c.itensMaisComprados[0].descricao})` : ''
      }. Temos itens complementares que combinam com o que você já compra — posso te apresentar?`,
  },
]

export default function SegmentacaoCampanhas({
  clientes,
  empresaId,
}: {
  clientes: ClienteInteligencia[]
  empresaId: string | null
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [segmentoAberto, setSegmentoAberto] = useState<SegmentoId | null>(null)
  const [textoEditado, setTextoEditado] = useState<Record<string, string>>({})
  const [criando, setCriando] = useState<SegmentoId | null>(null)
  const [sucesso, setSucesso] = useState<SegmentoId | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const grupos = useMemo(() => {
    return SEGMENTOS.map((seg) => ({
      seg,
      clientes: clientes.filter(seg.filtro),
    }))
  }, [clientes])

  async function criarCampanha(seg: Segmento, clientesDoSegmento: ClienteInteligencia[]) {
    setErro(null)

    if (!user || !empresaId) {
      setErro('Você precisa estar logado e com uma empresa ativa selecionada.')
      return
    }

    setCriando(seg.id)

    const { data: campanha, error: erroCampanha } = await supabase
      .from('campanhas')
      .insert({
        empresa_id: empresaId,
        nome: `${seg.titulo.replace(/^[^\s]+\s/, '')} — ${new Date().toLocaleDateString('pt-BR')}`,
        descricao: seg.descricao,
        filtros_aplicados: { segmento: seg.id },
        total_clientes: clientesDoSegmento.length,
        criado_por: user.id,
      })
      .select()
      .single()

    if (erroCampanha || !campanha) {
      setErro(erroCampanha?.message ?? 'Erro ao criar campanha.')
      setCriando(null)
      return
    }

    const linhas = clientesDoSegmento.map((c) => ({
      campanha_id: campanha.id,
      cliente_omie_codigo: c.omieClienteId !== null ? String(c.omieClienteId) : null,
      cliente_nome: c.nome,
      cliente_cnpj: c.cnpj,
      status: 'enviado' as const,
    }))

    const { error: erroClientes } = await supabase.from('campanha_clientes').insert(linhas)

    setCriando(null)

    if (erroClientes) {
      setErro(erroClientes.message)
      return
    }

    setSucesso(seg.id)
    setTimeout(() => setSucesso(null), 4000)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-primary">Segmentação e campanhas sugeridas</h3>

      {erro && (
        <p className="rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erro}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {grupos.map(({ seg, clientes: clientesSeg }) => (
          <div key={seg.id} className={`rounded-lg border p-4 ${seg.corCard}`}>
            <div className="mb-2 flex items-center justify-between">
              <h4 className={`font-semibold ${seg.corTitulo}`}>{seg.titulo}</h4>
              <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-medium text-primary/80">
                {clientesSeg.length} clientes
              </span>
            </div>
            <p className="mb-3 text-sm text-muted">{seg.descricao}</p>

            <button
              type="button"
              onClick={() => setSegmentoAberto(segmentoAberto === seg.id ? null : seg.id)}
              className="text-sm font-medium text-accent-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
              disabled={clientesSeg.length === 0}
            >
              {segmentoAberto === seg.id ? 'Ocultar detalhes' : 'Ver clientes e texto sugerido'}
            </button>

            {segmentoAberto === seg.id && clientesSeg.length > 0 && (
              <div className="mt-3 space-y-3">
                <div className="max-h-40 overflow-y-auto rounded-md border border-white/10 bg-surface p-2 text-sm">
                  {clientesSeg.map((c) => (
                    <div key={c.chave} className="border-b border-white/5 py-1 text-primary/90 last:border-0">
                      {c.nome}
                      {c.cnpj && <span className="text-muted"> — {c.cnpj}</span>}
                    </div>
                  ))}
                </div>

                <div>
                  <span className="mb-1 block text-xs font-medium text-muted">
                    Texto sugerido (baseado no primeiro cliente da lista, ajuste conforme
                    necessário ao enviar)
                  </span>
                  <textarea
                    value={textoEditado[seg.id] ?? seg.textoSugerido(clientesSeg[0])}
                    onChange={(e) => setTextoEditado((prev) => ({ ...prev, [seg.id]: e.target.value }))}
                    rows={4}
                    className="input-field w-full rounded-md px-3 py-2 text-sm"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => criarCampanha(seg, clientesSeg)}
                  disabled={criando === seg.id}
                  className="w-full rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
                >
                  {criando === seg.id
                    ? 'Criando...'
                    : sucesso === seg.id
                      ? 'Campanha criada ✓'
                      : `Criar campanha com esses ${clientesSeg.length} clientes`}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
