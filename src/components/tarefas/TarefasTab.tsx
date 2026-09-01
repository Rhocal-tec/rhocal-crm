'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatarDataHoraPrevista } from '@/lib/kanban/formatacao'
import { badgeSituacao, situacaoTerminal } from '@/lib/tarefas/situacao'
import { NOTIFICAR_EM_OPCOES, rotuloNotificarEm, TAREFA_TIPOS_CONTATO } from '@/lib/tarefas/opcoes'
import { sincronizarTarefaComOmie } from '@/lib/tarefas/sincronizar'
import { TipoTarefaSelect } from './TipoTarefaSelect'
import type { Database } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

// Aba de acompanhamento reutilizada tanto no modal de oportunidade quanto no
// modal de pedido (fase 31) — recebe exatamente um dos dois ids. empresaId
// vem do registro pai (oportunidade/pedido), não do EmpresaContext ativo, pra
// nunca gravar a empresa errada caso o usuário troque de empresa no meio da
// tela (mesmo cuidado da fase 30 para as chamadas Omie).
export function TarefasTab({
  oportunidadeId,
  pedidoId,
  empresaId,
}: {
  oportunidadeId?: string
  pedidoId?: string
  empresaId?: string | null
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [carregando, setCarregando] = useState(true)
  const [descricao, setDescricao] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [dataPrevista, setDataPrevista] = useState('')
  const [tipo, setTipo] = useState('')
  const [notificarEm, setNotificarEm] = useState('nao_notificar')
  const [importante, setImportante] = useState(false)
  const [urgente, setUrgente] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setCarregando(true)

    async function carregar() {
      const query = supabase
        .from('tarefas')
        .select('*')
        .eq('excluida', false)
        .order('criado_em', { ascending: true })
      const { data } = oportunidadeId
        ? await query.eq('oportunidade_id', oportunidadeId)
        : await query.eq('pedido_id', pedidoId as string)

      const { data: profilesData } = await supabase.from('profiles').select('*')

      if (!ativo) return
      setTarefas(data ?? [])
      setProfiles(profilesData ?? [])
      setCarregando(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [supabase, oportunidadeId, pedidoId])

  function nomeDoResponsavel(id: string | null): string {
    if (!id) return '—'
    return profiles.find((p) => p.id === id)?.nome ?? '—'
  }

  // Fase 33.4: contador de tentativas — quantas tarefas com tipo de contato
  // (Ligação/WhatsApp/E-mail/Reunião) já foram marcadas como Realizada.
  const tentativasConcluidas = tarefas.filter(
    (t) => t.situacao === 'Realizada' && t.tipo && TAREFA_TIPOS_CONTATO.includes(t.tipo),
  ).length

  async function adicionarTarefa(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!user) return
    if (!descricao.trim()) {
      setErro('Informe a descrição da tarefa.')
      return
    }

    setSalvando(true)

    const { data, error } = await supabase
      .from('tarefas')
      .insert({
        oportunidade_id: oportunidadeId ?? null,
        pedido_id: pedidoId ?? null,
        empresa_id: empresaId ?? null,
        descricao: descricao.trim(),
        responsavel: responsavel || null,
        data_prevista: dataPrevista || null,
        tipo: tipo || null,
        notificar_em: notificarEm,
        importante,
        urgente,
        criado_por: user.id,
      })
      .select()
      .single()

    setSalvando(false)

    if (error || !data) {
      setErro('Não foi possível criar a tarefa. Tente novamente.')
      return
    }

    setTarefas((atual) => [...atual, data])
    setDescricao('')
    setResponsavel('')
    setDataPrevista('')
    setTipo('')
    setNotificarEm('nao_notificar')
    setImportante(false)
    setUrgente(false)

    if (data.oportunidade_id) sincronizarTarefaComOmie(data.id)
  }

  async function alterarSituacao(tarefa: Tarefa, novaSituacao: string) {
    const concluida = novaSituacao === 'Realizada'
    setTarefas((atual) =>
      atual.map((t) => (t.id === tarefa.id ? { ...t, situacao: novaSituacao, concluida } : t)),
    )

    const { error } = await supabase
      .from('tarefas')
      .update({ situacao: novaSituacao, concluida })
      .eq('id', tarefa.id)

    if (error) {
      setTarefas((atual) =>
        atual.map((t) =>
          t.id === tarefa.id ? { ...t, situacao: tarefa.situacao, concluida: tarefa.concluida } : t,
        ),
      )
      return
    }

    if (tarefa.oportunidade_id) sincronizarTarefaComOmie(tarefa.id)
  }

  async function excluirTarefa(tarefa: Tarefa) {
    if (!window.confirm(`Excluir a tarefa "${tarefa.descricao}"? Ela some da lista mas não é apagada do banco.`)) {
      return
    }
    setTarefas((atual) => atual.filter((t) => t.id !== tarefa.id))

    const { error } = await supabase
      .from('tarefas')
      .update({ excluida: true, excluida_em: new Date().toISOString(), excluida_por: user?.id ?? null })
      .eq('id', tarefa.id)

    if (error) setTarefas((atual) => [...atual, tarefa])
  }

  if (carregando) {
    return <div className="py-6 text-center text-sm text-muted">Carregando tarefas…</div>
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {oportunidadeId && tarefas.length > 0 && (
        <p className="text-xs text-muted">
          <span className="font-medium text-primary/80">{tentativasConcluidas}</span> tentativa(s) de
          contato concluída(s) (Ligação/WhatsApp/E-mail/Reunião marcadas como Realizada)
        </p>
      )}

      <form
        onSubmit={adicionarTarefa}
        className="flex flex-col gap-2 rounded-md border border-white/10 bg-surface-alt p-3"
      >
        <div>
          <label className="block text-xs text-muted">Descrição</label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
            placeholder="Ex: Ligar para confirmar interesse"
            disabled={salvando}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted">Responsável (opcional)</label>
            <select
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              disabled={salvando}
            >
              <option value="">—</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted">Data prevista (opcional)</label>
            <input
              type="date"
              value={dataPrevista}
              onChange={(e) => setDataPrevista(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              disabled={salvando}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted">Tipo (opcional)</label>
            <TipoTarefaSelect value={tipo} onChange={setTipo} disabled={salvando} />
          </div>
          <div>
            <label className="block text-xs text-muted">Lembrete</label>
            <select
              value={notificarEm}
              onChange={(e) => setNotificarEm(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
              disabled={salvando}
            >
              {NOTIFICAR_EM_OPCOES.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-end gap-3 pb-1.5">
            <label className="flex items-center gap-1.5 text-xs text-primary/80">
              <input
                type="checkbox"
                checked={importante}
                onChange={(e) => setImportante(e.target.checked)}
                disabled={salvando}
                className="h-4 w-4 accent-accent-primary"
              />
              Importante
            </label>
            <label className="flex items-center gap-1.5 text-xs text-primary/80">
              <input
                type="checkbox"
                checked={urgente}
                onChange={(e) => setUrgente(e.target.checked)}
                disabled={salvando}
                className="h-4 w-4 accent-accent-danger"
              />
              Urgente
            </label>
          </div>
        </div>
        {erro && <p className="text-xs text-accent-danger">{erro}</p>}
        <button
          type="submit"
          disabled={salvando}
          className="mt-1 self-start rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
        >
          {salvando ? 'Adicionando…' : '+ Adicionar tarefa'}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {tarefas.length === 0 && (
          <p className="text-center text-xs text-muted/60">Nenhuma tarefa cadastrada.</p>
        )}
        {tarefas.map((tarefa) => {
          const concluida = tarefa.situacao === 'Realizada'
          const terminal = situacaoTerminal(tarefa.situacao)
          const notifica = tarefa.notificar_em && tarefa.notificar_em !== 'nao_notificar'
          return (
            <div
              key={tarefa.id}
              className={`flex items-start gap-3 rounded-md border p-2.5 ${
                terminal ? 'border-white/5 bg-white/[0.02] opacity-60' : 'border-white/10 bg-surface'
              }`}
            >
              <input
                type="checkbox"
                checked={concluida}
                onChange={() =>
                  alterarSituacao(tarefa, tarefa.situacao === 'Realizada' ? 'Pendente' : 'Realizada')
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent-success"
              />
              <div className="flex-1">
                <p className={`text-sm text-primary ${terminal ? 'line-through' : ''}`}>{tarefa.descricao}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {nomeDoResponsavel(tarefa.responsavel)}
                  {tarefa.data_prevista &&
                    ` · até ${formatarDataHoraPrevista(tarefa.data_prevista, tarefa.hora_prevista)}`}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(() => {
                    const badge = badgeSituacao(tarefa.situacao)
                    return (
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ color: badge.cor, backgroundColor: badge.bg }}
                      >
                        {badge.label}
                      </span>
                    )
                  })()}
                  {tarefa.tipo && (
                    <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-muted">
                      {tarefa.tipo}
                    </span>
                  )}
                  {tarefa.importante && (
                    <span className="inline-flex rounded-full border border-accent-primary/40 bg-accent-primary/15 px-2 py-0.5 text-[10px] font-semibold text-accent-primary">
                      ★ Importante
                    </span>
                  )}
                  {tarefa.urgente && (
                    <span className="inline-flex rounded-full border border-accent-danger/40 bg-accent-danger/15 px-2 py-0.5 text-[10px] font-semibold text-accent-danger">
                      Urgente
                    </span>
                  )}
                  {notifica && (
                    <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-muted">
                      🔔 {rotuloNotificarEm(tarefa.notificar_em)}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted">
                  {!terminal && (
                    <button
                      type="button"
                      onClick={() => alterarSituacao(tarefa, 'Cancelada')}
                      className="hover:text-accent-danger"
                    >
                      Cancelar
                    </button>
                  )}
                  {tarefa.situacao === 'Cancelada' && (
                    <button
                      type="button"
                      onClick={() => alterarSituacao(tarefa, 'Pendente')}
                      className="hover:text-primary"
                    >
                      Reabrir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => excluirTarefa(tarefa)}
                    className="ml-auto hover:text-accent-danger"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
