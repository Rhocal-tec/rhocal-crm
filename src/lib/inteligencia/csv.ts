import Papa from 'papaparse'
import { formatarDataSomente, formatarMoeda } from '@/lib/kanban/formatacao'
import { OPORTUNIDADE_STATUS_LABELS } from '@/lib/oportunidades/status'
import { TEMPERATURA_AUTOMATICA_LABELS, type ClienteInteligencia } from './agregar'

// Fase 35: export client-side (sem round-trip ao servidor — os dados já
// estão carregados na tela). Uma linha por cliente, com TODOS os campos
// cruzados (cadastro + oportunidade + pedidos + interações) — pronto pra
// subir em ferramentas de campanha (Meta Ads, Google Ads, RD Station etc.).
function linhaCsv(cliente: ClienteInteligencia) {
  return {
    nome: cliente.nome,
    'razão social': cliente.razaoSocial ?? '',
    'nome fantasia': cliente.nomeFantasia ?? '',
    cnpj: cliente.cnpj ?? '',
    'e-mail': cliente.email ?? '',
    telefone: cliente.telefone ?? '',
    contato: cliente.contato ?? '',
    cidade: cliente.cidade ?? '',
    uf: cliente.estado ?? '',
    cep: cliente.cep ?? '',
    observações: cliente.observacoes ?? '',
    'temperatura automática': TEMPERATURA_AUTOMATICA_LABELS[cliente.temperaturaAutomatica],
    'temperatura manual': cliente.temperaturaManual ?? '',
    'etapa funil': cliente.etapaFunil ? OPORTUNIDADE_STATUS_LABELS[cliente.etapaFunil] : '',
    origem: cliente.origem ?? '',
    'valor estimado pipeline': formatarMoeda(cliente.valorEstimadoAberto),
    vendedor: cliente.vendedorNome ?? '',
    'data criação oportunidade': cliente.oportunidadeCriadaEm
      ? formatarDataSomente(cliente.oportunidadeCriadaEm)
      : '',
    'última compra': cliente.ultimaCompra ? formatarDataSomente(cliente.ultimaCompra) : '',
    'qtd pedidos total': cliente.qtdPedidosTotal,
    'qtd pedidos efetuados': cliente.qtdPedidosEfetuados,
    'ticket médio': cliente.ticketMedio !== null ? formatarMoeda(cliente.ticketMedio) : '',
    'valor total acumulado': formatarMoeda(cliente.valorTotalAcumulado),
    'itens mais comprados': cliente.itensMaisComprados
      .map((i) => `${i.descricao} (${i.quantidade})`)
      .join('; '),
    'qtd interações': cliente.qtdInteracoes,
    'tipo interação mais usado': cliente.tipoInteracaoMaisUsado ?? '',
    'último contato': cliente.ultimoContato ? formatarDataSomente(cliente.ultimoContato) : '',
  }
}

export function exportarClientesCsv(clientes: ClienteInteligencia[], nomeArquivo: string) {
  const csv = Papa.unparse(clientes.map(linhaCsv))
  // BOM UTF-8 na frente: sem isso o Excel no Windows abre acentuação
  // (razão, e-mail, última compra...) corrompida por assumir Latin-1.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
