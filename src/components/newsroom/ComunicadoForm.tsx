'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { ComunicadoCorpo } from './ComunicadoCorpo'
import { MODELOS } from '@/lib/newsroom/modelos'
import { linkSeguro } from '@/lib/newsroom/regras'
import {
  EXIBICOES,
  SETORES,
  TIPOS,
  type Anexo,
  type Comunicado,
  type Destino,
  type Exibicao,
  type TipoComunicado,
} from '@/lib/newsroom/tipos'
import type { SetorTipo } from '@/types/database'

export interface PessoaOpcao {
  id: string
  nome: string
  setor: SetorTipo
}

const MAX_BYTES = 10 * 1024 * 1024
const MIMES_OK = ['image/png', 'image/jpeg', 'image/gif', 'application/pdf']

function paraInputLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function deInputLocal(valor: string): string | null {
  return valor ? new Date(valor).toISOString() : null
}

export function ComunicadoForm({
  inicial,
  destinosIniciais,
  anexosExistentes,
  pessoas,
  onSalvo,
  onCancelar,
}: {
  inicial: Comunicado | null
  destinosIniciais: Destino[]
  anexosExistentes: Anexo[]
  pessoas: PessoaOpcao[]
  onSalvo: () => void
  onCancelar: () => void
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())

  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [corpo, setCorpo] = useState(inicial?.corpo ?? '')
  const [tipo, setTipo] = useState<TipoComunicado>((inicial?.tipo as TipoComunicado) ?? 'aviso')
  const [exibicao, setExibicao] = useState<Exibicao>((inicial?.exibicao as Exibicao) ?? 'popup')
  const [exige, setExige] = useState(inicial?.exige_confirmacao ?? false)
  const [fixado, setFixado] = useState(inicial?.fixado ?? false)
  const [inicio, setInicio] = useState(paraInputLocal(inicial?.inicio_em ?? new Date().toISOString()))
  const [fim, setFim] = useState(paraInputLocal(inicial?.fim_em ?? null))
  const [prazo, setPrazo] = useState(paraInputLocal(inicial?.prazo_ciencia_em ?? null))
  const [video, setVideo] = useState(inicial?.link_video ?? '')
  const [arquivos, setArquivos] = useState<File[]>([])

  const todos = destinosIniciais.some((d) => d.tipo === 'todos') || destinosIniciais.length === 0
  const [publico, setPublico] = useState<'todos' | 'setores' | 'pessoas'>(
    destinosIniciais.length === 0 || todos
      ? 'todos'
      : destinosIniciais.some((d) => d.tipo === 'pessoa')
        ? 'pessoas'
        : 'setores',
  )
  const [setoresSel, setSetoresSel] = useState<Set<SetorTipo>>(
    new Set(destinosIniciais.filter((d) => d.tipo === 'setor' && d.setor).map((d) => d.setor as SetorTipo)),
  )
  const [pessoasSel, setPessoasSel] = useState<Set<string>>(
    new Set(destinosIniciais.filter((d) => d.tipo === 'pessoa' && d.usuario_id).map((d) => d.usuario_id as string)),
  )
  const [reabrir, setReabrir] = useState<boolean | null>(null)
  const [previa, setPrevia] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const publicado = inicial?.status === 'publicado' || inicial?.status === 'encerrado'
  const alterouConteudo =
    !!inicial &&
    (titulo !== inicial.titulo || corpo !== inicial.corpo || (video || null) !== inicial.link_video || tipo !== inicial.tipo || arquivos.length > 0)
  const reabrirEfetivo = reabrir ?? alterouConteudo

  function aplicarModelo(id: string) {
    const m = MODELOS.find((x) => x.id === id)
    if (!m) return
    setTitulo(m.titulo)
    setCorpo(m.corpo)
    setTipo(m.tipo)
    setExibicao(m.exibicao)
    setExige(m.exige_confirmacao)
  }

  function alternar<T>(conjunto: Set<T>, valor: T, set: (s: Set<T>) => void) {
    const novo = new Set(conjunto)
    if (novo.has(valor)) novo.delete(valor)
    else novo.add(valor)
    set(novo)
  }

  function adicionarArquivos(lista: FileList | null) {
    if (!lista) return
    const novos: File[] = []
    for (const f of Array.from(lista)) {
      if (!MIMES_OK.includes(f.type)) {
        setErro(`Tipo não permitido: ${f.name}. Use PNG, JPG, GIF ou PDF.`)
        continue
      }
      if (f.size > MAX_BYTES) {
        setErro(`${f.name} passa de 10 MB.`)
        continue
      }
      novos.push(f)
    }
    setArquivos((a) => [...a, ...novos])
  }

  const rascunhoPrevia = useMemo(
    () => ({
      titulo: titulo || '(sem título)',
      corpo: corpo || '(sem texto)',
      tipo,
      link_video: video || null,
      prazo_ciencia_em: deInputLocal(prazo),
      fixado,
    }),
    [titulo, corpo, tipo, video, prazo, fixado],
  )

  async function salvar(publicar: boolean) {
    if (!user) return
    setErro(null)
    if (!titulo.trim() || !corpo.trim()) {
      setErro('Informe título e texto.')
      return
    }
    if (video.trim() && !linkSeguro(video)) {
      setErro('Link de vídeo inválido (use http ou https).')
      return
    }
    if (publico === 'setores' && setoresSel.size === 0) {
      setErro('Selecione ao menos um setor.')
      return
    }
    if (publico === 'pessoas' && pessoasSel.size === 0) {
      setErro('Selecione ao menos uma pessoa.')
      return
    }
    const inicioIso = deInputLocal(inicio) ?? new Date().toISOString()
    const fimIso = deInputLocal(fim)
    if (fimIso && new Date(fimIso) <= new Date(inicioIso)) {
      setErro('O fim precisa ser depois do início.')
      return
    }

    setSalvando(true)
    const campos = {
      titulo: titulo.trim(),
      corpo: corpo.trim(),
      tipo,
      exibicao,
      exige_confirmacao: exige,
      fixado,
      inicio_em: inicioIso,
      fim_em: fimIso,
      prazo_ciencia_em: deInputLocal(prazo),
      link_video: video.trim() || null,
      atualizado_em: new Date().toISOString(),
    }

    let comunicadoId = inicial?.id ?? ''
    if (inicial) {
      const novoStatus = publicar ? 'publicado' : inicial.status === 'rascunho' ? 'rascunho' : inicial.status
      const { error } = await supabase
        .from('newsroom_comunicados')
        .update({
          ...campos,
          status: novoStatus,
          versao: publicado && reabrirEfetivo ? inicial.versao + 1 : inicial.versao,
        })
        .eq('id', inicial.id)
      if (error) {
        setErro(`Não foi possível salvar: ${error.message}`)
        setSalvando(false)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('newsroom_comunicados')
        .insert({ ...campos, status: publicar ? 'publicado' : 'rascunho', criado_por: user.id })
        .select()
        .single()
      if (error || !data) {
        setErro(`Não foi possível salvar: ${error?.message ?? 'erro desconhecido'}`)
        setSalvando(false)
        return
      }
      comunicadoId = data.id
    }

    // Público: troca os destinos.
    const { error: erroDel } = await supabase.from('newsroom_destinos').delete().eq('comunicado_id', comunicadoId)
    if (erroDel) {
      setErro(`Salvou o aviso, mas falhou ao atualizar o público: ${erroDel.message}`)
      setSalvando(false)
      return
    }
    const destinos =
      publico === 'todos'
        ? [{ comunicado_id: comunicadoId, tipo: 'todos' }]
        : publico === 'setores'
          ? Array.from(setoresSel).map((s) => ({ comunicado_id: comunicadoId, tipo: 'setor', setor: s }))
          : Array.from(pessoasSel).map((u) => ({ comunicado_id: comunicadoId, tipo: 'pessoa', usuario_id: u }))
    const { error: erroDest } = await supabase.from('newsroom_destinos').insert(destinos)
    if (erroDest) {
      setErro(`Salvou o aviso, mas falhou ao gravar o público: ${erroDest.message}`)
      setSalvando(false)
      return
    }

    // Anexos (arquivos).
    for (const f of arquivos) {
      const caminho = `${comunicadoId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_')}`
      const { error: erroUp } = await supabase.storage.from('newsroom').upload(caminho, f, { contentType: f.type })
      if (erroUp) {
        setErro(`Aviso salvo, mas o anexo ${f.name} falhou: ${erroUp.message}`)
        setSalvando(false)
        return
      }
      await supabase
        .from('newsroom_anexos')
        .insert({ comunicado_id: comunicadoId, nome: f.name, caminho, mime: f.type, tamanho: f.size })
    }

    setSalvando(false)
    onSalvo()
  }

  const rotulo = 'flex flex-col gap-1 text-xs text-muted'
  const input = 'input-field rounded-md px-2 py-1.5 text-sm text-primary'

  return (
    <div className="space-y-4 rounded-lg border border-white/10 bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-primary">
          {inicial ? 'Editar comunicado' : 'Novo comunicado'}
        </h2>
        {!inicial && (
          <select
            defaultValue=""
            onChange={(e) => e.target.value && aplicarModelo(e.target.value)}
            className="input-field rounded-md px-2 py-1.5 text-xs"
          >
            <option value="">Usar um modelo…</option>
            {MODELOS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      <label className={rotulo}>
        Título *
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={input} />
      </label>
      <label className={rotulo}>
        Texto * (use **negrito**, linhas começando com - para lista, e as variáveis {'{nome}'} e {'{setor}'})
        <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={6} className={input} />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={rotulo}>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoComunicado)} className={input}>
            {Object.entries(TIPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.icone} {v.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Link de vídeo (YouTube, Drive…)
          <input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://" className={input} />
        </label>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs text-muted">Como aparece</legend>
        {EXIBICOES.map((e) => (
          <label key={e.valor} className="flex items-start gap-2 text-sm text-primary">
            <input type="radio" name="exibicao" checked={exibicao === e.valor} onChange={() => setExibicao(e.valor)} className="mt-1" />
            <span>
              {e.rotulo} <span className="text-xs text-muted">— {e.descricao}</span>
            </span>
          </label>
        ))}
        {tipo === 'urgente' && exibicao === 'popup' && (
          <p className="text-xs text-accent-danger">Urgente em pop-up cobre o CRM inteiro até a pessoa clicar em Entendi.</p>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs text-muted">Para quem</legend>
        <div className="flex flex-wrap gap-4 text-sm text-primary">
          {(['todos', 'setores', 'pessoas'] as const).map((v) => (
            <label key={v} className="flex items-center gap-1.5">
              <input type="radio" name="publico" checked={publico === v} onChange={() => setPublico(v)} />
              {v === 'todos' ? 'Todos' : v === 'setores' ? 'Por setor' : 'Pessoas específicas'}
            </label>
          ))}
        </div>
        {publico === 'setores' && (
          <div className="flex flex-wrap gap-3 text-sm text-primary">
            {SETORES.map((s) => (
              <label key={s.valor} className="flex items-center gap-1.5">
                <input type="checkbox" checked={setoresSel.has(s.valor)} onChange={() => alternar(setoresSel, s.valor, setSetoresSel)} />
                {s.rotulo}
              </label>
            ))}
          </div>
        )}
        {publico === 'pessoas' && (
          <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-white/10 p-2 text-sm text-primary sm:grid-cols-2">
            {pessoas.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5">
                <input type="checkbox" checked={pessoasSel.has(p.id)} onChange={() => alternar(pessoasSel, p.id, setPessoasSel)} />
                {p.nome} <span className="text-xs text-muted">({p.setor})</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={rotulo}>
          Início
          <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className={input} />
        </label>
        <label className={rotulo}>
          Fim (opcional)
          <input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} className={input} />
        </label>
        <label className={rotulo}>
          Ler até (opcional)
          <input type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={input} />
        </label>
      </div>

      <div className="flex flex-wrap gap-5 text-sm text-primary">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={exige} onChange={(e) => setExige(e.target.checked)} />
          Exigir confirmação de leitura (aparece no relatório de quem não leu)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={fixado} onChange={(e) => setFixado(e.target.checked)} />
          📌 Fixar no topo do Newsroom
        </label>
      </div>

      <div className="space-y-2">
        <label className={rotulo}>
          Anexos (PNG, JPG, GIF ou PDF até 10 MB)
          <input type="file" multiple accept=".png,.jpg,.jpeg,.gif,.pdf" onChange={(e) => adicionarArquivos(e.target.files)} className="text-xs" />
        </label>
        {anexosExistentes.length > 0 && (
          <p className="text-xs text-muted">Já anexados: {anexosExistentes.map((a) => a.nome).join(', ')}</p>
        )}
        {arquivos.length > 0 && (
          <ul className="text-xs text-primary">
            {arquivos.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                📎 {f.name}
                <button onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))} className="text-accent-danger">
                  remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {publicado && (
        <label className="flex items-center gap-1.5 rounded-md border border-accent-alert/30 bg-accent-alert/10 p-2 text-sm text-primary">
          <input type="checkbox" checked={reabrirEfetivo} onChange={(e) => setReabrir(e.target.checked)} />
          Reabrir para quem já leu (o aviso volta a aparecer para todos)
        </label>
      )}

      {erro && <p className="text-sm text-accent-danger">{erro}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setPrevia(true)} className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-primary hover:bg-white/5">
          👁 Prévia
        </button>
        {(!inicial || inicial.status === 'rascunho') && (
          <button
            onClick={() => salvar(false)}
            disabled={salvando}
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-primary hover:bg-white/5 disabled:opacity-60"
          >
            Salvar rascunho
          </button>
        )}
        <button
          onClick={() => salvar(true)}
          disabled={salvando}
          className="rounded-md bg-accent-success px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {salvando ? 'Salvando…' : publicado ? 'Salvar alterações' : 'Publicar / agendar'}
        </button>
        <button onClick={onCancelar} disabled={salvando} className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-primary">
          Cancelar
        </button>
      </div>

      {previa && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
          <div
            className={`max-h-[90vh] w-full overflow-y-auto rounded-xl border-2 bg-surface p-6 ${
              tipo === 'urgente' ? 'max-w-2xl border-accent-danger' : 'max-w-xl border-white/15'
            }`}
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Prévia — assim a equipe vai ver {tipo === 'urgente' ? '(tela cheia, sem fechar)' : ''}
            </p>
            <ComunicadoCorpo
              comunicado={rascunhoPrevia}
              anexos={[]}
              nomeUsuario="Nome"
              setorUsuario="setor"
              anexosPreviaQtd={arquivos.length + anexosExistentes.length}
            />
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setPrevia(false)} className="rounded-md border border-white/15 px-4 py-2 text-sm text-primary">
                Fechar prévia
              </button>
              <button disabled className="rounded-md bg-accent-success px-5 py-2 text-sm font-semibold text-white opacity-60">
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
