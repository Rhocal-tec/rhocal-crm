'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import type { SetorTipo } from '@/types/database'

const SETOR_LABEL: Record<SetorTipo, string> = {
  compras: 'Compras',
  comercial: 'Comercial',
  gestor: 'Gestor',
}

// Cor sutil de identificação por perfil: comercial em tom neutro, compras em
// accent-compras, gestor em accent-primary.
const SETOR_BADGE_CLASSES: Record<SetorTipo, string> = {
  comercial: 'bg-white/10 text-primary/80',
  compras: 'bg-accent-compras/15 text-accent-compras',
  gestor: 'bg-accent-primary/15 text-accent-primary',
}

const LINKS = [
  { href: '/dashboard', label: 'Kanban' },
  { href: '/busca', label: 'Busca' },
  { href: '/arquivados', label: 'Arquivados' },
]

const LINK_GESTOR = { href: '/painel', label: 'Painel' }

export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile, signOut } = useAuth()

  async function handleLogout() {
    await signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-y-3 border-b border-white/10 bg-surface px-6 py-4">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2.5">
          <Image
            src="/rhocal-logo.png"
            alt="RHOCAL"
            width={28}
            height={28}
            className="rounded-md"
          />
          <span className="font-heading text-lg font-semibold tracking-wide text-primary">
            RHOCAL CRM
          </span>
          {profile && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${SETOR_BADGE_CLASSES[profile.setor]}`}
            >
              {profile.setor}
            </span>
          )}
        </div>
        <nav className="flex items-center gap-4">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium ${
                pathname === link.href ? 'text-primary' : 'text-muted hover:text-primary/80'
              }`}
            >
              {link.label}
            </Link>
          ))}
          {profile?.setor === 'gestor' && (
            <Link
              href={LINK_GESTOR.href}
              className={`text-sm font-medium ${
                pathname === LINK_GESTOR.href ? 'text-primary' : 'text-muted hover:text-primary/80'
              }`}
            >
              {LINK_GESTOR.label}
            </Link>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-primary/70">
          {profile?.nome ?? user?.email}{' '}
          <span className="text-muted">({profile ? SETOR_LABEL[profile.setor] : '—'})</span>
        </span>
        <Link
          href="/configuracoes"
          aria-label="Configurações"
          title="Configurações"
          className={`rounded-md p-2 text-lg leading-none transition-colors hover:bg-white/5 ${
            pathname === '/configuracoes' ? 'bg-white/5' : ''
          }`}
        >
          <span aria-hidden="true">⚙️</span>
        </Link>
        <button
          onClick={handleLogout}
          className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-primary/80 transition-colors hover:bg-white/5"
        >
          Sair
        </button>
      </div>
    </header>
  )
}
