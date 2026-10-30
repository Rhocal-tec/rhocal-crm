'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { GerenciarNewsroom } from '@/components/newsroom/GerenciarNewsroom'
import { podeGerenciarNewsroom } from '@/lib/newsroom/regras'

export default function NewsroomGerenciarRota() {
  const { profile, loading } = useAuth()
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-base text-muted">Carregando…</div>
  }
  return (
    <div className="flex min-h-screen flex-col bg-base">
      <AppHeader />
      {profile && podeGerenciarNewsroom(profile.setor) ? (
        <GerenciarNewsroom />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          Somente o gestor pode gerenciar o Newsroom.
        </div>
      )}
    </div>
  )
}
