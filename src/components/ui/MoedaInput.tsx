'use client'

import { useState, type CSSProperties } from 'react'
import { formatarMoeda } from '@/lib/kanban/formatacao'

// Input de valor monetário: enquanto focado mostra o número puro e editável;
// ao perder o foco, mostra formatado como moeda brasileira (R$ 0.000,00).
// Mesmo padrão usado em custo final e preço de venda — reaproveitado também
// no frete (fase 22.1).
export function MoedaInput({
  value,
  onChange,
  onBlurSalvar,
  placeholder = 'R$ —',
  className = 'input-field w-32 rounded-md px-2 py-1 font-mono text-sm',
  disabled,
  style,
}: {
  value: string
  onChange: (valor: string) => void
  onBlurSalvar: (valor: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  // Estilo inline opcional — usado para tingir a borda/fundo do campo
  // dinamicamente (ex: indicador de margem, fase 27), sem depender de classes
  // Tailwind fixas.
  style?: CSSProperties
}) {
  const [editando, setEditando] = useState(false)

  return (
    <input
      type={editando ? 'number' : 'text'}
      step="any"
      min="0"
      value={editando ? value : value ? formatarMoeda(Number(value)) : ''}
      onFocus={() => setEditando(true)}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        onBlurSalvar(e.target.value)
        setEditando(false)
      }}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      style={style}
    />
  )
}
