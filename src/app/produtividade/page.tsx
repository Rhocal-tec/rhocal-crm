'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { ProdutividadePainel } from '@/components/produtividade/ProdutividadePainel'
import { podeAcessarProdutividade } from '@/lib/produtividade/permissions'

export default function ProdutividadePage() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  const podeAcessar = !!profile && podeAcessarProdutividade(profile.setor)

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
      <ProdutividadePainel />
    </div>
  )
}
