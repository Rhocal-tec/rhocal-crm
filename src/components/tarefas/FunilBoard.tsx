'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { PRAZO_COLUNAS, PRAZO_LABELS, classificarPrazo, type PrazoBucket } from '@/lib/tarefas/prazo'
import { contatoDaTarefa } from '@/lib/tarefas/contato'
import { sincronizarTarefaComOmie } from '@/lib/tarefas/sincronizar'
import { useConclusaoTarefa } from '@/lib/tarefas/useConclusaoTarefa'
import { FiltroData } from '@/components/busca/FiltroData'
import type { ModoFiltroData } from '@/lib/kanban/filtro-data'
import { TarefaColuna } from './TarefaColuna'
import { EncadearTarefaModal } from './EncadearTarefaModal'
import { TarefaModal } from './TarefaModal'
import { ConcluirTarefaModal } from './ConcluirTarefaModal'
import { OportunidadeColumn } from '@/components/oportunidades/OportunidadeColumn'
import { NovaOportunidadeModal } from '@/components/oportunidades/NovaOportunidadeModal'
import { CadastroRelampagoModal } from '@/components/oportunidades/CadastroRelampagoModal'
import { OportunidadeDetalheModal } from '@/components/oportunidades/OportunidadeDetalheModal'
import type { Database, SetorTipo } from '@/types/database'

type Tarefa = Database['public']['Tables']['tarefas']['Row']
type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

// Filtro por coluna (fase de busca do FunilBoard) — as 4 colunas de prazo das
// tarefas + a coluna única de Oportunidades, que não tem "prazo" (por isso
// não é um PrazoBucket, fica de fora do classificarPrazo).
type ColunaFiltro = PrazoBucket | 'OPORTUNIDADES'
const COLUNAS_FILTRO: ColunaFiltro[] = [...PRAZO_COLUNAS, 'OPORTUNIDADES']
const COLUNA_FILTRO_LABELS: Record<ColunaFiltro, string> = {
  ...PRAZO_LABELS,
  OPORTUNIDADES: 'Oportunidades',
}

