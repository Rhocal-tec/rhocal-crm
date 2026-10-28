'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { chaveItemOmie, type ClienteOmieCompleto, type ItemSincronizarOmie } from '@/lib/omie/cliente-completo'

const LOTE = 10
const MAX_POR_RODADA = 60
const VERIFICAR_A_CADA_MS = 5 * 60_000
// Cliente já consultado só é consultado de novo depois disso (evita bater no limite de chamadas do Omie).
const NOVA_CONSULTA_MS = 30 * 60_000

// Busca no Omie os dados completos dos clientes que estão com cadastro incompleto
// (telefone, contato, e-mail…) e GRAVA no cadastro do CRM (só preenche o que está
// vazio). Depois de gravar, chama aoGravar() para a tela recarregar do banco — a
// partir daí o dado fica fixo, não depende mais de nova consulta ao Omie.
// dadosOmie mantém o que já foi encontrado, para a tela mostrar na hora.
export function useSincronizarOmie(
  candidatos: ItemSincronizarOmie[],
  empresaSlug: string | null,
  aoGravar: () => void,
) {
  const [dadosOmie, setDadosOmie] = useState<Record<string, ClienteOmieCompleto>>({})
  const [sincronizando, setSincronizando] = useState(false)
  const consultados = useRef(new Map<string, number>())
  const rodando = useRef(false)
  const candidatosRef = useRef(candidatos)
  candidatosRef.current = candidatos
  const aoGravarRef = useRef(aoGravar)
  aoGravarRef.current = aoGravar
  const chave = candidatos.map(chaveItemOmie).sort().join(',')

  const rodar = useCallback(async () => {
    if (!empresaSlug || rodando.current) return
    const agora = Date.now()
    const pendentes = candidatosRef.current
      .filter((c) => {
        const t = consultados.current.get(chaveItemOmie(c))
        return t === undefined || agora - t > NOVA_CONSULTA_MS
      })
      .slice(0, MAX_POR_RODADA)
    if (pendentes.length === 0) return

    rodando.current = true
    setSincronizando(true)
    let gravou = false
    try {
      for (let i = 0; i < pendentes.length; i += LOTE) {
        const lote = pendentes.slice(i, i + LOTE)
        lote.forEach((c) => consultados.current.set(chaveItemOmie(c), Date.now()))
        try {
          const r = await fetch('/api/omie/cliente-completo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empresaSlug, itens: lote }),
          })
          if (!r.ok) continue
          const json = (await r.json()) as {
            resultados?: Record<string, { dados: ClienteOmieCompleto | null; erro: string | null }>
            persistidos?: number
          }
          const novos: Record<string, ClienteOmieCompleto> = {}
          for (const [k, v] of Object.entries(json.resultados ?? {})) if (v.dados) novos[k] = v.dados
          setDadosOmie((atual) => ({ ...atual, ...novos }))
          if ((json.persistidos ?? 0) > 0) gravou = true
        } catch {
          // Falha de rede/Omie: tenta de novo na próxima verificação.
        }
      }
    } finally {
      rodando.current = false
      setSincronizando(false)
    }
    if (gravou) aoGravarRef.current()
  }, [empresaSlug])

  useEffect(() => {
    void rodar()
    const timer = setInterval(() => void rodar(), VERIFICAR_A_CADA_MS)
    return () => clearInterval(timer)
  }, [rodar, chave])

  return { dadosOmie, sincronizando }
}
