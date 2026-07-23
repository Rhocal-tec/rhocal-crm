// Tipos do banco RHOCAL CRM — espelham o schema definido no CLAUDE.md.
// Regenerar com `supabase gen types typescript` quando o schema mudar.

export type SetorTipo = 'compras' | 'comercial' | 'gestor'

export type PedidoStatus =
  | 'PEDIDO'
  | 'EM_COTACAO'
  | 'PEDIDO_COTADO'
  | 'APROVADO_CLIENTE'
  | 'PEDIDO_EFETUADO'
  | 'ARQUIVADO'
  | 'PERDIDO'

export type ArquivoMotivo = 'manual' | 'inatividade'

export type AuditAcao = 'criou' | 'alterou' | 'moveu' | 'arquivou_auto' | string

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          nome: string
          setor: SetorTipo
          criado_em: string
        }
        Insert: {
          id: string
          nome: string
          setor: SetorTipo
          criado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          setor?: SetorTipo
          criado_em?: string
        }
        Relationships: []
      }
      pedidos: {
        Row: {
          id: string
          numero: number
          cliente_nome: string
          cliente_omie_id: number | null
          cliente_telefone: string | null
          cliente_contato: string | null
          cliente_cnpj: string | null
          valor_frete: number
          modo_faturamento: string | null
          status: PedidoStatus
          previsao_chegada: string | null
          data_entrega_cliente: string | null
          data_entrega_real: string | null
          dados_compra: string | null
          omie_orcamento_id: number | null
          arquivado_motivo: ArquivoMotivo | null
          motivo_perda: string | null
          orcamento_direto: boolean
          omie_convertido_pedido: boolean
          criado_por: string
          criado_em: string
          ultima_movimentacao: string
          movido_por: string | null
        }
        Insert: {
          id?: string
          numero?: number
          cliente_nome: string
          cliente_omie_id?: number | null
          cliente_telefone?: string | null
          cliente_contato?: string | null
          cliente_cnpj?: string | null
          valor_frete?: number
          modo_faturamento?: string | null
          status?: PedidoStatus
          previsao_chegada?: string | null
          data_entrega_cliente?: string | null
          data_entrega_real?: string | null
          dados_compra?: string | null
          omie_orcamento_id?: number | null
          arquivado_motivo?: ArquivoMotivo | null
          motivo_perda?: string | null
          orcamento_direto?: boolean
          omie_convertido_pedido?: boolean
          criado_por: string
          criado_em?: string
          ultima_movimentacao?: string
          movido_por?: string | null
        }
        Update: {
          id?: string
          numero?: number
          cliente_nome?: string
          cliente_omie_id?: number | null
          cliente_telefone?: string | null
          cliente_contato?: string | null
          cliente_cnpj?: string | null
          valor_frete?: number
          modo_faturamento?: string | null
          status?: PedidoStatus
          previsao_chegada?: string | null
          data_entrega_cliente?: string | null
          data_entrega_real?: string | null
          dados_compra?: string | null
          omie_orcamento_id?: number | null
          arquivado_motivo?: ArquivoMotivo | null
          motivo_perda?: string | null
          orcamento_direto?: boolean
          omie_convertido_pedido?: boolean
          criado_por?: string
          criado_em?: string
          ultima_movimentacao?: string
          movido_por?: string | null
        }
        Relationships: []
      }
      pedido_itens: {
        Row: {
          id: string
          pedido_id: string
          descricao: string
          quantidade: number
          ca: string | null
          observacao: string | null
          tamanho: string | null
          numero: string | null
          cor: string | null
          custo_final: number | null
          margem_pct: number | null
          preco_venda: number | null
          codigo_produto_omie: number | null
          em_estoque: boolean
          criado_em: string
        }
        Insert: {
          id?: string
          pedido_id: string
          descricao: string
          quantidade?: number
          ca?: string | null
          observacao?: string | null
          tamanho?: string | null
          numero?: string | null
          cor?: string | null
          custo_final?: number | null
          margem_pct?: number | null
          preco_venda?: number | null
          codigo_produto_omie?: number | null
          em_estoque?: boolean
          criado_em?: string
        }
        Update: {
          id?: string
          pedido_id?: string
          descricao?: string
          quantidade?: number
          ca?: string | null
          observacao?: string | null
          tamanho?: string | null
          numero?: string | null
          cor?: string | null
          custo_final?: number | null
          margem_pct?: number | null
          preco_venda?: number | null
          codigo_produto_omie?: number | null
          em_estoque?: boolean
          criado_em?: string
        }
        Relationships: []
      }
      cotacoes: {
        Row: {
          id: string
          item_id: string
          fornecedor: string
          preco: number
          data_cotacao: string
          validade_cotacao: string
          previsao_chegada: string | null
          vencedora: boolean
          empresa_faturou: string | null
          criado_por: string
          criado_em: string
        }
        Insert: {
          id?: string
          item_id: string
          fornecedor: string
          preco: number
          data_cotacao?: string
          validade_cotacao: string
          previsao_chegada?: string | null
          vencedora?: boolean
          empresa_faturou?: string | null
          criado_por: string
          criado_em?: string
        }
        Update: {
          id?: string
          item_id?: string
          fornecedor?: string
          preco?: number
          data_cotacao?: string
          validade_cotacao?: string
          previsao_chegada?: string | null
          vencedora?: boolean
          empresa_faturou?: string | null
          criado_por?: string
          criado_em?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: number
          tabela: string
          registro_id: string
          acao: AuditAcao
          dados_antes: Record<string, unknown> | null
          dados_depois: Record<string, unknown> | null
          colaborador: string | null
          data_hora: string
        }
        Insert: {
          id?: number
          tabela: string
          registro_id: string
          acao: AuditAcao
          dados_antes?: Record<string, unknown> | null
          dados_depois?: Record<string, unknown> | null
          colaborador?: string | null
          data_hora?: string
        }
        Update: never
        Relationships: []
      }
      error_log: {
        Row: {
          id: number
          rota: string
          mensagem: string
          pedido_id: string | null
          colaborador: string | null
          data_hora: string
        }
        Insert: {
          id?: number
          rota: string
          mensagem: string
          pedido_id?: string | null
          colaborador?: string | null
          data_hora?: string
        }
        Update: never
        Relationships: []
      }
    }
    Views: {
      vw_historico_ca: {
        Row: {
          ca: string | null
          descricao: string | null
          pedido_numero: number | null
          cliente_nome: string | null
          fornecedor: string | null
          preco: number | null
          data_cotacao: string | null
          validade_cotacao: string | null
          vencedora: boolean | null
          empresa_faturou: string | null
          custo_final: number | null
          status: PedidoStatus | null
          pedido_criado_em: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      meu_setor: {
        Args: Record<string, never>
        Returns: SetorTipo
      }
    }
    Enums: {
      setor_tipo: SetorTipo
      pedido_status: PedidoStatus
      arquivo_motivo: ArquivoMotivo
    }
  }
}
