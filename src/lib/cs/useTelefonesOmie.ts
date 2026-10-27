'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const LOTE = 60
const MAX_CODIGOS = 180
const INTERVALO_MS = 3 * 60_000

// Telefones que o vendedor cadastrou no Omie para clientes que ainda estão
// sem telefone no CRM. Só leitura (rota /api/omie/telefones-clientes): reconsulta
// ao voltar para a aba e a cada 3 minutos, então o número aparece sozinho.
export function useTelefonesOmie(codigos: number[], empresaSlug: string | null) {
  const [telefones, setTelefones] = useState<Record<string, string>>({})
  const chave = Array.from(new Set(codigos)).sort((a, b) => a - b).slice(0, MAX_CODIGOS).join(',')
  const chaveRef = useRef(chave)
  chaveRef.current = chave

  const consultar = useCallback(async () => {
    if (!empresaSlug || !chaveRef.current) return
    const lista = chaveRef.current.split(',').map(Number)
    const achados: Record<string, string> = {}
    for (let i = 0; i < lista.length; i += LOTE) {
      try {
        const r = await fetch('/api/omie/telefones-clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empresaSlug, codigos: lista.slice(i, i + LOTE) }),
        })
        if (!r.ok) continue
        const json = (await r.json()) as { telefones?: Record<string, string> }
        Object.assign(achados, json.telefones ?? {})
      } catch {
        // Omie fora do ar: mantém o que já tinha.
      }
    }
    setTelefones((atual) => ({ ...atual, ...achados }))
  }, [empresaSlug])

  useEffect(() => {
    void consultar()
    const timer = setInterval(() => void consultar(), INTERVALO_MS)
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void consultar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [consultar, chave])

  return telefones
}
