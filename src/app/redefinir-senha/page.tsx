'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { NovaSenhaForm } from '@/components/auth/NovaSenhaForm'

// Tempo de tolerância para o Supabase processar o token de recuperação da URL
// (evento PASSWORD_RECOVERY) antes de considerarmos o link inválido/expirado.
const TIMEOUT_VERIFICACAO_MS = 6000

export default function RedefinirSenhaPage() {
  const router = useRouter()
  const [pronto, setPronto] = useState(false)
  const [linkInvalido, setLinkInvalido] = useState(false)
  const prontoRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    let ativo = true

    // Cobre o caso da sessão de recuperação já ter sido processada antes deste
    // efeito montar (ex.: evento disparado durante a inicialização do client).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (ativo && session) {
        prontoRef.current = true
        setPronto(true)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!ativo) return
      if (event === 'PASSWORD_RECOVERY') {
        prontoRef.current = true
        setPronto(true)
      }
    })

    const timeoutId = setTimeout(() => {
      if (ativo && !prontoRef.current) setLinkInvalido(true)
    }, TIMEOUT_VERIFICACAO_MS)

    return () => {
      ativo = false
      subscription.unsubscribe()
      clearTimeout(timeoutId)
    }
  }, [])

  function handleSucesso() {
    setTimeout(() => {
      router.replace('/dashboard')
      router.refresh()
    }, 1500)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base bg-[radial-gradient(circle_at_50%_0%,rgba(241,89,42,0.12),transparent_55%)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Image
            src="/rhocal-logo.png"
            alt="RHOCAL"
            width={72}
            height={72}
            priority
            className="rounded-2xl shadow-lg"
          />
        </div>

        <div className="rounded-lg bg-surface p-8 shadow-xl ring-1 ring-white/5">
          <h1 className="text-center font-heading text-2xl font-semibold tracking-wide text-primary">
            Redefinir senha
          </h1>

          {linkInvalido ? (
            <div className="mt-6 space-y-4 text-center">
              <p className="text-sm text-accent-danger" role="alert">
                Este link de redefinição é inválido ou já expirou.
              </p>
              <a
                href="/login"
                className="inline-block text-sm text-accent-primary hover:underline"
              >
                Voltar para o login
              </a>
            </div>
          ) : !pronto ? (
            <p className="mt-6 text-center text-sm text-muted" role="status">
              Verificando link…
            </p>
          ) : (
            <div className="mt-6">
              <p className="mb-4 text-center text-sm text-muted">
                Escolha uma nova senha para sua conta.
              </p>
              <NovaSenhaForm textoBotao="Redefinir senha" onSuccess={handleSucesso} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
