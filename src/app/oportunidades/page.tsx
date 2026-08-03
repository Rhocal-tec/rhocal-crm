'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { OportunidadesBoard } from '@/components/oportunidades/OportunidadesBoard'
import { podeAcessarOportunidades } from '@/lib/oportunidades/permissions'

export default function OportunidadesPage() {
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
      {profile && podeAcessarOportunidades(profile.setor) ? (
        <OportunidadesBoard setor={profile.setor} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          Este módulo é exclusivo dos perfis Comercial e Gestor.
        </div>
      )}
    </div>
  )
}
