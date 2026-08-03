'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { TarefasTab } from '@/components/tarefas/TarefasTab'
import { ConverterEmOrcamentoSection } from './ConverterEmOrcamentoSection'
import { MarcarOportunidadePerdidaSection } from './MarcarOportunidadePerdidaSection'
import type { Database, SetorTipo } from '@/types/database'

type Oportunidade = Database['public']['Tables']['oportunidades']['Row']

type Aba = 'dados' | 'tarefas'

export function OportunidadeDetalheModal({
  oportunidadeId,
  onClose,
  setor,
}: {
  oportunidadeId: string | null
  onClose: () => void
  setor: SetorTipo
}) {
  const [supabase] = useState(() => createClient())
  const [aba, setAba] = useState<Aba>('dados')
  const [oportunidade, setOportunidade] = useState<Oportunidade | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!oportunidadeId) {
      setOportunidade(null)
      setAba('dados')
      return
    }

    let ativo = true
    setCarregando(true)

    supabase
      .from('oportunidades')
      .select('*')
      .eq('id', oportunidadeId)
      .single()
      .then(({ data }) => {
        if (!ativo) return
        setOportunidade(data ?? null)
        setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [oportunidadeId, supabase])

  return (
    <Modal
      open={oportunidadeId !== null}
      onClose={onClose}
      title={oportunidade ? `Oportunidade #${oportunidade.numero}` : 'Oportunidade'}
      widthClassName="max-w-2xl"
    >
      {carregando || !oportunidade ? (
        <div className="py-8 text-center text-sm text-muted">Carregando…</div>
      ) : (
        <div>
          <div className="flex gap-5 border-b border-white/10">
            <button
              onClick={() => setAba('dados')}
              className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                aba === 'dados'
                  ? 'border-accent-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary/80'
              }`}
            >
              Dados
            </button>
            <button
              onClick={() => setAba('tarefas')}
              className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
                aba === 'tarefas'
                  ? 'border-accent-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary/80'
              }`}
            >
              Tarefas
            </button>
          </div>

          {aba === 'dados' && (
            <div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted">Cliente</dt>
                  <dd className="font-medium text-primary">{oportunidade.cliente_nome}</dd>
                </div>
                <div>
                  <dt className="text-muted">Status</dt>
                  <dd className="font-medium text-primary">
                    {OPORTUNIDADE_STATUS_LABELS[oportunidade.status]}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">CNPJ do cliente</dt>
                  <dd className="font-medium text-primary">{oportunidade.cliente_cnpj ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Telefone do cliente</dt>
                  <dd className="font-medium text-primary">
                    {oportunidade.cliente_telefone ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Contato do cliente</dt>
                  <dd className="font-medium text-primary">
                    {oportunidade.cliente_contato ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Origem</dt>
                  <dd className="font-medium text-primary">{oportunidade.origem ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Temperatura</dt>
                  <dd className="font-medium text-primary">{oportunidade.temperatura ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted">Valor estimado</dt>
                  <dd className="font-medium text-primary">
                    {formatarMoeda(oportunidade.valor_estimado)}
                  </dd>
                </div>
                {oportunidade.status === 'PERDIDO' && (
                  <div className="col-span-2">
                    <dt className="text-muted">Motivo da perda</dt>
                    <dd className="font-medium text-accent-danger">
                      {oportunidade.motivo_perda ?? '—'}
                    </dd>
                  </div>
                )}
              </dl>

              <ConverterEmOrcamentoSection
                oportunidade={oportunidade}
                onAtualizada={setOportunidade}
              />
              <MarcarOportunidadePerdidaSection
                oportunidade={oportunidade}
                setor={setor}
                onAtualizada={setOportunidade}
              />
            </div>
          )}

          {aba === 'tarefas' && <TarefasTab oportunidadeId={oportunidade.id} />}
        </div>
      )}
    </Modal>
  )
}
