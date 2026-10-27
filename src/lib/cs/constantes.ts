// Constantes do módulo CS (pós-venda). Prazos e metas vêm da tabela cs_config
// (editáveis pela diretoria); os valores abaixo são só o padrão enquanto a
// migração 0038 não rodou ou a linha não existe.
export type FaseCS = 'reclamacao' | 'recompra' | 'pos_entrega' | 'percepcao' | 'alerta' | 'recuperacao'

export const FASES_ORDEM: FaseCS[] = ['reclamacao', 'recompra', 'pos_entrega', 'percepcao', 'alerta', 'recuperacao']

export const FASE_LABELS: Record<FaseCS, string> = {
  reclamacao: 'Reclamação aberta',
  recompra: 'Recompra programada',
  pos_entrega: 'Pós-entrega',
  percepcao: 'Percepção',
  alerta: 'Alerta de inatividade',
  recuperacao: 'Recuperação',
}

export const FASE_BADGE: Record<FaseCS, string> = {
  reclamacao: 'border-accent-danger/40 bg-accent-danger/15 text-accent-danger',
  recompra: 'border-accent-success/40 bg-accent-success/15 text-accent-success',
  pos_entrega: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300',
  percepcao: 'border-violet-400/40 bg-violet-400/10 text-violet-300',
  alerta: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  recuperacao: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
}

export const CONFIG_PADRAO: Record<string, number> = {
  pos_entrega_inicio: 1,
  pos_entrega_fim: 3,
  percepcao_inicio: 15,
  percepcao_fim: 45,
  alerta_inicio: 46,
  alerta_fim: 59,
  recuperacao_inicio: 60,
  recompra_antecedencia: 7,
  meta_dia: 20,
  prazo_reclamacao_horas: 48,
  alerta_reclamacao_horas: 12,
  retentativa_dias_uteis: 2,
}

export const CANAIS = [
  { valor: 'whatsapp', label: 'WhatsApp' },
  { valor: 'telefone', label: 'Telefone' },
  { valor: 'link', label: 'Link' },
  { valor: 'qr_balcao', label: 'QR code no balcão' },
]

export const MOTIVOS_NOTA = ['Prazo', 'Produto', 'Atendimento', 'Preço', 'Outro']
export const MOTIVOS_ESCOLHA = ['Preço', 'Prazo', 'Atendimento', 'Variedade', 'Indicação', 'Outro']
export const ORIGENS = ['Indicação', 'Google', 'Redes sociais', 'Vendedora', 'Outro']

export const CATEGORIAS_RECLAMACAO = ['Atraso', 'Avaria', 'Produto', 'Atendimento', 'Outro']
export const AREAS_RESPONSAVEIS = ['Comercial', 'Compras', 'Logística', 'Diretoria', 'CS']

export const STATUS_RECLAMACAO: { valor: string; label: string }[] = [
  { valor: 'aberta', label: 'Aberta' },
  { valor: 'com_a_area', label: 'Com a área' },
  { valor: 'resolvida', label: 'Resolvida' },
  { valor: 'retorno_dado', label: 'Retorno dado ao cliente' },
]

export const DESTINOS_REPASSE: { valor: string; label: string }[] = [
  { valor: 'closer', label: 'Closer (preço e condição)' },
  { valor: 'vendedora', label: 'Vendedora (reposição confirmada)' },
  { valor: 'compras', label: 'Compras' },
  { valor: 'logistica', label: 'Logística' },
  { valor: 'diretoria', label: 'Diretoria' },
]

export const RESULTADOS_REPASSE: { valor: string; label: string }[] = [
  { valor: 'pendente', label: 'Pendente' },
  { valor: 'pedido_fechado', label: 'Pedido fechado' },
  { valor: 'nao_fechou', label: 'Não fechou' },
  { valor: 'resolvido', label: 'Resolvido' },
]

// Roteiro e mensagem prontos por fase. {nome}, {empresa} e {produtos} são
// preenchidos com os dados do cliente na tela de atendimento.
export const ROTEIROS: Record<FaseCS, { roteiro: string[]; mensagem: string }> = {
  reclamacao: {
    roteiro: [
      'Retome a reclamação aberta e confirme o que já foi feito.',
      'Informe o próximo passo e o prazo de retorno.',
      'Registre a solução e dê o retorno ao cliente.',
    ],
    mensagem:
      'Olá, {nome}! Aqui é da {empresa}. Estou acompanhando a sua solicitação e queria atualizar você sobre o andamento. Podemos falar agora?',
  },
  recompra: {
    roteiro: [
      'Lembre o cliente que está chegando a data de reposição que ele informou.',
      'Confirme os itens e as quantidades da próxima compra.',
      'Se pedir preço, desconto ou condição, repasse para a closer.',
    ],
    mensagem:
      'Olá, {nome}! Aqui é da {empresa}. Vi que está chegando a hora de repor {produtos}. Quer que eu já encaminhe para a nossa equipe de vendas?',
  },
  pos_entrega: {
    roteiro: [
      'Pergunte se o pedido chegou certinho e no prazo.',
      'Confirme se há algum ajuste ou problema com os produtos.',
      'Se houver problema, abra a reclamação.',
    ],
    mensagem:
      'Olá, {nome}! Aqui é da {empresa}. Seu pedido ({produtos}) chegou tudo certo? Qualquer ajuste, é só me falar.',
  },
  percepcao: {
    roteiro: [
      'Pergunte a nota de 0 a 10 e o motivo.',
      'Faça pelo menos 3 das perguntas de percepção (P1 a P5).',
      'Pergunte quando deve repor os itens e anote a data.',
    ],
    mensagem:
      'Olá, {nome}! Aqui é da {empresa}. De 0 a 10, quanto você recomendaria a {empresa} a um amigo ou colega? Pode me contar o motivo da sua nota?',
  },
  alerta: {
    roteiro: [
      'Pergunte se ficou alguma necessidade em aberto.',
      'Entenda se mudou de fornecedor e por quê.',
      'Combine o próximo contato ou repasse para a vendedora.',
    ],
    mensagem:
      'Olá, {nome}! Aqui é da {empresa}. Faz um tempinho desde o seu último pedido. Está precisando de algo? Posso te ajudar.',
  },
  recuperacao: {
    roteiro: [
      'Pergunte com carinho o que aconteceu desde a última compra.',
      'Registre o motivo da saída, se houver.',
      'Ofereça retomar o atendimento e repasse à vendedora se houver interesse.',
    ],
    mensagem:
      'Olá, {nome}! Aqui é da {empresa}. Sentimos sua falta! Aconteceu algo que podemos melhorar? Adoraríamos voltar a atender você.',
  },
}
