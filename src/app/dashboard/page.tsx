'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'

export default function DashboardPage() {
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
      {profile && <KanbanBoard setor={profile.setor} />}
    </div>
  )
}
