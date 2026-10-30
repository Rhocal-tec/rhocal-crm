'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { NewsroomPagina } from '@/components/newsroom/NewsroomPagina'

export default function NewsroomRota() {
  const { profile, loading } = useAuth()
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-base text-muted">Carregando…</div>
  }
  return (
    <div className="flex min-h-screen flex-col bg-base">
      <AppHeader />
      {profile ? <NewsroomPagina setor={profile.setor} /> : null}
    </div>
  )
}
