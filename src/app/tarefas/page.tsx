'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { TarefasBoard } from '@/components/tarefas/TarefasBoard'
import { OportunidadesBoard } from '@/components/oportunidades/OportunidadesBoard'
import { podeAcessarTarefas } from '@/lib/tarefas/permissions'

type Aba = 'tarefas' | 'oportunidades'

export default function TarefasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-base text-muted">
          Carregando…
        </div>
      }
    >
      <TarefasPageConteudo />
    </Suspense>
  )
}

function TarefasPageConteudo() {
  const { profile, loading } = useAuth()
  const searchParams = useSearchParams()
  const [aba, setAba] = useState<Aba>(searchParams.get('aba') === 'oportunidades' ? 'oportunidades' : 'tarefas')

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base text-muted">
        Carregando…
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <AppHeader />
      {profile && podeAcessarTarefas(profile.setor) ? (
        <div className="flex flex-1 flex-col">
          <div className="flex gap-5 border-b border-white/10 px-6">
            <button
              onClick={() => setAba('tarefas')}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                aba === 'tarefas'
                  ? 'border-accent-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary/80'
              }`}
            >
              Tarefas
            </button>
            <button
              onClick={() => setAba('oportunidades')}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                aba === 'oportunidades'
                  ? 'border-accent-primary text-primary'
                  : 'border-transparent text-muted hover:text-primary/80'
              }`}
            >
              Oportunidades
            </button>
          </div>

          {aba === 'tarefas' ? (
            <TarefasBoard setor={profile.setor} onAbrirEmOportunidades={() => setAba('oportunidades')} />
          ) : (
            <OportunidadesBoard setor={profile.setor} />
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          Este módulo é exclusivo dos perfis Comercial e Gestor.
        </div>
      )}
    </div>
  )
}
