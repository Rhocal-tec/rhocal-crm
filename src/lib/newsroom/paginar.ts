// PostgREST devolve no máximo 1000 linhas por consulta: pagina até acabar.
export async function paginar<T>(
  fazer: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const acc: T[] = []
  for (let de = 0; ; ) {
    const { data, error } = await fazer(de, de + 999)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    acc.push(...data)
    de += data.length
  }
  return acc
}

export function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho))
  return lotes
}
