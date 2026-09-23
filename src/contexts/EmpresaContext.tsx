'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database, EmpresaSlug } from '@/types/database'

type Empresa = Database['public']['Tables']['empresas']['Row']

const EMPRESA_STORAGE_KEY = 'rhocal-crm:empresa-ativa'
const EMPRESA_SLUG_PADRAO: EmpresaSlug = 'rhocal'

interface EmpresaContextValue {
  empresas: Empresa[]
  empresaAtiva: Empresa | null
  loading: boolean
  trocarEmpresa: (slug: string) => void
}

const EmpresaContext = createContext<EmpresaContextValue | undefined>(undefined)

// '#F9C304' (ou '#FC0') -> '249 195 4' — formato "R G B" das variáveis
// --*-rgb do globals.css. Retorna null se não for um hex válido.
export function hexParaCanaisRgb(hex: string): string | null {
  let valor = hex.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(valor)) {
    valor = valor
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (!/^[0-9a-f]{6}$/i.test(valor)) return null
  const r = parseInt(valor.slice(0, 2), 16)
  const g = parseInt(valor.slice(2, 4), 16)
  const b = parseInt(valor.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaSlug, setEmpresaSlug] = useState<string>(EMPRESA_SLUG_PADRAO)
  const [loading, setLoading] = useState(true)

  // Busca as empresas cadastradas assim que a aplicação carrega.
  useEffect(() => {
    let ativo = true

    supabase
      .from('empresas')
      .select('*')
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) {
          console.error('Erro ao carregar empresas:', error.message)
          setEmpresas([])
        } else {
          setEmpresas(data ?? [])
        }
        setLoading(false)
      })

    return () => {
      ativo = false
    }
  }, [supabase])

  // Lê a última empresa escolhida naquele navegador. Só roda no client, por
  // isso fica num useEffect (evita acessar localStorage durante o SSR).
  useEffect(() => {
    const salva = window.localStorage.getItem(EMPRESA_STORAGE_KEY)
    if (salva) setEmpresaSlug(salva)
  }, [])

  const trocarEmpresa = useCallback((slug: string) => {
    setEmpresaSlug(slug)
    window.localStorage.setItem(EMPRESA_STORAGE_KEY, slug)
  }, [])

  const empresaAtiva =
    empresas.find((empresa) => empresa.slug === empresaSlug) ??
    empresas.find((empresa) => empresa.slug === EMPRESA_SLUG_PADRAO) ??
    null

  // Aplica a identidade visual da empresa ativa via CSS custom properties,
  // em vez de classes Tailwind fixas — assim qualquer elemento que já usa
  // bg-accent-primary/text-accent-primary muda de cor automaticamente.
  //
  // Além da cor em hex (--accent-primary, usada direto em estilos inline/
  // gradientes), grava a mesma cor em canais RGB (--accent-primary-rgb),
  // que é o formato que o tailwind.config.ts usa pras classes com
  // opacidade (bg-accent-primary/15 etc.). Se a cor cadastrada não for um
  // hex válido, remove o override e o padrão do globals.css vale.
  useEffect(() => {
    if (!empresaAtiva) return
    document.documentElement.style.setProperty('--accent-primary', empresaAtiva.cor_primaria)
    const canais = hexParaCanaisRgb(empresaAtiva.cor_primaria)
    if (canais) {
      document.documentElement.style.setProperty('--accent-primary-rgb', canais)
    } else {
      document.documentElement.style.removeProperty('--accent-primary-rgb')
    }
    if (empresaAtiva.cor_secundaria) {
      document.documentElement.style.setProperty('--accent-secondary', empresaAtiva.cor_secundaria)
    } else {
      document.documentElement.style.removeProperty('--accent-secondary')
    }
  }, [empresaAtiva])

  return (
    <EmpresaContext.Provider value={{ empresas, empresaAtiva, loading, trocarEmpresa }}>
      {children}
    </EmpresaContext.Provider>
  )
}

export function useEmpresa() {
  const ctx = useContext(EmpresaContext)
  if (ctx === undefined) {
    throw new Error('useEmpresa deve ser usado dentro de um <EmpresaProvider>')
  }
  return ctx
}
