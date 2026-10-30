'use client'

import Link from 'next/link'
import { useNewsroom } from '@/contexts/NewsroomContext'

export function NewsroomBell() {
  const { naoLidos } = useNewsroom()
  return (
    <Link
      href="/newsroom"
      aria-label="Newsroom"
      title={naoLidos > 0 ? `${naoLidos} aviso(s) não lido(s)` : 'Newsroom'}
      className="relative rounded-md p-2 text-lg leading-none transition-colors hover:bg-white/5"
    >
      <span aria-hidden="true">🔔</span>
      {naoLidos > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-danger px-1 text-[10px] font-bold text-white">
          {naoLidos}
        </span>
      )}
    </Link>
  )
}
