'use client'

import { useMemo, useState } from 'react'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import { CANAIS, FASES_ORDEM, FASE_LABELS, RESULTADOS_REPASSE, DESTINOS_REPASSE, type FaseCS } from '@/lib/cs/constantes'
import type { DadosCS } from '@/lib/cs/useDadosCS'

type Periodo = 'hoje' | '7' | '30' | '90' | 'tudo'
const MS_DIA = 86_400_000

function contar<T>(itens: T[], chave: (i: T) => string | string[] | null | undefined): [string, number][] {
  const m = new Map<string, number>()
  for (const i of itens) {
    const k = chave(i)
    for (const v of Array.isArray(k) ? k : [k]) {
      const t = v?.toString().trim()
      if (t) m.set(t, (m.get(t) ?? 0) + 1)
    }
  }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—')
const dia = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Card({ titulo, valor, sub, alerta }: { titulo: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${alerta ? 'text-accent-danger' : 'text-primary'}`}>{valor}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  )
}

function Tabela({ titulo, colunas, linhas }: { titulo: string; colunas: string[]; linhas: (string | number)[][] }) {
  return (
    <section className="rounded-lg border border-white/10 bg-surface p-4">
      <h3 className="mb-2 text-sm font-semibold text-primary">{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="text-xs text-muted">Sem dados no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted">
                {colunas.map((c) => (
                  <th key={c} className="px-2 py-1 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className="border-t border-white/5 text-primary/90">
                  {l.map((v, j) => (
                    <td key={j} className="px-2 py-1">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function Indicadores({ dados }: { dados: DadosCS }) {
  const [periodo, setPeriodo] = useState<Periodo>('30')
  const nome = (id: string | null) => (id ? (dados.nomesPorProfileId[id] ?? 'Desconhecido') : '—')
  const meta = dados.config.meta_dia ?? 20

  const d = useMemo(() => {
    const agora = new Date()
    let corte = ''
    if (periodo === 'hoje') {
      const i = new Date(agora)
      i.setHours(0, 0, 0, 0)
      corte = i.toISOString()
    } else if (periodo !== 'tudo') {
      corte = new Date(agora.getTime() - Number(periodo) * MS_DIA).toISOString()
    }
    const noPeriodo = (iso: string) => !corte || iso >= corte

    const contatos = dados.contatos.filter((c) => c.status !== 'em_andamento' && noPeriodo(c.criado_em))
    const idsContatos = new Set(contatos.map((c) => c.id))
    const contatoPorId = new Map(dados.contatos.map((c) => [c.id, c]))
    const pesquisas = dados.pesquisas.filter((p) => idsContatos.has(p.contato_id))
    const comNota = pesquisas.filter((p) => p.nota !== null)
    const prom = comNota.filter((p) => (p.nota as number) >= 9).length
    const neut = comNota.filter((p) => (p.nota as number) >= 7 && (p.nota as number) <= 8).length
    const det = comNota.filter((p) => (p.nota as number) <= 6).length
    const nps = comNota.length ? Math.round(((prom - det) / comNota.length) * 100) : null
    const media = comNota.length ? comNota.reduce((s, p) => s + (p.nota as number), 0) / comNota.length : null

    const reclam = dados.reclamacoes.filter((r) => noPeriodo(r.aberta_em))
    const abertas = reclam.filter((r) => r.status === 'aberta' || r.status === 'com_a_area')
    const vencidas = abertas.filter((r) => new Date(r.prazo_em) < agora)
    const fechadas = reclam.filter((r) => r.status === 'resolvida' || r.status === 'retorno_dado')
    const comRetorno = reclam.filter((r) => r.retorno_em)
    const noPrazo = comRetorno.filter((r) => (r.retorno_em as string) <= r.prazo_em).length
    const horasMedias = comRetorno.length
      ? comRetorno.reduce((s, r) => s + (new Date(r.retorno_em as string).getTime() - new Date(r.aberta_em).getTime()) / 3_600_000, 0) /
        comRetorno.length
      : null

    const rep = dados.repasses.filter((r) => noPeriodo(r.criado_em))
    const fechados = rep.filter((r) => r.resultado === 'pedido_fechado')
    const encerrados = rep.filter((r) => r.resultado !== 'pendente')

    // Dia a dia
    const porDia = new Map<string, { total: number; resp: number; sem: number; recl: number }>()
    for (const c of contatos) {
      const k = dia(c.criado_em)
      const x = porDia.get(k) ?? { total: 0, resp: 0, sem: 0, recl: 0 }
      x.total += 1
      if (c.status === 'respondeu') x.resp += 1
      if (c.status === 'sem_retorno') x.sem += 1
      if (c.status === 'reclamacao_aberta') x.recl += 1
      porDia.set(k, x)
    }
    const dias = Array.from(porDia.entries()).sort((a, b) => b[0].localeCompare(a[0]))

    return { contatos, pesquisas, comNota, prom, neut, det, nps, media, reclam, abertas, vencidas, fechadas, noPrazo, comRetorno, horasMedias, rep, fechados, encerrados, dias, contatoPorId }
  }, [dados, periodo])

  const respondeu = d.contatos.filter((c) => c.status === 'respondeu' || c.status === 'reclamacao_aberta').length
  const semRetorno = d.contatos.filter((c) => c.status === 'sem_retorno').length
  const valorFechado = d.fechados.reduce((s, r) => s + (r.valor ?? 0), 0)
  const diasMeta = d.dias.filter(([, v]) => v.total >= meta).length

  function exportarCsv() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const pesquisaPorContato = new Map(d.pesquisas.map((p) => [p.contato_id, p]))
    const linhas = [
      ['Data', 'Cliente', 'CNPJ', 'Fase', 'Canal', 'Status', 'Atendente', 'Nota', 'Motivos da nota', 'P1 palavra', 'P2 motivos', 'Outros fornecedores', 'Fornecedor', 'P4 mudaria', 'P5 origem', 'Próx. reposição', 'Observação'],
      ...d.contatos.map((c) => {
        const p = pesquisaPorContato.get(c.id)
        return [
          formatarDataSomente(c.criado_em), c.cliente_nome, c.cliente_cnpj ?? '', FASE_LABELS[c.fase as FaseCS] ?? c.fase,
          c.canal ?? '', c.status, nome(c.usuario_id), p?.nota ?? '', (p?.motivos ?? []).join('; '), p?.p1_palavra ?? '',
          (p?.p2_motivos ?? []).join('; '), p?.p3_outros_fornecedores === null || p === undefined ? '' : p.p3_outros_fornecedores ? 'Sim' : 'Não',
          p?.p3_nome ?? '', p?.p4_mudaria ?? '', p?.p5_origem ?? '', p?.proxima_reposicao ?? '', c.observacao ?? '',
        ]
      }),
    ]
    const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `cs-contatos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const porFase = FASES_ORDEM.map((f) => {
    const cs = d.contatos.filter((c) => c.fase === f)
    const notas = d.pesquisas.filter((p) => p.nota !== null && cs.some((c) => c.id === p.contato_id))
    const m = notas.length ? (notas.reduce((s, p) => s + (p.nota as number), 0) / notas.length).toFixed(1) : '—'
    return [FASE_LABELS[f], cs.length, pct(cs.filter((c) => c.status !== 'sem_retorno').length, cs.length), cs.filter((c) => c.status === 'sem_retorno').length, m]
  }).filter((l) => (l[1] as number) > 0)

  const atendentes = Array.from(new Set(d.contatos.map((c) => c.usuario_id))).map((id) => {
    const cs = d.contatos.filter((c) => c.usuario_id === id)
    return [nome(id), cs.length, cs.filter((c) => c.status !== 'sem_retorno').length, cs.filter((c) => c.status === 'sem_retorno').length, d.reclam.filter((r) => r.criado_por === id).length, d.rep.filter((r) => r.criado_por === id).length]
  })

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary">Indicadores do CS</h2>
        <div className="flex items-center gap-2">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className="input-field rounded-md px-2.5 py-1.5 text-sm">
            <option value="hoje">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="tudo">Todo o período</option>
          </select>
          <button onClick={exportarCsv} className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-primary/80 hover:bg-white/10">
            ⬇ Exportar contatos (CSV)
          </button>
        </div>
      </div>

      {/* ===== SINTÉTICO ===== */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card titulo="Contatos feitos" valor={String(d.contatos.length)} sub={`${diasMeta} dia(s) com meta de ${meta} batida`} />
        <Card titulo="Taxa de resposta" valor={pct(respondeu, d.contatos.length)} sub={`${respondeu} responderam · ${semRetorno} sem retorno`} />
        <Card titulo="NPS" valor={d.nps === null ? '—' : String(d.nps)} sub={`${d.prom} promotores · ${d.neut} neutros · ${d.det} detratores`} />
        <Card titulo="Nota média" valor={d.media === null ? '—' : d.media.toFixed(1)} sub={`${d.comNota.length} pesquisa(s) com nota`} />
        <Card titulo="Reclamações abertas" valor={String(d.abertas.length)} sub={`${d.reclam.length} no período`} />
        <Card titulo="Reclamações vencidas" valor={String(d.vencidas.length)} alerta={d.vencidas.length > 0} sub={`${d.fechadas.length} resolvidas`} />
        <Card titulo="Retorno no prazo" valor={pct(d.noPrazo, d.comRetorno.length)} sub={d.horasMedias === null ? 'Sem retornos ainda' : `Média de ${d.horasMedias.toFixed(0)} h até o retorno`} />
        <Card titulo="Repasses" valor={String(d.rep.length)} sub={`${d.rep.filter((r) => r.resultado === 'pendente').length} pendentes`} />
        <Card titulo="Repasses que fecharam" valor={pct(d.fechados.length, d.encerrados.length)} sub={`${d.fechados.length} pedido(s) fechado(s)`} />
        <Card titulo="Valor fechado em repasses" valor={formatarMoeda(valorFechado)} />
      </div>

      {/* ===== ANALÍTICO ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Tabela
          titulo="Por dia"
          colunas={['Dia', 'Contatos', 'Responderam', 'Sem retorno', 'Reclamações', 'Meta']}
          linhas={d.dias.slice(0, 31).map(([k, v]) => [k.split('-').reverse().join('/'), v.total, v.resp, v.sem, v.recl, v.total >= meta ? '✓' : `${v.total}/${meta}`])}
        />
        <Tabela titulo="Por fase" colunas={['Fase', 'Contatos', 'Resposta', 'Sem retorno', 'Nota média']} linhas={porFase} />
        <Tabela titulo="Por atendente" colunas={['Atendente', 'Contatos', 'Com retorno', 'Sem retorno', 'Reclamações', 'Repasses']} linhas={atendentes} />
        <Tabela
          titulo="Por canal"
          colunas={['Canal', 'Contatos']}
          linhas={contar(d.contatos, (c) => CANAIS.find((x) => x.valor === c.canal)?.label ?? c.canal)}
        />
        <Tabela
          titulo="Distribuição das notas"
          colunas={['Nota', 'Quantidade']}
          linhas={contar(d.comNota, (p) => String(p.nota)).sort((a, b) => Number(b[0]) - Number(a[0]))}
        />
        <Tabela titulo="Motivos das notas" colunas={['Motivo', 'Vezes']} linhas={contar(d.pesquisas, (p) => p.motivos)} />
        <Tabela titulo="P1 · Palavra que descreve a marca" colunas={['Palavra', 'Vezes']} linhas={contar(d.pesquisas, (p) => p.p1_palavra?.toLowerCase()).slice(0, 15)} />
        <Tabela titulo="P2 · Por que escolheu" colunas={['Motivo', 'Vezes']} linhas={contar(d.pesquisas, (p) => p.p2_motivos)} />
        <Tabela
          titulo="P3 · Compra de outros fornecedores"
          colunas={['Fornecedor', 'Vezes']}
          linhas={[
            ['Responderam que SIM', d.pesquisas.filter((p) => p.p3_outros_fornecedores === true).length],
            ...contar(d.pesquisas, (p) => p.p3_nome).slice(0, 10),
          ]}
        />
        <Tabela titulo="P5 · Como conheceu" colunas={['Origem', 'Vezes']} linhas={contar(d.pesquisas, (p) => p.p5_origem)} />
        <Tabela titulo="Reclamações por categoria" colunas={['Categoria', 'Quantidade']} linhas={contar(d.reclam, (r) => r.categoria)} />
        <Tabela titulo="Reclamações por área" colunas={['Área', 'Quantidade']} linhas={contar(d.reclam, (r) => r.area_responsavel)} />
        <Tabela
          titulo="Repasses por destino"
          colunas={['Destino', 'Total', 'Fechados', 'Pendentes']}
          linhas={DESTINOS_REPASSE.map((x) => {
            const r = d.rep.filter((i) => i.destino === x.valor)
            return [x.label, r.length, r.filter((i) => i.resultado === 'pedido_fechado').length, r.filter((i) => i.resultado === 'pendente').length]
          }).filter((l) => (l[1] as number) > 0)}
        />
        <Tabela
          titulo="Repasses por resultado"
          colunas={['Resultado', 'Quantidade']}
          linhas={RESULTADOS_REPASSE.map((x) => [x.label, d.rep.filter((i) => i.resultado === x.valor).length]).filter((l) => (l[1] as number) > 0)}
        />
      </div>

      <Tabela
        titulo="Contatos detalhados (mais recentes primeiro)"
        colunas={['Data', 'Cliente', 'Fase', 'Status', 'Atendente', 'Nota', 'Observação']}
        linhas={d.contatos.slice(0, 200).map((c) => [
          formatarDataSomente(c.criado_em), c.cliente_nome, FASE_LABELS[c.fase as FaseCS] ?? c.fase, c.status.replace(/_/g, ' '), nome(c.usuario_id),
          d.pesquisas.find((p) => p.contato_id === c.id)?.nota ?? '—', c.observacao ?? '',
        ])}
      />
    </div>
  )
}
