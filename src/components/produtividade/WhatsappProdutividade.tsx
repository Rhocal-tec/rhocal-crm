'use client'

import { useEffect, useState } from 'react'
import {
  formatarMinutos,
  tomContagem,
  tomTempoResposta,
  type IndicadoresWhatsapp,
  type RespostaWhatsappProdutividade,
  type TomAlerta,
} from '@/lib/produtividade/whatsapp'

const COR: Record<TomAlerta, string> = {
  neutro: 'text-primary',
  verde: 'text-accent-success',
  amarelo: 'text-accent-alert',
  vermelho: 'text-accent-danger',
}

// Busca os indicadores do período (mesmo intervalo da aba). Falha = indisponível.
export function useWhatsappProdutividade(de: string, ate: string) {
  const [dados, setDados] = useState<RespostaWhatsappProdutividade | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    fetch(`/api/whatsapp/produtividade?de=${de}&ate=${ate}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: RespostaWhatsappProdutividade | null) => {
        if (!ativo) return
        setDados(j && !('erro' in j) ? j : { indisponivel: true, regras: {}, porPerfil: {}, equipe: null })
      })
      .catch(() => {
        if (ativo) setDados({ indisponivel: true, regras: {}, porPerfil: {}, equipe: null })
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [de, ate])

  return { dados, carregando }
}

function Dica({ texto }: { texto?: string }) {
  if (!texto) return null
  return (
    <span
      title={texto}
      aria-label={texto}
      tabIndex={0}
      className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-white/25 text-[9px] leading-none text-muted"
    >
      i
    </span>
  )
}

function Item({
  rotulo,
  valor,
  detalhe,
  tom = 'neutro',
  dica,
}: {
  rotulo: string
  valor: string
  detalhe?: string
  tom?: TomAlerta
  dica?: string
}) {
  return (
    <div>
      <dt className="text-xs text-muted">
        {rotulo}
        <Dica texto={dica} />
      </dt>
      <dd className={`font-mono font-semibold ${COR[tom]}`}>
        {valor}
        {detalhe && <span className="ml-1 text-[11px] font-normal text-muted">{detalhe}</span>}
      </dd>
    </div>
  )
}

export function SecaoWhatsapp({
  perfilId,
  dados,
  carregando,
}: {
  perfilId: string
  dados: RespostaWhatsappProdutividade | null
  carregando: boolean
}) {
  const titulo = <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">WhatsApp</h4>

  if (carregando && !dados) {
    return (
      <>
        {titulo}
        <p className="mt-2 text-xs text-muted">Carregando…</p>
      </>
    )
  }
  if (!dados || dados.indisponivel) {
    return (
      <>
        {titulo}
        <p className="mt-2 text-xs text-muted">WhatsApp indisponível no momento</p>
      </>
    )
  }
  const i: IndicadoresWhatsapp | undefined = dados.porPerfil[perfilId]
  if (!i) {
    return (
      <>
        {titulo}
        <p className="mt-2 text-xs text-muted">Sem acesso ao CRM WhatsApp</p>
      </>
    )
  }
  const r = dados.regras
  return (
    <>
      {titulo}
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Item rotulo="Conversas atendidas" valor={String(i.conversas_atendidas)} dica={r.conversas_atendidas} />
        <Item rotulo="Mensagens enviadas" valor={String(i.mensagens_enviadas)} dica={r.mensagens_enviadas} />
        <Item rotulo="Conversas novas" valor={String(i.conversas_novas)} dica={r.conversas_novas} />
        <Item
          rotulo="1ª resposta (média)"
          valor={formatarMinutos(i.tempo_medio_primeira_resposta_min)}
          tom={tomTempoResposta(i.tempo_medio_primeira_resposta_min)}
          dica={r.tempo_medio_primeira_resposta_min}
        />
        <Item
          rotulo="Sem resposta agora"
          valor={String(i.sem_resposta_agora)}
          detalhe={i.sem_resposta_agora > 0 ? `maior espera ${formatarMinutos(i.maior_espera_min)}` : undefined}
          tom={tomContagem(i.sem_resposta_agora)}
          dica={`${r.sem_resposta_agora ?? ''}${r.maior_espera_min ? ` ${r.maior_espera_min}` : ''}`.trim() || undefined}
        />
        <Item
          rotulo="Esquecidas (+7 dias)"
          valor={String(i.esquecidas)}
          tom={tomContagem(i.esquecidas)}
          dica={r.esquecidas}
        />
        <Item rotulo="Concluídas no funil" valor={String(i.concluidas)} dica={r.concluidas} />
      </dl>
    </>
  )
}

export function ResumoWhatsappEquipe({
  dados,
  carregando,
}: {
  dados: RespostaWhatsappProdutividade | null
  carregando: boolean
}) {
  const caixa = 'mt-4 rounded-lg border border-white/10 bg-surface px-4 py-3 text-sm'
  if (carregando && !dados) return <div className={`${caixa} text-muted`}>WhatsApp da equipe: carregando…</div>
  if (!dados || dados.indisponivel || !dados.equipe) {
    return <div className={`${caixa} text-muted`}>WhatsApp indisponível no momento</div>
  }
  const e = dados.equipe
  const r = dados.regras
  return (
    <dl className={`${caixa} grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5`}>
      <div className="col-span-2 self-center text-xs font-medium uppercase tracking-wide text-muted sm:col-span-1">
        WhatsApp · equipe
      </div>
      <Item rotulo="Conversas atendidas" valor={String(e.conversas_atendidas)} dica={r.conversas_atendidas} />
      <Item
        rotulo="1ª resposta (média)"
        valor={formatarMinutos(e.tempo_medio_primeira_resposta_min)}
        tom={tomTempoResposta(e.tempo_medio_primeira_resposta_min)}
        dica={r.tempo_medio_primeira_resposta_min}
      />
      <Item
        rotulo="Sem resposta agora"
        valor={String(e.sem_resposta_agora)}
        tom={tomContagem(e.sem_resposta_agora)}
        dica={r.sem_resposta_agora}
      />
      <Item rotulo="Esquecidas" valor={String(e.esquecidas)} tom={tomContagem(e.esquecidas)} dica={r.esquecidas} />
    </dl>
  )
}
