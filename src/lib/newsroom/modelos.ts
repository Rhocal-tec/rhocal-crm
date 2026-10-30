import type { Exibicao, TipoComunicado } from './tipos'

export interface ModeloComunicado {
  id: string
  nome: string
  titulo: string
  corpo: string
  tipo: TipoComunicado
  exibicao: Exibicao
  exige_confirmacao: boolean
}

export const MODELOS: ModeloComunicado[] = [
  {
    id: 'reuniao',
    nome: 'Aviso de reunião',
    titulo: 'Reunião da equipe',
    corpo: '{nome}, teremos reunião em [DATA] às [HORA] — [LOCAL/LINK]. Pauta:\n- [ponto 1]\n- [ponto 2]\nPresença importante!',
    tipo: 'aviso',
    exibicao: 'popup',
    exige_confirmacao: true,
  },
  {
    id: 'novidade-crm',
    nome: 'Novidade do CRM',
    titulo: 'Novidade no CRM RHOCAL',
    corpo: 'Olá, {nome}! Atualizamos o CRM:\n- [o que mudou 1]\n- [o que mudou 2]\nAtualize a página (Ctrl+F5) para ver. Dúvidas, fale com a gestão.',
    tipo: 'novidade',
    exibicao: 'popup',
    exige_confirmacao: false,
  },
  {
    id: 'meta-semana',
    nome: 'Meta da semana',
    titulo: 'Meta da semana',
    corpo: 'Time {setor}, a meta desta semana é [META]. Foco em:\n- [prioridade 1]\n- [prioridade 2]\nVamos juntos!',
    tipo: 'aviso',
    exibicao: 'faixa',
    exige_confirmacao: false,
  },
  {
    id: 'urgente',
    nome: 'Comunicado urgente',
    titulo: 'ATENÇÃO — comunicado urgente',
    corpo: '{nome}, leia com atenção: [MENSAGEM]. Confirme que entendeu.',
    tipo: 'urgente',
    exibicao: 'popup',
    exige_confirmacao: true,
  },
  {
    id: 'parabens',
    nome: 'Parabéns / reconhecimento',
    titulo: 'Parabéns, [NOME]! 🎉',
    corpo: 'Reconhecimento da semana: [NOME] por [MOTIVO]. Orgulho de ter você no time!',
    tipo: 'comemoracao',
    exibicao: 'mural',
    exige_confirmacao: false,
  },
]
