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

  const nomeCampanha = useMemo(() => new Map(campanhas.map((c) => [c.id, c.nome])), [campanhas])

  // Um card por colaborador que criou campanha ou enviou mensagem no mês.
  const cartoes = useMemo(() => {
    const mapa = new Map<
      string,
      { chave: string; nome: string; criadas: string[]; enviados: number; porCampanha: Map<string, number> }
    >()
    function obter(id: string | null) {
      const chave = id ?? 'nao-identificado'
      let c = mapa.get(chave)
      if (!c) {
        c = {
          chave,
          nome: id ? (nomePor.get(id) ?? 'Colaborador') : 'Não identificado',
          criadas: [],
          enviados: 0,
          porCampanha: new Map(),
        }
        mapa.set(chave, c)
      }
      return c
    }
    for (const camp of criadasNoMes) obter(camp.criado_por).criadas.push(camp.nome)
    for (const l of linhas) {
      const c = obter(l.whatsapp_enviado_por)
      c.enviados += 1
      c.porCampanha.set(l.campanha_id, (c.porCampanha.get(l.campanha_id) ?? 0) + 1)
    }
    return Array.from(mapa.values()).sort(
      (a, b) => b.enviados - a.enviados || b.criadas.length - a.criadas.length,
    )
  }, [criadasNoMes, linhas, nomePor])

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
              {cartoes.length === 0 ? (
                <p className="mt-1 text-xs text-muted">Nenhum disparo ou campanha registrada no mês.</p>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {cartoes.map((c) => (
                    <div key={c.chave} className="rounded-lg border border-white/10 bg-surface-alt p-4">
                      <p className="font-heading text-base font-semibold text-primary">{c.nome}</p>
                      <div className="mt-2 grid grid-cols-3 gap-3">
                        <Indicador rotulo="Campanhas criadas" valor={c.criadas.length} />
                        <Indicador rotulo="Contatos com mensagem" valor={c.enviados} />
                        <Indicador rotulo="Campanhas disparadas" valor={c.porCampanha.size} />
                      </div>
                      {c.porCampanha.size > 0 && (
                        <ul className="mt-3 divide-y divide-white/5 text-xs">
                          {Array.from(c.porCampanha.entries()).map(([idCamp, qtd]) => (
                            <li key={idCamp} className="flex justify-between gap-2 py-1.5">
                              <span className="text-primary">{nomeCampanha.get(idCamp) ?? 'Campanha'}</span>
                              <span className="font-mono text-muted">{qtd} enviado(s)</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {c.criadas.length > 0 && (
                        <p className="mt-2 text-[11px] text-muted">Criou: {c.criadas.join(', ')}</p>
                      )}
                    </div>
                  ))}
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
