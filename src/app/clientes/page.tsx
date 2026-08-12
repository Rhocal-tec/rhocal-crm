'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { ClientesList } from '@/components/clientes/ClientesList'

// Fase 34: módulo de Clientes, visível a todos os perfis (compras incluso) —
// diferente de Oportunidades/Tarefas/Painel, não há checagem de setor aqui.
export default function ClientesPage() {
  const { profile, loading } = useAuth()

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
      {profile ? (
        <ClientesList setor={profile.setor} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          Não foi possível carregar seu perfil.
        </div>
      )}
    </div>
  )
}
