'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { BancoPrecos } from '@/components/banco-precos/BancoPrecos'
import { podeAcessarBancoPrecos } from '@/lib/banco-precos/permissions'

export default function BancoPrecosPage() {
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
      {profile && podeAcessarBancoPrecos(profile.setor) ? (
        <BancoPrecos />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          Este módulo é exclusivo dos perfis Compras e Gestor.
        </div>
      )}
    </div>
  )
}
