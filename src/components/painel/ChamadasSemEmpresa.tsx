'use client'

// Seção do Painel Gestor: chamadas cujo empresa_id ainda está nulo — sem
// oportunidade vinculada, não há como saber se são da RHOCAL ou da MATSEG
// (ver discussão registrada nas migrações/rotas de mobcall: sem sessão de
// browser nem DID distinto por empresa, não dá pra adivinhar). Em vez de
// esconder essas chamadas silenciosamente, ficam numa lista própria,
// cross-empresa (não filtra por empresaAtiva de propósito), pro gestor
// reconciliar manualmente se quiser. Mesmo range de período do restante do
// Painel — sem filtro próprio.
//
// Client Supabase compartilhado do app (mesma cautela de HistoricoChamadas.tsx
// / ChamadasPorFuncionario.tsx: nunca um createClient avulso, que rodaria sem
// sessão e cairia como anônimo na policy "chamadas leitura").

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RangePeriodo } from '@/lib/kanban/periodo'
import { proximoDia } from '@/lib/kanban/filtro-data'
import type { Database } from '@/types/database'

type Chamada = Pick<
  Database['public']['Tables']['chamadas']['Row'],
  'id' | 'usuario_id' | 'direcao' | 'status' | 'numero_origem' | 'numero_destino' | 'duracao_segundos' | 'iniciada_em'
>
type Profile = Database['public']['Tables']['profiles']['Row']

const LIMITE_LINHAS = 100

function statusLabel(status: string): string {
  switch (status) {
    case 'atendida':
      return 'Atendida'
    case 'nao_atendida':
      return 'Não atendida'
    case 'falha':
      return 'Falhou'
    default:
      return 'Em andamento'
  }
}

function formatarDuracao(segundos: number | null): string {
  if (!segundos) return '—'
  const min = Math.floor(segundos / 60)
  const seg = segundos % 60
  return `${min}m ${seg}s`
}

function formatarData(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ChamadasSemEmpresa({ range }: { range: RangePeriodo }) {
  const [supabase] = useState(() => createClient())
  const [chamadas, setChamadas] = useState<Chamada[]>([])
  const [nomesPorId, setNomesPorId] = useState<Map<string, string>>(new Map())
  const [totalSemEmpresa, setTotalSemEmpresa] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setCarregando(true)
      setErro(null)

      try {
        let query = supabase
          .from('chamadas')
          .select(
            'id, usuario_id, direcao, status, numero_origem, numero_destino, duracao_segundos, iniciada_em',
            { count: 'exact' },
          )
          .is('empresa_id', null)
          .order('iniciada_em', { ascending: false })
          .limit(LIMITE_LINHAS)

        if (range.inicio) query = query.gte('iniciada_em', `${range.inicio}T00:00:00`)
        if (range.fim) query = query.lt('iniciada_em', `${proximoDia(range.fim)}T00:00:00`)

        const [{ data, error, count }, { data: profilesData, error: erroProfiles }] = await Promise.all([
          query,
          supabase.from('profiles').select('*'),
        ])
        if (error) throw error
        if (erroProfiles) throw erroProfiles
        if (!ativo) return

        setChamadas((data ?? []) as Chamada[])
        setTotalSemEmpresa(count ?? (data ?? []).length)
        setNomesPorId(new Map(((profilesData ?? []) as Profile[]).map((p) => [p.id, p.nome])))
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : 'Erro ao carregar chamadas sem empresa.')
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [supabase, range.inicio, range.fim])

  if (!carregando && !erro && chamadas.length === 0) return null

  return (
    <section className="rounded-lg border border-accent-alert/30 bg-accent-alert/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-primary">Chamadas sem empresa definida</h3>
        <span className="text-xs text-muted">{totalSemEmpresa} no período</span>
      </div>
      <p className="mb-3 text-xs text-muted">
        Chamadas sem oportunidade vinculada — não deu pra saber automaticamente se são da RHOCAL ou
        da MATSEG. Não entram no filtro por empresa em nenhuma outra tela.
      </p>

      {carregando && <p className="text-sm text-muted">Carregando...</p>}
      {erro && (
        <p className="rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erro}
        </p>
      )}

      {!carregando && !erro && chamadas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Data</th>
                <th className="px-3 py-2.5 font-medium">Funcionário</th>
                <th className="px-3 py-2.5 font-medium">Direção</th>
                <th className="px-3 py-2.5 font-medium">Número</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-center font-medium">Duração</th>
              </tr>
            </thead>
            <tbody>
              {chamadas.map((c) => (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-3 py-2.5 text-primary">{formatarData(c.iniciada_em)}</td>
                  <td className="px-3 py-2.5 text-primary">
                    {c.usuario_id ? nomesPorId.get(c.usuario_id) ?? 'Não identificado' : 'Não identificado'}
                  </td>
                  <td className="px-3 py-2.5 text-primary/80">
                    {c.direcao === 'saida' ? '📤 Feita' : '📥 Recebida'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-primary/80">
                    {c.direcao === 'saida' ? c.numero_destino ?? '—' : c.numero_origem ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-primary/80">{statusLabel(c.status)}</td>
                  <td className="px-3 py-2.5 text-center text-primary">{formatarDuracao(c.duracao_segundos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalSemEmpresa > chamadas.length && (
            <p className="border-t border-white/10 bg-surface-alt px-3 py-2 text-xs text-muted">
              Mostrando as {chamadas.length} mais recentes de {totalSemEmpresa}.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
