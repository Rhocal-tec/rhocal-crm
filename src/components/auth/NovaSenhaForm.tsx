'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

const SENHA_MIN_LENGTH = 6

// Formulário reutilizado tanto na redefinição via link de e-mail (/redefinir-senha)
// quanto na troca de senha em conta logada (menu do perfil no header).
export function NovaSenhaForm({
  onSuccess,
  textoBotao = 'Salvar nova senha',
}: {
  onSuccess?: () => void
  textoBotao?: string
}) {
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    if (senha.length < SENHA_MIN_LENGTH) {
      setErro(`A senha deve ter pelo menos ${SENHA_MIN_LENGTH} caracteres.`)
      return
    }
    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem.')
      return
    }

    setEnviando(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)

    if (error) {
      setErro(
        error.message.toLowerCase().includes('fetch') ||
          error.message.toLowerCase().includes('network')
          ? 'Falha de conexão. Verifique sua internet e tente novamente.'
          : 'Não foi possível atualizar a senha. Tente novamente.',
      )
      return
    }

    setSenha('')
    setConfirmarSenha('')
    setSucesso(true)
    onSuccess?.()
  }

  if (sucesso) {
    return (
      <p className="text-sm text-accent-success" role="status">
        Senha atualizada com sucesso.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="nova-senha" className="block text-sm font-medium text-primary/80">
          Nova senha
        </label>
        <input
          id="nova-senha"
          type="password"
          autoComplete="new-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="input-field mt-1 block w-full rounded-md px-3 py-2"
          placeholder="••••••••"
        />
      </div>

      <div>
        <label htmlFor="confirmar-senha" className="block text-sm font-medium text-primary/80">
          Confirmar nova senha
        </label>
        <input
          id="confirmar-senha"
          type="password"
          autoComplete="new-password"
          required
          value={confirmarSenha}
          onChange={(e) => setConfirmarSenha(e.target.value)}
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
        {enviando ? 'Salvando…' : textoBotao}
      </button>
    </form>
  )
}
