'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })

    if (error) {
      setErro('E-mail ou senha inválidos.')
      setEnviando(false)
      return
    }

    // Redireciona e revalida (o middleware já reconhece a sessão via cookie).
    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base bg-[radial-gradient(circle_at_50%_0%,rgba(241,89,42,0.12),transparent_55%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Image
            src="/rhocal-logo.png"
            alt="RHOCAL"
            width={88}
            height={88}
            priority
            className="rounded-2xl shadow-lg"
          />
        </div>

        <div className="rounded-lg bg-surface p-8 shadow-xl ring-1 ring-white/5">
          <h1 className="text-center font-heading text-3xl font-semibold tracking-wide text-primary">
            RHOCAL CRM
          </h1>
          <p className="mt-1 text-center text-sm text-muted">
            Entre com sua conta para continuar
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-primary/80">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field mt-1 block w-full rounded-md px-3 py-2"
                placeholder="voce@empresa.com"
              />
            </div>

            <div>
              <label htmlFor="senha" className="block text-sm font-medium text-primary/80">
                Senha
              </label>
              <input
                id="senha"
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="input-field mt-1 block w-full rounded-md px-3 py-2"
                placeholder="••••••••"
              />
            </div>

            {erro && (
              <p className="text-sm text-accent-danger" role="alert">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="w-full rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
