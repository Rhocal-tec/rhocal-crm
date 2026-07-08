import { redirect } from 'next/navigation'

// A raiz sempre encaminha para o dashboard.
// O middleware garante o redirect para /login quando não há sessão.
export default function Home() {
  redirect('/dashboard')
}
