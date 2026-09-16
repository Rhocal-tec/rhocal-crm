'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Oportunidades virou parte do kanban único em /tarefas (colunas Novo Lead ..
// Proposta Enviada, lado a lado com as de Tarefas). Mantém esta rota
// funcionando pra links/favoritos salvos, só redirecionando pra lá.
export default function OportunidadesPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/tarefas')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-base text-muted">
      Redirecionando…
    </div>
  )
}
