'use client'

import { useState } from 'react'
import { chaveTelefone, linkAbrirNoWhatsapp } from '@/lib/bridge/telefone'

// Abre a conversa no CRM WhatsApp (nova aba). Com mais de um telefone
// distinto (comparação por DDD+8 dígitos), deixa escolher qual.
export function AbrirNoWhatsappButton({
  telefones,
  className = '',
}: {
  telefones: Array<string | null | undefined>
  className?: string
}) {
  const [aberto, setAberto] = useState(false)

  const vistos = new Set<string>()
  const lista: string[] = []
  for (const t of telefones) {
    const chave = chaveTelefone(t)
    if (!t || !chave || vistos.has(chave)) continue
    vistos.add(chave)
    lista.push(t)
  }
  if (lista.length === 0) return null

  const estilo =
    'rounded-md border border-accent-success/40 px-3 py-1.5 text-xs font-medium text-accent-success transition-colors hover:bg-accent-success/10'

  if (lista.length === 1) {
    return (
      <a
        href={linkAbrirNoWhatsapp(lista[0]) ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`${estilo} inline-block text-center ${className}`}
      >
        Abrir no WhatsApp
      </a>
    )
  }

  return (
    <div className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setAberto((v) => !v)} className={`${estilo} w-full`}>
        Abrir no WhatsApp ▾
      </button>
      {aberto && (
        <div className="absolute left-0 z-20 mt-1 min-w-full rounded-md border border-white/10 bg-surface-alt py-1 shadow-lg">
          {lista.map((t) => (
            <a
              key={t}
              href={linkAbrirNoWhatsapp(t) ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAberto(false)}
              className="block whitespace-nowrap px-3 py-1.5 font-mono text-xs text-primary/90 hover:bg-white/10"
            >
              {t}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
