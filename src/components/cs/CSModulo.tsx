'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { useDadosCS } from '@/lib/cs/useDadosCS'
import { montarFila, type ItemFila } from '@/lib/cs/fila'
import { podeAtenderCS, podeEditarRegrasCS } from '@/lib/cs/permissions'
import type { SetorTipo } from '@/types/database'
import { FilaDoDia } from './FilaDoDia'
import { TelaAtendimento } from './TelaAtendimento'
import { ReclamacoesLista } from './ReclamacoesLista'
import { RepassesLista } from './RepassesLista'
import { RegrasCS } from './RegrasCS'
import { PosVendaRecentes } from './PosVendaRecentes'

type Aba = 'fila' | 'recentes' | 'reclamacoes' | 'repasses' | 'regras'

export function CSModulo({ setor }: { setor: SetorTipo }) {
  const { profile } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const { dados, carregando, erro, recarregar } = useDadosCS(empresaAtiva?.id ?? null)
  const atende = podeAtenderCS(setor)
  const [aba, setAba] = useState<Aba>(atende ? 'fila' : 'reclamacoes')
  const [atendendo, setAtendendo] = useState<ItemFila | null>(null)

  const fila = useMemo(() => {
    const abertas = dados.reclamacoes.filter((r) => r.status === 'aberta' || r.status === 'com_a_area')
    const chaves = new Set<string>()
    for (const c of dados.clientes) {
      const cnpj = c.cnpj?.replace(/\D/g, '') ?? null
      const nome = c.nome.trim().toLowerCase()
      if (abertas.some((r) => (cnpj && r.cliente_cnpj === cnpj) || r.cliente_nome.trim().toLowerCase() === nome)) {
        chaves.add(c.chave)
      }
    }
    return montarFila({
      clientes: dados.clientes,
      contatos: dados.contatos,
      chavesComReclamacaoAberta: chaves,
      reposicaoPorCliente: dados.reposicaoPorCliente,
      ultimaEntregaPorCliente: dados.ultimaEntregaPorCliente,
      config: dados.config,
      agora: new Date(),
    })
  }, [dados])

  if (!empresaAtiva || !profile) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted">Carregando…</div>
  }

  if (atendendo && atende) {
    const idx = fila.findIndex((f) => f.cliente.chave === atendendo.cliente.chave && f.fase === atendendo.fase)
    const proximo = idx >= 0 ? (fila[idx + 1] ?? null) : (fila[0] ?? null)
    return (
      <TelaAtendimento
        key={`${atendendo.cliente.chave}-${atendendo.fase}`}
        item={atendendo}
        proximo={proximo}
        dados={dados}
        empresaId={empresaAtiva.id}
        empresaNome={empresaAtiva.nome_fantasia}
        profile={profile}
        onSair={() => setAtendendo(null)}
        onProximo={(p) => setAtendendo(p)}
        recarregar={recarregar}
      />
    )
  }

  const abas: { id: Aba; label: string }[] = [
    ...(atende ? [{ id: 'fila' as Aba, label: 'Fila do dia' }, { id: 'recentes' as Aba, label: 'Entregues 30 dias (MATSEG)' }] : []),
    { id: 'reclamacoes', label: 'Reclamações' },
    { id: 'repasses', label: 'Repasses' },
    ...(podeEditarRegrasCS(setor) ? [{ id: 'regras' as Aba, label: 'Regras' }] : []),
  ]

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-6 pt-3">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
              aba === a.id ? 'bg-surface text-primary' : 'text-muted hover:text-primary'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {!dados.tabelasCS && (
        <div className="m-6 rounded-lg border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
          O módulo CS ainda não foi ativado no banco. Rode as migrações 0037 (sozinha) e depois a 0038 no Supabase.
        </div>
      )}
      {erro && <p className="m-6 text-sm text-accent-danger">{erro}</p>}
      {carregando && <p className="px-6 pt-4 text-sm text-muted">Carregando dados…</p>}

      {!carregando && aba === 'fila' && atende && (
        <FilaDoDia fila={fila} dados={dados} usuarioId={profile.id} onAtender={setAtendendo} />
      )}
      {aba === 'recentes' && atende && <PosVendaRecentes dados={dados} />}
      {!carregando && aba === 'reclamacoes' && (
        <ReclamacoesLista setor={setor} dados={dados} usuarioId={profile.id} recarregar={recarregar} />
      )}
      {!carregando && aba === 'repasses' && (
        <RepassesLista setor={setor} dados={dados} usuarioId={profile.id} recarregar={recarregar} />
      )}
      {aba === 'regras' && podeEditarRegrasCS(setor) && (
        <RegrasCS config={dados.config} usuarioId={profile.id} recarregar={recarregar} />
      )}
    </div>
  )
}
