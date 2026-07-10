'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [modo, setModo] = useState<'login' | 'esqueci-senha'>('login')

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [emailRecuperacao, setEmailRecuperacao] = useState('')
  const [erroRecuperacao, setErroRecuperacao] = useState<string | null>(null)
  const [enviandoRecuperacao, setEnviandoRecuperacao] = useState(false)
  const [emailEnviado, setEmailEnviado] = useState(false)

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

  function abrirEsqueciSenha() {
    setErro(null)
    setErroRecuperacao(null)
    setEmailEnviado(false)
    setEmailRecuperacao(email)
    setModo('esqueci-senha')
  }

  function voltarParaLogin() {
    setErroRecuperacao(null)
    setEmailEnviado(false)
    setModo('login')
  }

  async function handleSubmitRecuperacao(e: FormEvent) {
    e.preventDefault()
    setErroRecuperacao(null)
    setEnviandoRecuperacao(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(emailRecuperacao, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })

    setEnviandoRecuperacao(false)

    if (error) {
      setErroRecuperacao('Não foi possível enviar o e-mail agora. Verifique sua conexão e tente novamente.')
      return
    }

    setEmailEnviado(true)
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

          {modo === 'login' ? (
            <>
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
                  <div className="flex items-center justify-between">
                    <label htmlFor="senha" className="block text-sm font-medium text-primary/80">
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={abrirEsqueciSenha}
                      className="text-xs text-muted hover:text-primary/80"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
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
            </>
          ) : (
            <>
              <p className="mt-1 text-center text-sm text-muted">
                Informe seu e-mail para receber o link de redefinição
              </p>

              {emailEnviado ? (
                <div className="mt-8 space-y-4">
                  <p className="text-sm text-primary/80" role="status">
                    Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua
                    senha.
                  </p>
                  <button
                    type="button"
                    onClick={voltarParaLogin}
                    className="w-full rounded-md border border-white/15 px-4 py-2 text-sm text-primary/80 transition-colors hover:bg-white/5"
                  >
                    Voltar para o login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitRecuperacao} className="mt-8 space-y-4">
                  <div>
                    <label
                      htmlFor="email-recuperacao"
                      className="block text-sm font-medium text-primary/80"
                    >
                      E-mail
                    </label>
                    <input
                      id="email-recuperacao"
                      type="email"
                      autoComplete="email"
                      required
                      value={emailRecuperacao}
                      onChange={(e) => setEmailRecuperacao(e.target.value)}
                      className="input-field mt-1 block w-full rounded-md px-3 py-2"
                      placeholder="voce@empresa.com"
                    />
                  </div>

                  {erroRecuperacao && (
                    <p className="text-sm text-accent-danger" role="alert">
                      {erroRecuperacao}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={enviandoRecuperacao}
                    className="w-full rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {enviandoRecuperacao ? 'Enviando…' : 'Enviar link de redefinição'}
                  </button>

                  <button
                    type="button"
                    onClick={voltarParaLogin}
                    className="w-full text-center text-sm text-muted hover:text-primary/80"
                  >
                    Voltar para o login
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
