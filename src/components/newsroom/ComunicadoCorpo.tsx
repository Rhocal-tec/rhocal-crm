'use client'

import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { aplicarVariaveis, linkSeguro } from '@/lib/newsroom/regras'
import { tipoDe, type Anexo, type Comunicado } from '@/lib/newsroom/tipos'

// Texto simples com **negrito**, listas ("- item") e links — sem HTML cru (seguro).
function linhaParaNos(linha: string, chave: string): ReactNode[] {
  const nos: ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|https?:\/\/[^\s]+)/g
  let ultimo = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regex.exec(linha)) !== null) {
    if (m.index > ultimo) nos.push(<Fragment key={`${chave}-t${i}`}>{linha.slice(ultimo, m.index)}</Fragment>)
    const trecho = m[0]
    if (trecho.startsWith('**')) {
      nos.push(<strong key={`${chave}-b${i}`}>{trecho.slice(2, -2)}</strong>)
    } else {
      const seguro = linkSeguro(trecho)
      nos.push(
        seguro ? (
          <a key={`${chave}-l${i}`} href={seguro} target="_blank" rel="noopener noreferrer" className="text-accent-primary underline">
            {trecho}
          </a>
        ) : (
          <Fragment key={`${chave}-x${i}`}>{trecho}</Fragment>
        ),
      )
    }
    ultimo = m.index + trecho.length
    i++
  }
  if (ultimo < linha.length) nos.push(<Fragment key={`${chave}-f`}>{linha.slice(ultimo)}</Fragment>)
  return nos
}

export function TextoFormatado({ texto }: { texto: string }) {
  const linhas = texto.split('\n')
  return (
    <div className="space-y-1 text-sm text-primary/90">
      {linhas.map((linha, idx) =>
        linha.startsWith('- ') ? (
          <p key={idx} className="pl-4 -indent-3">
            • {linhaParaNos(linha.slice(2), String(idx))}
          </p>
        ) : linha.trim() === '' ? (
          <div key={idx} className="h-2" />
        ) : (
          <p key={idx}>{linhaParaNos(linha, String(idx))}</p>
        ),
      )}
    </div>
  )
}

function AnexosLista({ anexos }: { anexos: Anexo[] }) {
  const [supabase] = useState(() => createClient())
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const mapa: Record<string, string> = {}
      for (const a of anexos) {
        const { data } = await supabase.storage.from('newsroom').createSignedUrl(a.caminho, 3600)
        if (data?.signedUrl) mapa[a.id] = data.signedUrl
      }
      if (ativo) setUrls(mapa)
    })()
    return () => {
      ativo = false
    }
  }, [supabase, anexos])

  if (anexos.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      {anexos.map((a) => {
        const url = urls[a.id]
        const imagem = (a.mime ?? '').startsWith('image/')
        if (!url) return <p key={a.id} className="text-xs text-muted">Carregando anexo…</p>
        return imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={a.id} src={url} alt={a.nome} className="max-h-72 rounded-md border border-white/10" />
        ) : (
          <a
            key={a.id}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-1.5 text-xs text-primary hover:bg-white/5"
          >
            📎 {a.nome}
          </a>
        )
      })}
    </div>
  )
}

export function ComunicadoCorpo({
  comunicado,
  anexos,
  nomeUsuario,
  setorUsuario,
  anexosPreviaQtd,
}: {
  comunicado: Pick<Comunicado, 'titulo' | 'corpo' | 'tipo' | 'link_video' | 'prazo_ciencia_em' | 'fixado'> & { id?: string }
  anexos: Anexo[]
  nomeUsuario?: string | null
  setorUsuario?: string | null
  anexosPreviaQtd?: number
}) {
  const t = tipoDe(comunicado as Comunicado)
  const video = linkSeguro(comunicado.link_video)
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.classes}`}>
          {t.icone} {t.rotulo}
        </span>
        {comunicado.fixado && <span className="text-xs text-muted">📌 Fixado</span>}
        {comunicado.prazo_ciencia_em && (
          <span className="text-xs text-muted">
            Ler até {new Date(comunicado.prazo_ciencia_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
      </div>
      <h2 className="mt-2 font-heading text-xl font-semibold text-primary">
        {aplicarVariaveis(comunicado.titulo, nomeUsuario, setorUsuario)}
      </h2>
      <div className="mt-2">
        <TextoFormatado texto={aplicarVariaveis(comunicado.corpo, nomeUsuario, setorUsuario)} />
      </div>
      {video && (
        <a
          href={video}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-accent-primary/40 bg-accent-primary/10 px-3 py-1.5 text-sm font-medium text-accent-primary hover:bg-accent-primary/20"
        >
          ▶ Assistir vídeo
        </a>
      )}
      <AnexosLista anexos={anexos} />
      {anexosPreviaQtd ? <p className="mt-3 text-xs text-muted">📎 {anexosPreviaQtd} anexo(s) serão exibidos aqui.</p> : null}
    </div>
  )
}
