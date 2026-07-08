'use client'

import { useEffect, type ReactNode } from 'react'

export function Modal({
  open,
  onClose,
  title,
  children,
  widthClassName = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  widthClassName?: string
}) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--bg-surface)' }}
        className={`flex max-h-[90vh] w-full ${widthClassName} flex-col overflow-hidden rounded-lg bg-surface shadow-2xl ring-1 ring-white/5`}
      >
        <div
          style={{ backgroundColor: 'var(--bg-surface)' }}
          className="flex shrink-0 items-center justify-between border-b border-white/10 bg-surface px-5 py-4"
        >
          <h2 className="font-heading text-lg font-semibold tracking-wide text-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted hover:bg-white/10 hover:text-primary"
          >
            ✕
          </button>
        </div>
        <div
          style={{ backgroundColor: 'var(--bg-surface)' }}
          className="overflow-y-auto bg-surface px-5 py-4"
        >
          {children}
        </div>
      </div>
    </div>
  )
}
