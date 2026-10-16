'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { obterMensagemCampanha } from '@/lib/inteligencia/segmentos-campanha'
import { montarLinkWhatsapp } from '@/lib/inteligencia/whatsapp'
import type { ClienteInteligencia } from '@/lib/inteligencia/agregar'
import type { Database } from '@/types/database'

type Campanha = Database['public']['Tables']['campanhas']['Row']
type CampanhaCliente = Database['public']['Tables']['campanha_clientes']['Row']

// Mesma prioridade de identificador já usada no matching de "Ver resultado"
// (CampanhasTab.tsx) e no resto da fase 35/36: cliente_omie_codigo > CNPJ >
// nome normalizado. `campanha_clientes` só guarda nome/CNPJ/código Omie —
// aqui a linha é casada de volta com o ClienteInteligencia completo (que tem
// telefone, contato etc.), já carregado pela tela mãe e passado via prop.
function encontrarClienteCorrespondente(
  linha: CampanhaCliente,
  clientes: ClienteInteligencia[],
): ClienteInteligencia | null {
  if (linha.cliente_omie_codigo) {
    const porOmie = clientes.find(
      (c) => c.omieClienteId !== null && String(c.omieClienteId) === linha.cliente_omie_codigo,
    )
    if (porOmie) return porOmie
  }

  const cnpjLinha = linha.cliente_cnpj ? linha.cliente_cnpj.replace(/\D/g, '') : null
  if (cnpjLinha) {
    const porCnpj = clientes.find((c) => c.cnpj && c.cnpj.replace(/\D/g, '') === cnpjLinha)
    if (porCnpj) return porCnpj
  }

  const nomeLinha = linha.cliente_nome.trim().toLowerCase()
  return clientes.find((c) => c.nome.trim().toLowerCase() === nomeLinha) ?? null
}

const JANELA_DIAS = 30

