'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

// Fase 40.1 — select de tipo de tarefa que carrega de `tipos_tarefa` e deixa
// criar um tipo novo na hora (botão "+"). `tarefas.tipo` continua guardando o
// NOME (text), não um FK — se o valor atual não está na lista (ex: código de
// atividade importado do Omie, fase 39.3), ele ainda aparece como opção.
export function TipoTarefaSelect({
  value,
  onChange,
  disabled,
  selectClassName = 'input-field w-full rounded-md px-2 py-1.5 text-sm',
}: {
  value: string
  onChange: (valor: string) => void
  disabled?: boolean
  selectClassName?: string
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [tipos, setTipos] = useState<string[]>([])
  const [adicionando, setAdicionando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let ativo = true
    supabase
      .from('tipos_tarefa')
      .select('nome')
      .order('nome')
      .then(({ data }) => {
        if (ativo && data) setTipos(data.map((t) => t.nome))
      })
    return () => {
      ativo = false
    }
  }, [supabase])

  const opcoes = value && !tipos.includes(value) ? [value, ...tipos] : tipos

  async function criarTipo() {
    const nome = novoNome.trim()
    if (!nome) return
    setSalvando(true)

    if (!tipos.some((t) => t.toLowerCase() === nome.toLowerCase())) {
      // Ignora violação de unique (corrida entre abas) — o refresh abaixo
      // resolve. criado_por pode ser null se o contexto de auth ainda não
      // carregou.
      await supabase.from('tipos_tarefa').insert({ nome, criado_por: user?.id ?? null })
    }

    setTipos((atual) =>
      atual.some((t) => t.toLowerCase() === nome.toLowerCase()) ? atual : [...atual, nome].sort(),
    )
    onChange(nome)
    setNovoNome('')
    setAdicionando(false)
    setSalvando(false)
  }

  if (adicionando) {
    return (
      <div className="mt-1 flex gap-1">
        <input
          type="text"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              criarTipo()
            }
            if (e.key === 'Escape') setAdicionando(false)
          }}
          placeholder="Novo tipo"
          autoFocus
          disabled={salvando}
          className="input-field w-full rounded-md px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={criarTipo}
          disabled={salvando || !novoNome.trim()}
          title="Salvar tipo"
          className="shrink-0 rounded-md border border-accent-success/40 bg-accent-success/10 px-2 text-sm text-accent-success hover:bg-accent-success/20 disabled:opacity-50"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => setAdicionando(false)}
          disabled={salvando}
          title="Cancelar"
          className="shrink-0 rounded-md border border-white/15 px-2 text-sm text-muted hover:bg-white/10"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="mt-1 flex gap-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={selectClassName}
      >
        <option value="">—</option>
        {opcoes.map((opcao) => (
          <option key={opcao} value={opcao}>
            {opcao}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setAdicionando(true)}
        disabled={disabled}
        title="Novo tipo"
        className="shrink-0 rounded-md border border-white/15 px-2 text-sm text-muted hover:bg-white/10 disabled:opacity-50"
      >
        +
      </button>
    </div>
  )
}
