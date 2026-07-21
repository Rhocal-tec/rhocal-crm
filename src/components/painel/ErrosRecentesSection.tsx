'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const LIMITE_ERROS = 30

interface ErroLog {
  id: number
  rota: string
  mensagem: string
  colaborador: string | null
  data_hora: string
}

function formatarDataHora(valor: string): string {
  const data = new Date(valor)
  return `${data.toLocaleDateString('pt-BR')} ${data.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

// Fase 25: log de erros próprio, sem depender de serviço externo — só o
// gestor enxerga (RLS de error_log já restringe a leitura a esse perfil).
export function ErrosRecentesSection() {
  const [supabase] = useState(() => createClient())
  const [erros, setErros] = useState<ErroLog[]>([])
  const [nomesPorColaborador, setNomesPorColaborador] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(true)
  const [erroCarregar, setErroCarregar] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setCarregando(true)
      setErroCarregar(null)

      const { data, error } = await supabase
        .from('error_log')
        .select('id, rota, mensagem, colaborador, data_hora')
        .order('data_hora', { ascending: false })
        .limit(LIMITE_ERROS)

      if (!ativo) return

      if (error) {
        setErroCarregar('Não foi possível carregar os erros recentes.')
        setCarregando(false)
        return
      }

      const lista = data ?? []
      setErros(lista)

      const idsColaboradores = Array.from(
        new Set(lista.map((e) => e.colaborador).filter((id): id is string => id !== null)),
      )
      if (idsColaboradores.length > 0) {
        const { data: perfis } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', idsColaboradores)
        if (ativo && perfis) {
          setNomesPorColaborador(Object.fromEntries(perfis.map((p) => [p.id, p.nome])))
        }
      }

      setCarregando(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [supabase])

  return (
    <div className="mt-6 rounded-lg border border-white/10 bg-surface p-4">
      <p className="text-sm font-medium text-primary">Erros recentes</p>
      <p className="mt-1 text-xs text-muted">
        Falhas capturadas nas integrações com o Omie e a Receita Federal — visível só para o
        gestor, sem depender de nenhuma ferramenta externa.
      </p>

      {erroCarregar && <p className="mt-3 text-sm text-accent-danger">{erroCarregar}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-muted">
              <th className="pb-1 pr-3 font-medium">Rota</th>
              <th className="pb-1 pr-3 font-medium">Mensagem</th>
              <th className="pb-1 pr-3 font-medium">Colaborador</th>
              <th className="pb-1 font-medium">Data/hora</th>
            </tr>
          </thead>
          <tbody>
            {erros.map((erro) => (
              <tr key={erro.id} className="border-b border-white/5">
                <td className="py-1.5 pr-3 font-mono text-xs text-primary">{erro.rota}</td>
                <td className="max-w-md py-1.5 pr-3 text-primary/90">{erro.mensagem}</td>
                <td className="py-1.5 pr-3 text-primary">
                  {erro.colaborador ? (nomesPorColaborador[erro.colaborador] ?? '—') : '—'}
                </td>
                <td className="py-1.5 whitespace-nowrap text-muted">
                  {formatarDataHora(erro.data_hora)}
                </td>
              </tr>
            ))}
            {!carregando && erros.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-muted">
                  Nenhum erro registrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {carregando && <p className="py-3 text-center text-sm text-muted">Carregando…</p>}
      </div>
    </div>
  )
}