// Fase de disparo assistido de WhatsApp: lista os clientes de uma campanha
// já salva, com telefone resolvido (cadastro > pedido > oportunidade — ver
// agregar.ts), preview da mensagem do segmento e um link wa.me por cliente.
// Quem clica "Abrir no WhatsApp" ainda dá o "Enviar" final dentro do
// WhatsApp — aqui só marcamos otimisticamente que o link foi aberto.
export function CampanhaListaDisparo({
  campanha,
  clientes,
  onEnvioAlterado,
}: {
  campanha: Campanha
  clientes: ClienteInteligencia[]
  // Avisa o card da campanha para atualizar contadores/lista de enviados.
  onEnvioAlterado?: () => void
}) {
  const { user } = useAuth()
  const [supabase] = useState(() => createClient())
  const [linhas, setLinhas] = useState<CampanhaCliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [atualizando, setAtualizando] = useState<string | null>(null)
  // Contatos que receberam mensagem (em QUALQUER campanha) nos últimos
  // JANELA_DIAS dias somem da lista, para não repetir o disparo em pouco tempo.
  const [recentes, setRecentes] = useState<
    { cliente_omie_codigo: string | null; cliente_cnpj: string | null; cliente_nome: string }[]
  >([])
  const [mostrarEnviados, setMostrarEnviados] = useState(false)

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    setErro(null)

    supabase
      .from('campanha_clientes')
      .select('*')
      .eq('campanha_id', campanha.id)
      .then(({ data, error }) => {
        if (!ativo) return
        if (error) setErro('Não foi possível carregar a lista de disparo.')
        else setLinhas(data ?? [])
        setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [supabase, campanha.id])

  useEffect(() => {
    let ativo = true
    const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString()
    supabase
      .from('campanha_clientes')
      .select('cliente_omie_codigo, cliente_cnpj, cliente_nome')
      .gte('whatsapp_enviado_em', desde)
      .neq('campanha_id', campanha.id)
      .limit(5000)
      .then(({ data }) => {
        if (ativo) setRecentes(data ?? [])
      })
    return () => {
      ativo = false
    }
  }, [supabase, campanha.id])

  async function marcarEnviado(linha: CampanhaCliente, enviado: boolean) {
    setAtualizando(linha.id)
    const valor = enviado ? new Date().toISOString() : null

    let { error } = await supabase
      .from('campanha_clientes')
      .update({ whatsapp_enviado_em: valor, whatsapp_enviado_por: enviado ? (user?.id ?? null) : null })
      .eq('id', linha.id)

    // Migração 0035 (coluna whatsapp_enviado_por) ainda não rodada: marca o
    // envio mesmo assim, só sem registrar quem enviou.
    if (error) {
      const retry = await supabase
        .from('campanha_clientes')
        .update({ whatsapp_enviado_em: valor })
        .eq('id', linha.id)
      error = retry.error
    }

    setAtualizando(null)

    if (error) {
      setErro('Não foi possível salvar o status de envio.')
      return
    }

    setLinhas((atual) =>
      atual.map((l) =>
        l.id === linha.id
          ? { ...l, whatsapp_enviado_em: valor, whatsapp_enviado_por: enviado ? (user?.id ?? null) : null }
          : l,
      ),
    )
    onEnvioAlterado?.()
  }

  if (carregando) {
    return <p className="mt-3 text-center text-xs text-muted">Carregando lista de disparo…</p>
  }

  if (linhas.length === 0) {
    return <p className="mt-3 text-center text-xs text-muted">Nenhum cliente nesta campanha.</p>
  }

  const totalEnviados = linhas.filter((l) => l.whatsapp_enviado_em).length

  const cnpjsRecentes = new Set(
    recentes.map((r) => (r.cliente_cnpj ? r.cliente_cnpj.replace(/\D/g, '') : '')).filter(Boolean),
  )
  const omiesRecentes = new Set(recentes.map((r) => r.cliente_omie_codigo).filter(Boolean))
  const nomesRecentes = new Set(recentes.map((r) => r.cliente_nome.trim().toLowerCase()))
  // Contatado em outra campanha nos últimos dias?
  function contatadoRecentemente(l: CampanhaCliente): boolean {
    const cnpj = l.cliente_cnpj ? l.cliente_cnpj.replace(/\D/g, '') : ''
    return (
      (!!l.cliente_omie_codigo && omiesRecentes.has(l.cliente_omie_codigo)) ||
      (!!cnpj && cnpjsRecentes.has(cnpj)) ||
      nomesRecentes.has(l.cliente_nome.trim().toLowerCase())
    )
  }
  const jaContatados = linhas.filter((l) => !!l.whatsapp_enviado_em || contatadoRecentemente(l))
  const linhasVisiveis = mostrarEnviados
    ? linhas
    : linhas.filter((l) => !l.whatsapp_enviado_em && !contatadoRecentemente(l))

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-white/10 bg-surface-alt p-3">
      <p className="text-xs font-semibold text-primary">
        {totalEnviados} de {linhas.length} enviado(s)
      </p>

      {jaContatados.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>
            {mostrarEnviados
              ? `Exibindo também ${jaContatados.length} já contatado(s).`
              : `${jaContatados.length} contato(s) já receberam mensagem (últimos ${JANELA_DIAS} dias) e foram ocultados.`}
          </span>
          <button
            type="button"
            onClick={() => setMostrarEnviados((v) => !v)}
            className="font-medium text-primary/80 underline underline-offset-2 hover:text-primary"
          >
            {mostrarEnviados ? 'Ocultar de novo' : 'Mostrar mesmo assim'}
          </button>
        </div>
      )}

      {linhasVisiveis.length === 0 && (
        <p className="text-xs text-muted">Todos os contatos desta campanha já foram contatados. ✅</p>
      )}

      {erro && <p className="text-xs text-accent-danger">{erro}</p>}

      <div className="flex flex-col gap-2">
        {linhasVisiveis.map((linha) => {
          const cliente = encontrarClienteCorrespondente(linha, clientes)
          const nome = cliente?.nome ?? linha.cliente_nome
          const telefone = cliente?.telefone ?? null
          const mensagem = cliente ? obterMensagemCampanha(campanha.filtros_aplicados, cliente) : null
          const link = telefone && mensagem ? montarLinkWhatsapp(telefone, mensagem) : null
          const enviado = !!linha.whatsapp_enviado_em

          return (
            <div key={linha.id} className="rounded-md border border-white/10 bg-surface p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-primary">
                    {nome}
                    {cliente?.contato && <span className="text-muted"> — {cliente.contato}</span>}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted">
                    {telefone ? formatarTelefoneInput(telefone) : 'Sem telefone'}
                    {cliente?.telefoneOrigem === 'pedido' && ' (via pedido)'}
                    {cliente?.telefoneOrigem === 'oportunidade' && ' (via oportunidade)'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {enviado && (
                    <span className="rounded-full border border-accent-success/40 bg-accent-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-success">
                      ✓ Enviado
                    </span>
                  )}
                  {link ? (
                    <>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          if (!enviado) marcarEnviado(linha, true)
                        }}
                        className="rounded-md bg-accent-success px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
                      >
                        Abrir no WhatsApp
                      </a>
                      {enviado && (
                        <button
                          type="button"
                          onClick={() => marcarEnviado(linha, false)}
                          disabled={atualizando === linha.id}
                          className="text-xs font-medium text-muted hover:text-primary disabled:opacity-50"
                        >
                          Desfazer
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="rounded-full border border-accent-alert/40 bg-accent-alert/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-alert">
                      Sem telefone
                    </span>
                  )}
                </div>
              </div>

              {mensagem && link && (
                <p className="mt-2 whitespace-pre-wrap rounded-md bg-surface-alt px-2.5 py-2 text-xs text-primary/80">
                  {mensagem}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
