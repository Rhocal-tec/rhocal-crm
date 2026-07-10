'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { AppHeader } from '@/components/layout/AppHeader'
import { NovaSenhaForm } from '@/components/auth/NovaSenhaForm'
import type { SetorTipo } from '@/types/database'

const SETOR_LABEL: Record<SetorTipo, string> = {
  compras: 'Compras',
  comercial: 'Comercial',
  gestor: 'Gestor',
}

export default function ConfiguracoesPage() {
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

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-primary/80"
        >
          ← Voltar para o kanban
        </Link>

        <h1 className="mb-6 font-heading text-2xl font-semibold tracking-wide text-primary">
          Configurações
        </h1>

        <div className="space-y-6">
          <section className="rounded-lg bg-surface p-6 shadow-xl ring-1 ring-white/5">
            <h2 className="mb-4 font-heading text-lg font-semibold tracking-wide text-primary">
              Meus dados
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted">Nome</dt>
                <dd className="mt-0.5 text-primary/90">{profile?.nome ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Setor</dt>
                <dd className="mt-0.5 text-primary/90">
                  {profile ? SETOR_LABEL[profile.setor] : '—'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg bg-surface p-6 shadow-xl ring-1 ring-white/5">
            <h2 className="mb-4 font-heading text-lg font-semibold tracking-wide text-primary">
              Trocar senha
            </h2>
            <NovaSenhaForm textoBotao="Salvar nova senha" />
          </section>
        </div>
      </main>
    </div>
  )
}
