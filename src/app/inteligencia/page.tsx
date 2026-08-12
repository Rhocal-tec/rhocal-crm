'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { InteligenciaComercial } from '@/components/inteligencia/InteligenciaComercial'

// Fase 35: mesma regra de acesso do Painel executivo (fase 14) — exclusiva
// do gestor, qualquer outro perfil volta pro Kanban.
export default function InteligenciaPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  const ehGestor = profile?.setor === 'gestor'

  useEffect(() => {
    if (!loading && profile && !ehGestor) {
      router.replace('/dashboard')
    }
  }, [loading, profile, ehGestor, router])

  if (loading || !profile || !ehGestor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base text-muted">
        Carregando…
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <AppHeader />
      <InteligenciaComercial />
    </div>
  )
}
