'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Oportunidades virou uma aba dentro de /tarefas (Parte 3 do fluxo
// Tarefas → Oportunidades). Mantém esta rota funcionando pra links/
// favoritos salvos, só redirecionando pra lá.
export default function OportunidadesPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/tarefas?aba=oportunidades')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-base text-muted">
      Redirecionando…
    </div>
  )
}
