'use client'

import { Modal } from '@/components/ui/Modal'
import { formatarCnpjInput, formatarDataSomente, formatarMoeda, formatarTelefoneInput } from '@/lib/kanban/formatacao'
import { STATUS_LABELS } from '@/lib/kanban/status'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { TEMPERATURA_AUTOMATICA_LABELS } from '@/lib/inteligencia/agregar'
import { TEMPERATURA_AUTOMATICA_BADGE_CLASSES } from '@/lib/inteligencia/temperatura-cores'
import type { ClienteInteligencia } from '@/lib/inteligencia/agregar'

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted">{rotulo}</p>
      <p className="text-sm text-primary/90">{valor}</p>
    </div>
  )
}

export function FichaClienteModal({
  cliente,
  onClose,
}: {
  cliente: ClienteInteligencia | null
  onClose: () => void
}) {
  if (!cliente) return null

  return (
    <Modal open={cliente !== null} onClose={onClose} title={`Ficha — ${cliente.nome}`} widthClassName="max-w-3xl">
      <div className="flex flex-col gap-6">
        <section>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-primary">Dados cadastrais</h3>
            <span
              className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${TEMPERATURA_AUTOMATICA_BADGE_CLASSES[cliente.temperaturaAutomatica]}`}
            >
              {TEMPERATURA_AUTOMATICA_LABELS[cliente.temperaturaAutomatica]}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 rounded-md border border-white/10 bg-surface-alt p-3 sm:grid-cols-3">
            <Campo rotulo="Razão social" valor={cliente.razaoSocial} />
            <Campo rotulo="Nome fantasia" valor={cliente.nomeFantasia} />
            <Campo rotulo="CNPJ" valor={cliente.cnpj ? formatarCnpjInput(cliente.cnpj) : null} />
            <Campo rotulo="E-mail" valor={cliente.email} />
            <Campo rotulo="Telefone" valor={cliente.telefone ? formatarTelefoneInput(cliente.telefone) : null} />
            <Campo rotulo="Contato" valor={cliente.contato} />
            <Campo
              rotulo="Cidade/UF"
              valor={cliente.cidade ? `${cliente.cidade}${cliente.estado ? `/${cliente.estado}` : ''}` : null}
            />
            <Campo rotulo="CEP" valor={cliente.cep} />
            <Campo rotulo="Vendedor" valor={cliente.vendedorNome} />
          </div>
          {cliente.observacoes && (
            <p className="mt-2 rounded-md border border-white/10 bg-surface-alt p-3 text-sm text-primary/80">
              <span className="text-[11px] uppercase tracking-wide text-muted">Observações</span>
              <br />
              {cliente.observacoes}
            </p>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-primary">Resumo de compras (RFM)</h3>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-white/10 bg-surface-alt p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Última compra</p>
              <p className="mt-1 font-mono text-sm text-primary">
                {cliente.ultimaCompra ? formatarDataSomente(cliente.ultimaCompra) : '—'}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-surface-alt p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Pedidos (total / efetuados)</p>
              <p className="mt-1 font-mono text-sm text-primary">
                {cliente.qtdPedidosTotal} / {cliente.qtdPedidosEfetuados}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-surface-alt p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Ticket médio</p>
              <p className="mt-1 font-mono text-sm text-primary">
                {cliente.ticketMedio !== null ? formatarMoeda(cliente.ticketMedio) : '—'}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-surface-alt p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Valor total acumulado</p>
              <p className="mt-1 font-mono text-sm text-primary">{formatarMoeda(cliente.valorTotalAcumulado)}</p>
            </div>
          </div>

          {cliente.itensMaisComprados.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wide text-muted">Itens mais comprados</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {cliente.itensMaisComprados.map((item) => (
                  <li
                    key={item.descricao}
                    className="rounded-full border border-white/10 bg-surface-alt px-2.5 py-1 text-xs text-primary/80"
                  >
                    {item.descricao} <span className="text-muted">×{item.quantidade}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-primary">Histórico de pedidos</h3>
          {cliente.historicoPedidos.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhum pedido registrado.</p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-md border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Pedido</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Criado em</th>
                    <th className="px-3 py-2 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {cliente.historicoPedidos.map((p) => (
                    <tr key={p.id} className="border-t border-white/5">
                      <td className="px-3 py-2 font-mono text-primary/80">#{p.numero}</td>
                      <td className="px-3 py-2 text-primary/80">{STATUS_LABELS[p.status]}</td>
                      <td className="px-3 py-2 text-primary/80">{formatarDataSomente(p.criado_em)}</td>
                      <td className="px-3 py-2 font-mono text-primary/80">{formatarMoeda(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-primary">Oportunidades abertas</h3>
          {cliente.oportunidadesAbertas.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhuma oportunidade aberta.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {cliente.oportunidadesAbertas.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-surface-alt px-3 py-2 text-sm"
                >
                  <span className="text-primary/80">
                    Oportunidade #{o.numero}
                    {o.origem && <span className="ml-1.5 text-xs text-muted">({o.origem})</span>}
                  </span>
                  <span className="font-medium text-accent-compras">
                    {OPORTUNIDADE_STATUS_LABELS[o.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-primary">Tarefas pendentes</h3>
          {cliente.tarefasPendentes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhuma tarefa pendente.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {cliente.tarefasPendentes.map((t) => (
                <li
                  key={t.id}
                  className="rounded-md border border-white/10 bg-surface-alt px-3 py-2 text-sm text-primary/80"
                >
                  {t.descricao}
                  {t.data_prevista && (
                    <span className="ml-1.5 text-xs text-muted">
                      — prevista para {formatarDataSomente(t.data_prevista)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-primary">Histórico de contato</h3>
          <p className="mt-1 text-xs text-muted">
            {cliente.qtdInteracoes} tentativa(s) registrada(s)
            {cliente.tipoInteracaoMaisUsado && ` · tipo mais usado: ${cliente.tipoInteracaoMaisUsado}`}
            {cliente.ultimoContato && ` · último contato: ${formatarDataSomente(cliente.ultimoContato)}`}
          </p>
          {cliente.interacoes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nenhuma tentativa de contato registrada.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {cliente.interacoes.slice(0, 10).map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-surface-alt px-3 py-2 text-sm"
                >
                  <span className="text-primary/80">
                    {i.tipo} <span className="text-muted">— {i.resultado}</span>
                  </span>
                  <span className="text-xs text-muted">{formatarDataSomente(i.criado_em)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}
