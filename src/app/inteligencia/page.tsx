'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { InteligenciaComercial } from '@/components/inteligencia/InteligenciaComercial'

// Liberada também pro Comercial (além do Gestor) — Compras não participa
// dessa etapa de segmentação/campanha, mesmo critério já usado em
// Oportunidades/Tarefas.
export default function InteligenciaPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  const podeAcessar = profile?.setor === 'gestor' || profile?.setor === 'comercial'

  useEffect(() => {
    if (!loading && profile && !podeAcessar) {
      router.replace('/dashboard')
    }
  }, [loading, profile, podeAcessar, router])

  if (loading || !profile || !podeAcessar) {
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
