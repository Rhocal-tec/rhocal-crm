'use client'

// Botão "Ligar" — dispara uma chamada via Mobcall pro número informado, já
// vinculando à oportunidade. Usa o usuário logado (via AuthContext — mesmo
// client Supabase com sessão em cookie do resto do app, `@/lib/supabase/client`;
// nunca instanciar aqui um `createClient` avulso de `@supabase/supabase-js`,
// que teria sessão própria e não veria o usuário logado) pra descobrir o
// ramal de quem está ligando.
//
// Onde usar: dentro do card do kanban ou da tela de detalhes da oportunidade
// <BotaoLigar numeroDestino={oportunidade.cliente_telefone} oportunidadeId={oportunidade.id} />

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

type Estado = 'idle' | 'ligando' | 'sucesso' | 'erro'

export default function BotaoLigar({
  numeroDestino,
  oportunidadeId,
  className,
}: {
  numeroDestino: string | null
  oportunidadeId?: string
  className?: string
}) {
  const { user } = useAuth()
  const [estado, setEstado] = useState<Estado>('idle')
  const [mensagemErro, setMensagemErro] = useState('')

  async function ligar() {
    if (!numeroDestino) {
      setEstado('erro')
      setMensagemErro('Esse cliente não tem telefone cadastrado.')
      return
    }

    if (!user) {
      setEstado('erro')
      setMensagemErro('Você precisa estar logado pra ligar.')
      return
    }

    setEstado('ligando')
    setMensagemErro('')

    try {
      const resposta = await fetch('/api/mobcall/click-to-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero_destino: numeroDestino,
          usuario_id: user.id,
          oportunidade_id: oportunidadeId ?? null,
        }),
      })

      const resultado = await resposta.json()

      if (!resposta.ok) {
        setEstado('erro')
        setMensagemErro(resultado.error ?? 'Falha ao iniciar a ligação.')
        return
      }

      setEstado('sucesso')
      setTimeout(() => setEstado('idle'), 3000)
    } catch (e) {
      setEstado('erro')
      setMensagemErro(e instanceof Error ? e.message : 'Erro inesperado ao ligar.')
    }
  }

  const rotulo =
    estado === 'ligando' ? 'Ligando...' : estado === 'sucesso' ? 'Ligação iniciada ✓' : '📞 Ligar'

  return (
    <div className="inline-flex flex-col">
      <button
        type="button"
        onClick={ligar}
        disabled={estado === 'ligando'}
        className={
          className ??
          'inline-flex items-center gap-1.5 rounded-md bg-accent-success px-3 py-1.5 text-xs font-medium text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'
        }
      >
        {rotulo}
      </button>
      {estado === 'erro' && (
        <span className="mt-1 max-w-xs text-xs text-accent-danger">{mensagemErro}</span>
      )}
    </div>
  )
}
