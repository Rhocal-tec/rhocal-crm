'use client'

// Card "Campanhas" da aba Produtividade (visão do gestor): campanhas criadas
// no mês, quantos contatos receberam mensagem de WhatsApp e, de forma
// analítica, quem enviou para quem e quando. Origem: tabelas `campanhas` e
// `campanha_clientes` (Inteligência > Campanhas > Disparo no WhatsApp).
// "Enviado" = o botão "Abrir no WhatsApp" foi clicado (o envio final é feito
// dentro do WhatsApp, então a contagem é a do clique).

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { limitesDoMes } from '@/lib/produtividade/calculo'
import type { Database } from '@/types/database'

type Campanha = Database['public']['Tables']['campanhas']['Row']
type Perfil = { id: string; nome: string }

interface LinhaEnvio {
  campanha_id: string
  cliente_nome: string
  whatsapp_enviado_em: string | null
  whatsapp_enviado_por: string | null
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div>
      <p className="text-xs text-muted">{rotulo}</p>
      <p className="font-mono text-xl font-semibold text-primary">{valor}</p>
    </div>
  )
}

export function CampanhasProdutividade({
  empresaId,
  ano,
  mes,
}: {
  empresaId: string
  ano: number
  mes: number
}) {
  const [supabase] = useState(() => createClient())
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [linhas, setLinhas] = useState<LinhaEnvio[]>([])
  const [totaisPorCampanha, setTotaisPorCampanha] = useState<Record<string, number>>({})
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [semColunaPor, setSemColunaPor] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)

  const { inicio, fim } = useMemo(() => limitesDoMes(ano, mes), [ano, mes])

  useEffect(() => {
    let ativo = true

    async function carregar() {
      setCarregando(true)
      setErro(null)
      try {
        const { data: camps, error: erroCamps } = await supabase
          .from('campanhas')
          .select('*')
          .eq('empresa_id', empresaId)
          .order('criado_em', { ascending: false })
        if (erroCamps) throw erroCamps
        const lista = camps ?? []

        const ids = lista.map((c) => c.id)
        let envios: LinhaEnvio[] = []
        let faltaColuna = false
        if (ids.length > 0) {
          const comPor = await supabase
            .from('campanha_clientes')
            .select('campanha_id, cliente_nome, whatsapp_enviado_em, whatsapp_enviado_por')
            .in('campanha_id', ids)
            .not('whatsapp_enviado_em', 'is', null)
            .gte('whatsapp_enviado_em', inicio.toISOString())
            .lt('whatsapp_enviado_em', fim.toISOString())
            .limit(5000)
          if (comPor.error) {
            // Migração 0035 ainda não rodada: conta os envios, sem "quem".
            faltaColuna = true
            const semPor = await supabase
              .from('campanha_clientes')
              .select('campanha_id, cliente_nome, whatsapp_enviado_em')
              .in('campanha_id', ids)
              .not('whatsapp_enviado_em', 'is', null)
              .gte('whatsapp_enviado_em', inicio.toISOString())
              .lt('whatsapp_enviado_em', fim.toISOString())
              .limit(5000)
            if (semPor.error) throw semPor.error
            envios = (semPor.data ?? []).map((l) => ({ ...l, whatsapp_enviado_por: null }))
          } else {
            envios = (comPor.data ?? []) as LinhaEnvio[]
          }
        }

        const { data: perfisData } = await supabase.from('profiles').select('id, nome')
        if (!ativo) return

        setCampanhas(lista)
        setTotaisPorCampanha(Object.fromEntries(lista.map((c) => [c.id, c.total_clientes])))
        setLinhas(envios)
        setPerfis((perfisData ?? []) as Perfil[])
        setSemColunaPor(faltaColuna)
      } catch (err) {
        console.error('Erro ao carregar produtividade de campanhas:', err)
        if (ativo) setErro('Não foi possível carregar os dados de campanhas.')
      } finally {
        if (ativo) setCarregando(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [supabase, empresaId, inicio, fim])

  const nomePor = useMemo(() => new Map(perfis.map((p) => [p.id, p.nome])), [perfis])

  const criadasNoMes = useMemo(
    () =>
      campanhas.filter((c) => {
        const t = Date.parse(c.criado_em)
        return t >= inicio.getTime() && t < fim.getTime()
      }),
    [campanhas, inicio, fim],
  )

  // Campanhas com algum movimento no mês: criadas ou com envios no período.
  const campanhasComMovimento = useMemo(() => {
    const comEnvio = new Set(linhas.map((l) => l.campanha_id))
    return campanhas.filter((c) => criadasNoMes.includes(c) || comEnvio.has(c.id))
  }, [campanhas, criadasNoMes, linhas])

  const porColaborador = useMemo(() => {
    const mapa = new Map<string, { nome: string; enviados: number; campanhas: Set<string> }>()
    for (const l of linhas) {
      const chave = l.whatsapp_enviado_por ?? 'nao-identificado'
      const nome = l.whatsapp_enviado_por
        ? (nomePor.get(l.whatsapp_enviado_por) ?? 'Colaborador')
        : 'Não identificado'
      const atual = mapa.get(chave) ?? { nome, enviados: 0, campanhas: new Set<string>() }
      atual.enviados += 1
      atual.campanhas.add(l.campanha_id)
      mapa.set(chave, atual)
    }
    return Array.from(mapa.values()).sort((a, b) => b.enviados - a.enviados)
  }, [linhas, nomePor])

  const criadoresDoMes = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const c of criadasNoMes) mapa.set(c.criado_por, (mapa.get(c.criado_por) ?? 0) + 1)
    return mapa
  }, [criadasNoMes])

  return (
    <section className="mt-6 rounded-lg border border-white/10 bg-surface p-5">
      <h2 className="font-heading text-lg font-semibold tracking-wide text-primary">
        Campanhas (Inteligência)
      </h2>
      <p className="mt-1 text-xs text-muted">
        Contatos contados quando o botão &quot;Abrir no WhatsApp&quot; é clicado na lista de disparo da campanha.
      </p>

      {carregando && <p className="mt-3 text-sm text-muted">Carregando campanhas…</p>}
      {erro && <p className="mt-3 text-sm text-accent-danger">{erro}</p>}

      {!carregando && !erro && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Indicador rotulo="Campanhas criadas no mês" valor={criadasNoMes.length} />
            <Indicador rotulo="Contatos com mensagem enviada" valor={linhas.length} />
            <Indicador rotulo="Campanhas com disparo no mês" valor={new Set(linhas.map((l) => l.campanha_id)).size} />
          </div>

          {semColunaPor && (
            <p className="mt-3 text-xs text-muted">
              Para saber QUEM enviou, rode a migração 0035 no Supabase. Até lá, só o total de envios aparece.
            </p>
          )}

          {campanhasComMovimento.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nenhuma campanha criada ou disparada neste mês.</p>
          ) : (
            <>
              <h3 className="mt-5 text-sm font-semibold text-primary">Por colaborador</h3>
              {porColaborador.length === 0 && criadoresDoMes.size === 0 ? (
                <p className="mt-1 text-xs text-muted">Nenhum disparo registrado no mês.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Colaborador</th>
                        <th className="py-1 pr-3 font-medium">Campanhas criadas</th>
                        <th className="py-1 pr-3 font-medium">Contatos enviados</th>
                        <th className="py-1 font-medium">Campanhas disparadas</th>
                      </tr>
                    </thead>
                    <tbody className="text-primary">
                      {Array.from(
                        new Set([
                          ...Array.from(criadoresDoMes.keys()).map((id) => nomePor.get(id) ?? 'Colaborador'),
                          ...porColaborador.map((p) => p.nome),
                        ]),
                      ).map((nome) => {
                        const idCriador = Array.from(criadoresDoMes.keys()).find((id) => nomePor.get(id) === nome)
                        const envio = porColaborador.find((p) => p.nome === nome)
                        return (
                          <tr key={nome} className="border-t border-white/5">
                            <td className="py-1.5 pr-3">{nome}</td>
                            <td className="py-1.5 pr-3 font-mono">{idCriador ? criadoresDoMes.get(idCriador) : 0}</td>
                            <td className="py-1.5 pr-3 font-mono">{envio?.enviados ?? 0}</td>
                            <td className="py-1.5 font-mono">{envio?.campanhas.size ?? 0}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="mt-5 text-sm font-semibold text-primary">Por campanha (analítico)</h3>
              <div className="mt-2 flex flex-col gap-2">
                {campanhasComMovimento.map((c) => {
                  const envios = linhas
                    .filter((l) => l.campanha_id === c.id)
                    .sort((a, b) => (b.whatsapp_enviado_em ?? '').localeCompare(a.whatsapp_enviado_em ?? ''))
                  const total = totaisPorCampanha[c.id] ?? c.total_clientes
                  const expandida = aberta === c.id
                  return (
                    <div key={c.id} className="rounded-md border border-white/10 bg-surface-alt p-3">
                      <button
                        type="button"
                        onClick={() => setAberta(expandida ? null : c.id)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                      >
                        <span className="text-sm font-medium text-primary">{c.nome}</span>
                        <span className="text-xs text-muted">
                          Criada em {new Date(c.criado_em).toLocaleDateString('pt-BR')} por{' '}
                          {nomePor.get(c.criado_por) ?? 'Colaborador'} ·{' '}
                          <span className="font-semibold text-primary">
                            {envios.length} de {total}
                          </span>{' '}
                          enviados no mês {expandida ? '▲' : '▼'}
                        </span>
                      </button>
                      {expandida &&
                        (envios.length === 0 ? (
                          <p className="mt-2 text-xs text-muted">Nenhum envio neste mês.</p>
                        ) : (
                          <ul className="mt-2 divide-y divide-white/5 text-xs">
                            {envios.map((e) => (
                              <li
                                key={`${e.cliente_nome}-${e.whatsapp_enviado_em}`}
                                className="flex flex-wrap justify-between gap-2 py-1.5"
                              >
                                <span className="text-primary">{e.cliente_nome}</span>
                                <span className="text-muted">
                                  {e.whatsapp_enviado_por
                                    ? (nomePor.get(e.whatsapp_enviado_por) ?? 'Colaborador')
                                    : 'Não identificado'}{' '}
                                  · {e.whatsapp_enviado_em ? dataHora(e.whatsapp_enviado_em) : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ))}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
