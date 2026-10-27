'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CONFIG_PADRAO } from '@/lib/cs/constantes'

const ROTULOS: Record<string, string> = {
  pos_entrega_inicio: 'Pós-entrega: a partir de (dias após a entrega)',
  pos_entrega_fim: 'Pós-entrega: até (dias após a entrega)',
  percepcao_inicio: 'Percepção: a partir de (dias após a compra)',
  percepcao_fim: 'Percepção: até (dias após a compra)',
  alerta_inicio: 'Alerta de inatividade: a partir de (dias sem compra)',
  alerta_fim: 'Alerta de inatividade: até (dias sem compra)',
  recuperacao_inicio: 'Recuperação: a partir de (dias sem compra)',
  recompra_antecedencia: 'Recompra: antecedência da reposição (dias)',
  meta_dia: 'Meta de contatos por dia',
  prazo_reclamacao_horas: 'Prazo de retorno da reclamação (horas)',
  alerta_reclamacao_horas: 'Alerta antes do vencimento (horas)',
  retentativa_dias_uteis: 'Nova tentativa após (dias úteis)',
}

export function RegrasCS({
  config,
  usuarioId,
  recarregar,
}: {
  config: Record<string, number>
  usuarioId: string
  recarregar: () => void
}) {
  const [supabase] = useState(() => createClient())
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.keys(CONFIG_PADRAO).map((k) => [k, String(config[k] ?? CONFIG_PADRAO[k])])),
  )
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function salvar() {
    setMsg(null)
    setSalvando(true)
    const linhas = Object.entries(valores).map(([chave, v]) => ({
      chave,
      valor: Math.max(0, Math.round(Number(v) || 0)),
      atualizado_por: usuarioId,
      atualizado_em: new Date().toISOString(),
    }))
    const { error } = await supabase.from('cs_config').upsert(linhas, { onConflict: 'chave' })
    setSalvando(false)
    if (error) {
      setMsg(`Não foi possível salvar: ${error.message}`)
      return
    }
    setMsg('Regras salvas.')
    recarregar()
  }

  return (
    <div className="flex max-w-xl flex-col gap-3 p-6">
      <p className="text-sm text-muted">Prazos e metas do módulo CS. Só a diretoria edita.</p>
      {Object.keys(CONFIG_PADRAO).map((chave) => (
        <label key={chave} className="flex items-center justify-between gap-3 text-sm text-primary/90">
          <span>{ROTULOS[chave] ?? chave}</span>
          <input
            type="number"
            min={0}
            value={valores[chave]}
            onChange={(e) => setValores((v) => ({ ...v, [chave]: e.target.value }))}
            className="input-field w-24 rounded-md px-2 py-1 text-right text-sm"
          />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button
          onClick={salvar}
          disabled={salvando}
          className="rounded-md bg-accent-primary px-4 py-2 text-sm font-semibold text-white hover:bg-accent-primary-dark disabled:opacity-50"
        >
          {salvando ? 'Salvando…' : 'Salvar regras'}
        </button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </div>
  )
}
