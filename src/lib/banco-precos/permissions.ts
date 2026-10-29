// Banco de Preços: exclusivo de Compras e Gestor (mesma regra do RLS da tabela).
import type { SetorTipo } from '@/types/database'

export function podeAcessarBancoPrecos(setor: SetorTipo): boolean {
  return setor === 'compras' || setor === 'gestor'
}