// Kanban único e contínuo: as 4 colunas de Tarefas (por prazo) seguidas de
// UMA coluna "Oportunidades" (todos os leads ativos juntos, sem separar por
// etapa do funil — a etapa é editável dentro do modal de detalhe), rolando
// horizontalmente como uma coisa só. Substitui as antigas
// TarefasBoard/OportunidadesBoard (que tinham cada uma seu próprio container
// de scroll) — a fusão é necessária porque as colunas precisam ser irmãs no
// mesmo container DOM pra rolar juntas; não dá pra simular isso com dois
// componentes independentes. Sem drag-and-drop: com uma coluna só de
// Oportunidades não há mais "outra coluna" pra soltar o card em cima.
export function FunilBoard({ setor }: { setor: SetorTipo }) {
  const { user } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())

  // ===== Tarefas =====
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loadingTarefas, setLoadingTarefas] = useState(true)
  const [minhaFila, setMinhaFila] = useState(false)
  const [profilesPorId, setProfilesPorId] = useState<Record<string, string>>({})
  const [oportunidadesPorId, setOportunidadesPorId] = useState<
    Record<string, { numero: number; cliente_nome: string }>
  >({})
  const [pedidosPorId, setPedidosPorId] = useState<Record<string, { numero: number; cliente_nome: string }>>(
    {},
  )
  const [novaTarefaAberta, setNovaTarefaAberta] = useState(false)

  // ===== Busca/filtro do quadro (tarefas + oportunidades juntas) =====
  const [buscaCliente, setBuscaCliente] = useState('')
  const [modoData, setModoData] = useState<ModoFiltroData>('nenhum')
  const [dataEspecifica, setDataEspecifica] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')
  const [colunasVisiveis, setColunasVisiveis] = useState<Set<ColunaFiltro>>(new Set(COLUNAS_FILTRO))

  // ===== Oportunidades =====
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([])
  const [loadingOportunidades, setLoadingOportunidades] = useState(true)
  const [novoLeadAberto, setNovoLeadAberto] = useState(false)
  const [cadastroRelampagoAberto, setCadastroRelampagoAberto] = useState(false)
  const [nomesPorId, setNomesPorId] = useState<Record<string, string>>({})

  // Compartilhado: o modal de detalhe da oportunidade é aberto tanto ao
  // clicar num card de oportunidade quanto pelo fluxo "Virou oportunidade"
  // da conclusão de tarefa — uma única instância/estado serve aos dois.
  const [oportunidadeAbertaId, setOportunidadeAbertaId] = useState<string | null>(null)

  // Toast simples pra "Oportunidade criada com sucesso" (fluxo direto de
  // "Virou oportunidade") — mesmo padrão de banner autodesaparecendo já
  // usado nas mensagens de importação, só com o tom de sucesso.
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)

  const {
    tarefaConcluindo,
    tarefaEncadeando,
    salvando: salvandoConclusao,
    erro: erroConclusao,
    abrirConcluir,
    fecharConcluir,
    fecharEncadear,
    prepararDadosOportunidade,
    confirmarVirouOportunidade,
    confirmarAgendar,
    confirmarSemInteresse,
  } = useConclusaoTarefa({
    supabase,
    userId: user?.id,
    empresaId: empresaAtiva?.id,
    onTarefaAtualizada: (atualizada) =>
      setTarefas((atual) => atual.map((t) => (t.id === atualizada.id ? atualizada : t))),
    // Tudo já fica visível na mesma tela — só precisa abrir o modal de
    // detalhe, sem nenhuma troca de aba/navegação.
    onAbrirOportunidade: (id) => setOportunidadeAbertaId(id),
    onOportunidadeCriada: () => setMensagemSucesso('Oportunidade criada com sucesso.'),
  })

  useEffect(() => {
    if (!mensagemSucesso) return
    const timeout = setTimeout(() => setMensagemSucesso(null), 4000)
    return () => clearTimeout(timeout)
  }, [mensagemSucesso])

  // --- Tarefas: carregamento, perfis, labels de cliente, Realtime ---

  useEffect(() => {
    if (!empresaAtiva) return
    let ativo = true
    setLoadingTarefas(true)

    supabase
      .from('tarefas')
      .select('*')
      .eq('empresa_id', empresaAtiva.id)
      .eq('excluida', false)
      .order('data_prevista', { ascending: true })
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) console.error('Erro ao carregar tarefas:', error.message)
        setTarefas(data ?? [])
        setLoadingTarefas(false)
      })

    return () => {
      ativo = false
    }
  }, [supabase, empresaAtiva])

  useEffect(() => {
    let ativo = true
    supabase
      .from('profiles')
      .select('id, nome')
      .then(({ data }) => {
        if (!ativo || !data) return
        setProfilesPorId(Object.fromEntries(data.map((p) => [p.id, p.nome])))
        setNomesPorId(Object.fromEntries(data.map((p) => [p.id, p.nome])))
      })
    return () => {
      ativo = false
    }
  }, [supabase])

  // Resolve nome do cliente por tarefa via oportunidade_id/pedido_id — só
  // busca os ids que ainda não estão nos mapas locais.
  useEffect(() => {
    let ativo = true

    const idsOportunidade = Array.from(
      new Set(tarefas.map((t) => t.oportunidade_id).filter((id): id is string => id !== null)),
    ).filter((id) => !(id in oportunidadesPorId))
    const idsPedido = Array.from(
      new Set(tarefas.map((t) => t.pedido_id).filter((id): id is string => id !== null)),
    ).filter((id) => !(id in pedidosPorId))

    async function carregar() {
      if (idsOportunidade.length > 0) {
        const { data } = await supabase
          .from('oportunidades')
          .select('id, numero, cliente_nome')
          .in('id', idsOportunidade)
        if (ativo && data) {
          setOportunidadesPorId((atual) => ({
            ...atual,
            ...Object.fromEntries(data.map((o) => [o.id, { numero: o.numero, cliente_nome: o.cliente_nome }])),
          }))
        }
      }
      if (idsPedido.length > 0) {
        const { data } = await supabase.from('pedidos').select('id, numero, cliente_nome').in('id', idsPedido)
        if (ativo && data) {
          setPedidosPorId((atual) => ({
            ...atual,
            ...Object.fromEntries(data.map((p) => [p.id, { numero: p.numero, cliente_nome: p.cliente_nome }])),
          }))
        }
      }
    }

    if (idsOportunidade.length > 0 || idsPedido.length > 0) carregar()

    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, tarefas])

  useEffect(() => {
    if (!empresaAtiva) return
    const empresaId = empresaAtiva.id

    const channel = supabase
      .channel(`tarefas-kanban-${empresaId}`)
      .on<Tarefa>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tarefas' },
        (payload) => {
          const nova = payload.new
          if (nova.empresa_id !== empresaId) return
          setTarefas((atual) => (atual.some((t) => t.id === nova.id) ? atual : [...atual, nova]))
        },
      )
      .on<Tarefa>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tarefas' },
        (payload) => {
          const atualizada = payload.new
          if (atualizada.empresa_id !== empresaId) return
          if (atualizada.excluida) {
            setTarefas((atual) => atual.filter((t) => t.id !== atualizada.id))
            return
          }
          setTarefas((atual) => {
            const existe = atual.some((t) => t.id === atualizada.id)
            if (!existe) return [...atual, atualizada]
            return atual.map((t) => (t.id === atualizada.id ? atualizada : t))
          })
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Erro na subscription Realtime de tarefas:', status, err)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, empresaAtiva])

  const tarefasVisiveis = useMemo(
    () => (minhaFila ? tarefas.filter((t) => t.responsavel === user?.id) : tarefas),
    [tarefas, minhaFila, user],
  )

  const clienteLabelPorTarefa = useMemo(() => {
    const mapa: Record<string, string | null> = {}
    for (const tarefa of tarefasVisiveis) {
      if (tarefa.oportunidade_id) {
        const op = oportunidadesPorId[tarefa.oportunidade_id]
        mapa[tarefa.id] = op ? `${op.cliente_nome} · Oportunidade #${op.numero}` : null
      } else if (tarefa.pedido_id) {
        const pedido = pedidosPorId[tarefa.pedido_id]
        mapa[tarefa.id] = pedido ? `${pedido.cliente_nome} · Pedido #${pedido.numero}` : null
      } else {
        // Tarefa solta (sem vínculo) — usa os campos de contato próprios da
        // tarefa (migration 0022), que até aqui ficavam preenchidos no banco
        // sem aparecer em lugar nenhum da interface.
        mapa[tarefa.id] = contatoDaTarefa(tarefa).cliente
      }
    }
    return mapa
  }, [tarefasVisiveis, oportunidadesPorId, pedidosPorId])

  // Filtro de data (mesmo componente/UX de /arquivados e /busca) — aplicado
  // sobre data_prevista nas tarefas e sobre criado_em nas oportunidades
  // (Oportunidades não tem "prazo" nesse quadro, então não há um campo de
  // data equivalente a data_prevista pra ela; criado_em é o mesmo campo já
  // usado como padrão de filtro de data no resto do app). Comparação por
  // string 'YYYY-MM-DD' (sem passar por Date), mesmo cuidado de fuso horário
  // já documentado em classificarPrazo/formatarDataSomente.
  function dentroDoFiltroData(dataIso: string | null): boolean {
    if (modoData === 'nenhum') return true
    if (!dataIso) return false
    const data = dataIso.slice(0, 10)
    if (modoData === 'especifica') return !dataEspecifica || data === dataEspecifica
    if (dataDe && data < dataDe) return false
    if (dataAte && data > dataAte) return false
    return true
  }

  function alternarColuna(coluna: ColunaFiltro) {
    setColunasVisiveis((atual) => {
      const novo = new Set(atual)
      if (novo.has(coluna)) novo.delete(coluna)
      else novo.add(coluna)
      return novo
    })
  }

  // Busca só pelo nome do cliente/lead já resolvido (clienteLabelPorTarefa
  // pras tarefas, cliente_nome direto pras oportunidades) — não entra na
  // descrição da tarefa.
  const tarefasFiltradas = useMemo(() => {
    const termo = buscaCliente.trim().toLowerCase()
    return tarefasVisiveis.filter((tarefa) => {
      if (!colunasVisiveis.has(classificarPrazo(tarefa))) return false
      if (termo && !(clienteLabelPorTarefa[tarefa.id] ?? '').toLowerCase().includes(termo)) return false
      if (!dentroDoFiltroData(tarefa.data_prevista)) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefasVisiveis, colunasVisiveis, buscaCliente, clienteLabelPorTarefa, modoData, dataEspecifica, dataDe, dataAte])

  const oportunidadesFiltradas = useMemo(() => {
    if (!colunasVisiveis.has('OPORTUNIDADES')) return []
    const termo = buscaCliente.trim().toLowerCase()
    return oportunidades.filter((oportunidade) => {
      if (termo && !oportunidade.cliente_nome.toLowerCase().includes(termo)) return false
      if (!dentroDoFiltroData(oportunidade.criado_em)) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidades, colunasVisiveis, buscaCliente, modoData, dataEspecifica, dataDe, dataAte])

  async function alterarSituacao(tarefa: Tarefa, novaSituacao: string) {
    const atualizada = { ...tarefa, situacao: novaSituacao }
    setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? atualizada : t)))

    const { error } = await supabase.from('tarefas').update({ situacao: novaSituacao }).eq('id', tarefa.id)

    if (error) {
      setTarefas((atual) => atual.map((t) => (t.id === tarefa.id ? tarefa : t)))
      return
    }

    sincronizarTarefaComOmie(tarefa.id)
  }

  async function excluirTarefa(tarefa: Tarefa) {
    if (!window.confirm(`Excluir a tarefa "${tarefa.descricao}"? Ela sai do quadro mas não é apagada do banco.`)) {
      return
    }
    setTarefas((atual) => atual.filter((t) => t.id !== tarefa.id))

    const { error } = await supabase
      .from('tarefas')
      .update({ excluida: true, excluida_em: new Date().toISOString(), excluida_por: user?.id ?? null })
      .eq('id', tarefa.id)

    if (error) setTarefas((atual) => [...atual, tarefa])
  }

  // --- Oportunidades: carregamento, Realtime ---

  useEffect(() => {
    if (!empresaAtiva) return
    let ativo = true
    setLoadingOportunidades(true)

    async function carregar() {
      const { data, error } = await supabase
        .from('oportunidades')
        .select('*')
        .eq('empresa_id', empresaAtiva!.id)
        .not('status', 'in', '(GANHO,PERDIDO)')
        .order('criado_em', { ascending: true })

      if (!ativo) return
      if (error) {
        console.error('Erro ao carregar oportunidades:', error.message)
      } else {
        setOportunidades(data ?? [])
      }
      setLoadingOportunidades(false)
    }

    carregar()

    return () => {
      ativo = false
    }
  }, [supabase, empresaAtiva])

  useEffect(() => {
    if (!empresaAtiva) return
    const empresaId = empresaAtiva.id

    const channel = supabase
      .channel(`oportunidades-kanban-${empresaId}`)
      .on<Oportunidade>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'oportunidades' },
        (payload) => {
          const nova = payload.new
          if (nova.empresa_id !== empresaId) return
          if (nova.status === 'GANHO' || nova.status === 'PERDIDO') return
          setOportunidades((atual) => {
            if (atual.some((o) => o.id === nova.id)) return atual
            return [...atual, nova]
          })
        },
      )
      .on<Oportunidade>(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'oportunidades' },
        (payload) => {
          const atualizada = payload.new
          if (atualizada.empresa_id !== empresaId) return
          setOportunidades((atual) => {
            if (atualizada.status === 'GANHO' || atualizada.status === 'PERDIDO') {
              return atual.filter((o) => o.id !== atualizada.id)
            }
            const existe = atual.some((o) => o.id === atualizada.id)
            if (!existe) return [...atual, atualizada]
            return atual.map((o) => (o.id === atualizada.id ? atualizada : o))
          })
        },
      )
      .on<Oportunidade>(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'oportunidades' },
        (payload) => {
          const removida = payload.old
          setOportunidades((atual) => atual.filter((o) => o.id !== removida.id))
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Erro na subscription Realtime de oportunidades:', status, err)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, empresaAtiva])

  if (loadingTarefas || loadingOportunidades) {
    return <div className="flex flex-1 items-center justify-center text-muted">Carregando…</div>
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4">
        <button
          onClick={() => setMinhaFila((atual) => !atual)}
          aria-pressed={minhaFila}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            minhaFila
              ? 'bg-accent-primary text-white'
              : 'bg-white/5 text-muted hover:bg-white/10 hover:text-primary'
          }`}
        >
          {minhaFila ? '✓ Minha fila' : 'Minha fila'}
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCadastroRelampagoAberto(true)}
            className="rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-primary/80 transition-colors hover:bg-white/5"
          >
            Cadastro rápido
          </button>
          <button
            onClick={() => setNovoLeadAberto(true)}
            className="rounded-md border border-white/15 px-4 py-2 text-sm font-medium text-primary/80 transition-colors hover:bg-white/5"
          >
            + Novo Lead
          </button>
          <button
            onClick={() => setNovaTarefaAberta(true)}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark"
          >
            + Nova Tarefa
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 px-6 pt-3">
        <div>
          <label className="block text-xs text-muted">Buscar cliente/lead</label>
          <input
            type="text"
            value={buscaCliente}
            onChange={(e) => setBuscaCliente(e.target.value)}
            placeholder="Nome do cliente ou lead..."
            className="input-field mt-1 w-56 rounded-md px-3 py-1.5 text-sm"
          />
        </div>

        <FiltroData
          modo={modoData}
          onModoChange={setModoData}
          dataEspecifica={dataEspecifica}
          onDataEspecificaChange={setDataEspecifica}
          dataDe={dataDe}
          onDataDeChange={setDataDe}
          dataAte={dataAte}
          onDataAteChange={setDataAte}
        />

        <div>
          <label className="block text-xs text-muted">Colunas</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setColunasVisiveis(new Set(COLUNAS_FILTRO))}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-primary/80 transition-colors hover:bg-white/10"
            >
              Todas
            </button>
            {COLUNAS_FILTRO.map((coluna) => (
              <button
                key={coluna}
                type="button"
                onClick={() => alternarColuna(coluna)}
                aria-pressed={colunasVisiveis.has(coluna)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  colunasVisiveis.has(coluna)
                    ? 'bg-accent-primary text-white'
                    : 'bg-white/5 text-muted hover:bg-white/10 hover:text-primary'
                }`}
              >
                {COLUNA_FILTRO_LABELS[coluna]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mensagemSucesso && (
        <div className="mx-6 mt-4 rounded-md border border-accent-success/40 bg-accent-success/10 px-4 py-2 text-sm text-accent-success">
          {mensagemSucesso}
        </div>
      )}

      <div className="flex flex-1 gap-4 overflow-x-auto p-6">
        {PRAZO_COLUNAS.filter((bucket) => colunasVisiveis.has(bucket)).map((bucket) => (
          <TarefaColuna
            key={bucket}
            bucket={bucket}
            tarefas={tarefasFiltradas.filter((t) => classificarPrazo(t) === bucket)}
            clienteLabelPorTarefa={clienteLabelPorTarefa}
            responsavelPorId={profilesPorId}
            onConcluir={abrirConcluir}
            onIniciar={(t) => alterarSituacao(t, 'Em Execução')}
            onCancelar={(t) => alterarSituacao(t, 'Cancelada')}
            onReabrir={(t) => alterarSituacao(t, 'Pendente')}
            onExcluir={excluirTarefa}
          />
        ))}

        {colunasVisiveis.has('OPORTUNIDADES') && (
          <OportunidadeColumn
            titulo="Oportunidades"
            corVar="--accent-primary"
            oportunidades={oportunidadesFiltradas}
            onAbrir={setOportunidadeAbertaId}
            nomesPorId={nomesPorId}
          />
        )}
      </div>

      <EncadearTarefaModal
        tarefaConcluida={tarefaEncadeando}
        onClose={fecharEncadear}
        onCriada={(nova) => setTarefas((atual) => [...atual, nova])}
      />

      {novaTarefaAberta && (
        <TarefaModal
          empresaId={empresaAtiva?.id ?? null}
          onClose={() => setNovaTarefaAberta(false)}
          onCriada={(nova) => setTarefas((atual) => (atual.some((t) => t.id === nova.id) ? atual : [...atual, nova]))}
        />
      )}

      <ConcluirTarefaModal
        tarefa={tarefaConcluindo}
        onClose={fecharConcluir}
        onPrepararOportunidade={prepararDadosOportunidade}
        onVirouOportunidade={confirmarVirouOportunidade}
        onAgendarNovoContato={confirmarAgendar}
        onSemInteresse={confirmarSemInteresse}
        salvando={salvandoConclusao}
        erro={erroConclusao}
      />

      <NovaOportunidadeModal open={novoLeadAberto} onClose={() => setNovoLeadAberto(false)} />

      <CadastroRelampagoModal
        open={cadastroRelampagoAberto}
        onClose={() => setCadastroRelampagoAberto(false)}
      />

      <OportunidadeDetalheModal
        oportunidadeId={oportunidadeAbertaId}
        onClose={() => setOportunidadeAbertaId(null)}
        setor={setor}
      />
    </div>
  )
}
