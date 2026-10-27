'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { CSModulo } from '@/components/cs/CSModulo'
import { podeAcessarCS } from '@/lib/cs/permissions'

export default function CSPage() {
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
      {profile && podeAcessarCS(profile.setor) ? (
        <CSModulo setor={profile.setor} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          Não foi possível carregar seu perfil.
        </div>
      )}
    </div>
  )
}
