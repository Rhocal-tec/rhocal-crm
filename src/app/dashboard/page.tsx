'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'

export default function DashboardPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  // Perfil CS não usa o kanban de pedidos: cai direto no módulo CS.
  useEffect(() => {
    if (profile?.setor === 'cs') router.replace('/cs')
  }, [profile, router])

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
      {profile && profile.setor !== 'cs' && <KanbanBoard setor={profile.setor} />}
    </div>
  )
}
