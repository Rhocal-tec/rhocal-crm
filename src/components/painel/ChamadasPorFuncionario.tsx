'use client'

// Seção do Painel Gestor: quantidade de ligações por funcionário no período
// selecionado, com detalhamento por resultado (atendida/não atendida/falha).
// Reaproveita o mesmo range de período já usado no restante do Painel
// (src/app/painel/page.tsx) — não tem filtro próprio, recebe via props.
//
// Client Supabase compartilhado do app (`@/lib/supabase/client`, sessão em
// cookie) — nunca um `createClient` avulso de `@supabase/supabase-js`, que
// rodaria sem sessão e cairia como anônimo na policy "chamadas leitura"
// (to authenticated). Nome do funcionário resolvido com uma segunda query
// em `profiles` + lookup em memória (em vez de embed `profiles(nome)` do
// PostgREST) — o formato desse embed no retorno varia entre objeto e array
// dependendo da versão do supabase-js, mesma armadilha já evitada em
// HistoricoChamadas.tsx.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RangePeriodo } from '@/lib/kanban/periodo'
import { proximoDia } from '@/lib/kanban/filtro-data'
import type { Database } from '@/types/database'

type Chamada = Pick<
  Database['public']['Tables']['chamadas']['Row'],
  'usuario_id' | 'direcao' | 'status' | 'duracao_segundos' | 'iniciada_em'
>
type Profile = Database['public']['Tables']['profiles']['Row']

interface LinhaResumo {
  usuarioId: string
  nome: string
  total: number
  atendidas: number
  naoAtendidas: number
  emAndamento: number
  falhas: number
  duracaoTotalSegundos: number
}

function formatarDuracao(segundos: number) {
  const horas = Math.floor(segundos / 3600)
  const min = Math.floor((segundos % 3600) / 60)
  if (horas > 0) return `${horas}h ${min}m`
  return `${min}m`
}

export default function ChamadasPorFuncionario({ range }: { range: RangePeriodo }) {
  const [supabase] = useState(() => createClient())
  const [linhas, setLinhas] = useState<LinhaResumo[]>([])
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
          .select('usuario_id, direcao, status, duracao_segundos, iniciada_em')

        if (range.inicio) {
          query = query.gte('iniciada_em', `${range.inicio}T00:00:00`)
        }
        if (range.fim) {
          query = query.lt('iniciada_em', `${proximoDia(range.fim)}T00:00:00`)
        }

        const [{ data, error }, { data: profilesData, error: erroProfiles }] = await Promise.all([
          query,
          supabase.from('profiles').select('*'),
        ])
        if (error) throw error
        if (erroProfiles) throw erroProfiles
        if (!ativo) return

        const nomesPorId = new Map<string, string>(
          ((profilesData ?? []) as Profile[]).map((p) => [p.id, p.nome]),
        )

        const porUsuario = new Map<string, LinhaResumo>()

        for (const c of (data ?? []) as Chamada[]) {
          const usuarioId = c.usuario_id ?? 'sem-usuario'
          const nome = c.usuario_id ? nomesPorId.get(c.usuario_id) ?? 'Não identificado' : 'Não identificado'

          if (!porUsuario.has(usuarioId)) {
            porUsuario.set(usuarioId, {
              usuarioId,
              nome,
              total: 0,
              atendidas: 0,
              naoAtendidas: 0,
              emAndamento: 0,
              falhas: 0,
              duracaoTotalSegundos: 0,
            })
          }

          const linha = porUsuario.get(usuarioId)!
          linha.total += 1
          linha.duracaoTotalSegundos += c.duracao_segundos ?? 0

          if (c.status === 'atendida') linha.atendidas += 1
          else if (c.status === 'nao_atendida') linha.naoAtendidas += 1
          else if (c.status === 'em_andamento') linha.emAndamento += 1
          else if (c.status === 'falha') linha.falhas += 1
        }

        const resultado = Array.from(porUsuario.values()).sort((a, b) => b.total - a.total)
        setLinhas(resultado)
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : 'Erro ao carregar chamadas.')
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [supabase, range.inicio, range.fim])

  const totalGeral = linhas.reduce((acc, l) => acc + l.total, 0)

  return (
    <section className="rounded-lg border border-white/10 bg-surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-primary">Ligações por funcionário</h3>
        <span className="text-xs text-muted">{totalGeral} ligações no período</span>
      </div>

      {carregando && <p className="text-sm text-muted">Carregando...</p>}
      {erro && (
        <p className="rounded-md border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
          {erro}
        </p>
      )}

      {!carregando && !erro && linhas.length === 0 && (
        <p className="text-sm text-muted">Nenhuma ligação registrada nesse período.</p>
      )}

      {!carregando && linhas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Funcionário</th>
                <th className="px-3 py-2.5 text-center font-medium">Total</th>
                <th className="px-3 py-2.5 text-center font-medium">Atendidas</th>
                <th className="px-3 py-2.5 text-center font-medium">Não atendidas</th>
                <th className="px-3 py-2.5 text-center font-medium">Em andamento</th>
                <th className="px-3 py-2.5 text-center font-medium">Falhas</th>
                <th className="px-3 py-2.5 text-center font-medium">Tempo total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.usuarioId} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-3 py-2.5 font-medium text-primary">{l.nome}</td>
                  <td className="px-3 py-2.5 text-center text-primary">{l.total}</td>
                  <td className="px-3 py-2.5 text-center" style={{ color: '#2FAE66' }}>
                    {l.atendidas}
                  </td>
                  <td className="px-3 py-2.5 text-center" style={{ color: '#F4B400' }}>
                    {l.naoAtendidas}
                  </td>
                  <td className="px-3 py-2.5 text-center" style={{ color: '#3B7DD8' }}>
                    {l.emAndamento}
                  </td>
                  <td className="px-3 py-2.5 text-center" style={{ color: '#E5484D' }}>
                    {l.falhas}
                  </td>
                  <td className="px-3 py-2.5 text-center text-primary">
                    {formatarDuracao(l.duracaoTotalSegundos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
