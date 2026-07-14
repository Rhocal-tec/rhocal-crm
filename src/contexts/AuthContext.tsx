'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // Busca o perfil (nome + setor) na tabela profiles a partir do id do usuário.
  const carregarProfile = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Erro ao carregar perfil:', error.message)
        setProfile(null)
        return
      }
      setProfile(data)
    },
    [supabase],
  )

  useEffect(() => {
    let ativo = true

    // Estado inicial ao montar. Falha de rede/exceção não pode deixar a tela
    // travada em "Carregando…" para sempre — por isso o finally garante que
    // loading sempre chega a false, mesmo se getUser/carregarProfile rejeitar.
    supabase.auth
      .getUser()
      .then(async ({ data: { user } }) => {
        if (!ativo) return
        setUser(user)
        if (user) await carregarProfile(user.id)
      })
      .catch((err) => {
        console.error('Erro ao carregar usuário:', err)
      })
      .finally(() => {
        if (ativo) setLoading(false)
      })

    // Reage a login/logout/refresh de token.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!ativo) return
      const nextUser = session?.user ?? null
      setUser(nextUser)
      try {
        if (nextUser) {
          await carregarProfile(nextUser.id)
        } else {
          setProfile(null)
        }
      } finally {
        if (ativo) setLoading(false)
      }
    })

    return () => {
      ativo = false
      subscription.unsubscribe()
    }
  }, [supabase, carregarProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }, [supabase])

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth deve ser usado dentro de um <AuthProvider>')
  }
  return ctx
}
