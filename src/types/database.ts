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

export type EmpresaSlug = 'rhocal' | 'matseg'

// Etapas do funil de Oportunidades/Prospecção (fase 31). Coluna `status` é
// `text` no banco (não enum), pois o mapeamento para as Fases do Processo do
// Omie ainda depende de investigação por conta — ver CLAUDE.md fase 31.
export type OportunidadeStatus =
  | 'NOVO_LEAD'
  | 'EM_CONTATO'
  | 'QUALIFICADO'
  | 'PROPOSTA'
  | 'GANHO'
  | 'PERDIDO'

// `situacao` é text livre no banco (mesmo padrão de AuditAcao). Fase 39
// adicionou 'Em Execução' como terceiro estado (vindo do cEmExecucao do
// ListarTarefas) — só 'Realizada' desvia o card para a coluna Concluídas.
export type TarefaSituacao = 'Pendente' | 'Em Execução' | 'Realizada' | string

// Motor de Recompra Preditiva. `status` é text livre no banco (mesmo padrão
// de TarefaSituacao/AuditAcao) — os quatro valores usados pela aplicação são
// 'pendente' (default do job), 'contatado', 'convertido' e 'nao_converteu'.
export type RecompraStatus = 'pendente' | 'contatado' | 'convertido' | 'nao_converteu' | string
export type RecompraConfiabilidade = 'alta' | 'media' | 'baixa'
export type RecompraOrigemCalculo = 'historico' | 'fallback_categoria'

// Histórico de campanhas (fase 36.3). `status` tem check constraint no banco
// — só esses 3 valores.
export type CampanhaClienteStatus = 'enviado' | 'convertido' | 'nao_convertido'

export interface Database {
  public: {
    Tables: {
      empresas: {
        Row: {
          id: string
          slug: string
          nome_fantasia: string
          razao_social: string
          cnpj: string
          ie: string | null
          endereco: string
          telefone: string
          logo_path: string
          cor_primaria: string
          cor_secundaria: string | null
          criado_em: string
        }
        Insert: {
          id?: string
          slug: string
          nome_fantasia: string
          razao_social: string
          cnpj: string
          ie?: string | null
          endereco: string
          telefone: string
          logo_path: string
          cor_primaria: string
          cor_secundaria?: string | null
          criado_em?: string
        }
        Update: {
          id?: string
          slug?: string
          nome_fantasia?: string
          razao_social?: string
          cnpj?: string
          ie?: string | null
          endereco?: string
          telefone?: string
          logo_path?: string
          cor_primaria?: string
          cor_secundaria?: string | null
          criado_em?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          nome: string
          setor: SetorTipo
          vendedor_omie_id: string | null
          criado_em: string
        }
        Insert: {
          id: string
          nome: string
          setor: SetorTipo
          vendedor_omie_id?: string | null
          criado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          setor?: SetorTipo
          vendedor_omie_id?: string | null
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
          empresa_id: string | null
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
          empresa_id?: string | null
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
          empresa_id?: string | null
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
      oportunidades: {
        Row: {
          id: string
          numero: number
          empresa_id: string
          cliente_nome: string
          cliente_cnpj: string | null
          cliente_telefone: string | null
          cliente_contato: string | null
          origem: string | null
          temperatura: string | null
          valor_estimado: number | null
          status: OportunidadeStatus
          motivo_perda: string | null
          omie_oportunidade_id: number | null
          omie_fase_bruta: string | null
          pedido_id: string | null
          previsao_fechamento: string | null
          contato_nome: string | null
          contato_cargo: string | null
          contato_email: string | null
          produto_servico: string | null
          concorrentes: string | null
          criado_por: string
          criado_em: string
          ultima_movimentacao: string
          movido_por: string | null
        }
        Insert: {
          id?: string
          numero?: number
          empresa_id: string
          cliente_nome: string
          cliente_cnpj?: string | null
          cliente_telefone?: string | null
          cliente_contato?: string | null
          origem?: string | null
          temperatura?: string | null
          valor_estimado?: number | null
          status?: OportunidadeStatus
          motivo_perda?: string | null
          omie_oportunidade_id?: number | null
          omie_fase_bruta?: string | null
          pedido_id?: string | null
          previsao_fechamento?: string | null
          contato_nome?: string | null
          contato_cargo?: string | null
          contato_email?: string | null
          produto_servico?: string | null
          concorrentes?: string | null
          criado_por: string
          criado_em?: string
          ultima_movimentacao?: string
          movido_por?: string | null
        }
        Update: {
          id?: string
          numero?: number
          empresa_id?: string
          cliente_nome?: string
          cliente_cnpj?: string | null
          cliente_telefone?: string | null
          cliente_contato?: string | null
          origem?: string | null
          temperatura?: string | null
          valor_estimado?: number | null
          status?: OportunidadeStatus
          motivo_perda?: string | null
          omie_oportunidade_id?: number | null
          omie_fase_bruta?: string | null
          pedido_id?: string | null
          previsao_fechamento?: string | null
          contato_nome?: string | null
          contato_cargo?: string | null
          contato_email?: string | null
          produto_servico?: string | null
          concorrentes?: string | null
          criado_por?: string
          criado_em?: string
          ultima_movimentacao?: string
          movido_por?: string | null
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          id: string
          oportunidade_id: string | null
          pedido_id: string | null
          descricao: string
          responsavel: string | null
          data_prevista: string | null
          hora_prevista: string | null
          concluida: boolean
          tipo: string | null
          situacao: TarefaSituacao
          importante: boolean
          urgente: boolean
          omie_tarefa_id: number | null
          empresa_id: string | null
          descricao_completa_omie: string | null
          criado_por: string
          criado_em: string
        }
        Insert: {
          id?: string
          oportunidade_id?: string | null
          pedido_id?: string | null
          descricao: string
          responsavel?: string | null
          data_prevista?: string | null
          hora_prevista?: string | null
          concluida?: boolean
          tipo?: string | null
          situacao?: TarefaSituacao
          importante?: boolean
          urgente?: boolean
          omie_tarefa_id?: number | null
          empresa_id?: string | null
          descricao_completa_omie?: string | null
          criado_por: string
          criado_em?: string
        }
        Update: {
          id?: string
          oportunidade_id?: string | null
          pedido_id?: string | null
          descricao?: string
          responsavel?: string | null
          data_prevista?: string | null
          hora_prevista?: string | null
          concluida?: boolean
          tipo?: string | null
          situacao?: TarefaSituacao
          importante?: boolean
          urgente?: boolean
          omie_tarefa_id?: number | null
          empresa_id?: string | null
          descricao_completa_omie?: string | null
          criado_por?: string
          criado_em?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          id: string
          razao_social: string
          nome_fantasia: string | null
          cnpj: string | null
          telefone: string | null
          contato: string | null
          email: string | null
          endereco: string | null
          endereco_numero: string | null
          bairro: string | null
          cidade: string | null
          estado: string | null
          cep: string | null
          observacoes: string | null
          omie_cliente_id: number | null
          criado_por: string | null
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id?: string
          razao_social: string
          nome_fantasia?: string | null
          cnpj?: string | null
          telefone?: string | null
          contato?: string | null
          email?: string | null
          endereco?: string | null
          endereco_numero?: string | null
          bairro?: string | null
          cidade?: string | null
          estado?: string | null
          cep?: string | null
          observacoes?: string | null
          omie_cliente_id?: number | null
          criado_por?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          razao_social?: string
          nome_fantasia?: string | null
          cnpj?: string | null
          telefone?: string | null
          contato?: string | null
          email?: string | null
          endereco?: string | null
          endereco_numero?: string | null
          bairro?: string | null
          cidade?: string | null
          estado?: string | null
          cep?: string | null
          observacoes?: string | null
          omie_cliente_id?: number | null
          criado_por?: string | null
          criado_em?: string
          atualizado_em?: string
        }
        Relationships: []
      }
      interacoes: {
        Row: {
          id: string
          oportunidade_id: string | null
          pedido_id: string | null
          tipo: string
          resultado: string
          observacao: string | null
          registrado_por: string
          criado_em: string
        }
        Insert: {
          id?: string
          oportunidade_id?: string | null
          pedido_id?: string | null
          tipo: string
          resultado: string
          observacao?: string | null
          registrado_por: string
          criado_em?: string
        }
        Update: {
          id?: string
          oportunidade_id?: string | null
          pedido_id?: string | null
          tipo?: string
          resultado?: string
          observacao?: string | null
          registrado_por?: string
          criado_em?: string
        }
        Relationships: []
      }
      // Motor de Recompra Preditiva. Escrita real feita pelo job
      // (src/lib/recompra/sync-recompra-preditiva.ts), que roda fora deste
      // client tipado (usa @/lib/recompra/supabase-client, sem generic
      // Database, com a service role key) — aqui só o necessário pra
      // RecompraCard/HoraDeRecomprarTab lerem e atualizarem `status`,
      // `pedido_id`, `motivo_nao_conversao`.
      recompra_previsao: {
        Row: {
          id: string
          cliente_omie_codigo: string
          cliente_nome: string
          cliente_cnpj: string | null
          item_codigo: string
          item_nome: string
          categoria: string
          ca: string | null
          origem_calculo: RecompraOrigemCalculo
          intervalo_medio_dias: number | null
          consumo_diario: number | null
          data_ultima_compra: string
          quantidade_ultima_compra: number
          dias_ate_precisar: number
          data_prevista_recompra: string
          confiabilidade: RecompraConfiabilidade
          valor_unitario_medio: number
          valor_estimado_pedido: number
          vendedor_omie_id: string | null
          vendedor_nome: string | null
          status: RecompraStatus
          ca_vencendo: boolean
          ca_data_vencimento: string | null
          pedido_id: string | null
          motivo_nao_conversao: string | null
          texto_sugerido_ia: string | null
          atualizado_em: string
        }
        Insert: {
          id?: string
          cliente_omie_codigo: string
          cliente_nome: string
          cliente_cnpj?: string | null
          item_codigo: string
          item_nome: string
          categoria: string
          ca?: string | null
          origem_calculo: RecompraOrigemCalculo
          intervalo_medio_dias?: number | null
          consumo_diario?: number | null
          data_ultima_compra: string
          quantidade_ultima_compra: number
          dias_ate_precisar: number
          data_prevista_recompra: string
          confiabilidade: RecompraConfiabilidade
          valor_unitario_medio: number
          valor_estimado_pedido: number
          vendedor_omie_id?: string | null
          vendedor_nome?: string | null
          status?: RecompraStatus
          ca_vencendo?: boolean
          ca_data_vencimento?: string | null
          pedido_id?: string | null
          motivo_nao_conversao?: string | null
          texto_sugerido_ia?: string | null
          atualizado_em?: string
        }
        Update: {
          id?: string
          cliente_omie_codigo?: string
          cliente_nome?: string
          cliente_cnpj?: string | null
          item_codigo?: string
          item_nome?: string
          categoria?: string
          ca?: string | null
          origem_calculo?: RecompraOrigemCalculo
          intervalo_medio_dias?: number | null
          consumo_diario?: number | null
          data_ultima_compra?: string
          quantidade_ultima_compra?: number
          dias_ate_precisar?: number
          data_prevista_recompra?: string
          confiabilidade?: RecompraConfiabilidade
          valor_unitario_medio?: number
          valor_estimado_pedido?: number
          vendedor_omie_id?: string | null
          vendedor_nome?: string | null
          status?: RecompraStatus
          ca_vencendo?: boolean
          ca_data_vencimento?: string | null
          pedido_id?: string | null
          motivo_nao_conversao?: string | null
          texto_sugerido_ia?: string | null
          atualizado_em?: string
        }
        Relationships: []
      }
      itens_associados: {
        Row: {
          item_codigo_principal: string
          item_codigo_associado: string
          nome_associado: string
          vezes_juntos: number
          total_pedidos_com_principal: number
          frequencia_conjunta: number
          atualizado_em: string
        }
        Insert: {
          item_codigo_principal: string
          item_codigo_associado: string
          nome_associado: string
          vezes_juntos: number
          total_pedidos_com_principal: number
          frequencia_conjunta: number
          atualizado_em?: string
        }
        Update: {
          item_codigo_principal?: string
          item_codigo_associado?: string
          nome_associado?: string
          vezes_juntos?: number
          total_pedidos_com_principal?: number
          frequencia_conjunta?: number
          atualizado_em?: string
        }
        Relationships: []
      }
      campanhas: {
        Row: {
          id: string
          empresa_id: string
          nome: string
          descricao: string | null
          filtros_aplicados: Record<string, unknown> | null
          total_clientes: number
          criado_por: string
          criado_em: string
        }
        Insert: {
          id?: string
          empresa_id: string
          nome: string
          descricao?: string | null
          filtros_aplicados?: Record<string, unknown> | null
          total_clientes: number
          criado_por: string
          criado_em?: string
        }
        Update: {
          id?: string
          empresa_id?: string
          nome?: string
          descricao?: string | null
          filtros_aplicados?: Record<string, unknown> | null
          total_clientes?: number
          criado_por?: string
          criado_em?: string
        }
        Relationships: []
      }
      campanha_clientes: {
        Row: {
          id: string
          campanha_id: string
          cliente_omie_codigo: string | null
          cliente_nome: string
          cliente_cnpj: string | null
          status: CampanhaClienteStatus
          convertido_em: string | null
          pedido_id: string | null
        }
        Insert: {
          id?: string
          campanha_id: string
          cliente_omie_codigo?: string | null
          cliente_nome: string
          cliente_cnpj?: string | null
          status?: CampanhaClienteStatus
          convertido_em?: string | null
          pedido_id?: string | null
        }
        Update: {
          id?: string
          campanha_id?: string
          cliente_omie_codigo?: string | null
          cliente_nome?: string
          cliente_cnpj?: string | null
          status?: CampanhaClienteStatus
          convertido_em?: string | null
          pedido_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_recompra_priorizada: {
        Row: {
          id: string
          cliente_omie_codigo: string
          cliente_nome: string
          cliente_cnpj: string | null
          item_codigo: string
          item_nome: string
          categoria: string
          ca: string | null
          origem_calculo: RecompraOrigemCalculo
          intervalo_medio_dias: number | null
          consumo_diario: number | null
          data_ultima_compra: string
          quantidade_ultima_compra: number
          dias_ate_precisar: number
          data_prevista_recompra: string
          confiabilidade: RecompraConfiabilidade
          valor_unitario_medio: number
          valor_estimado_pedido: number
          vendedor_omie_id: string | null
          vendedor_nome: string | null
          status: RecompraStatus
          ca_vencendo: boolean
          ca_data_vencimento: string | null
          pedido_id: string | null
          motivo_nao_conversao: string | null
          texto_sugerido_ia: string | null
          atualizado_em: string
        }
        Relationships: []
      }
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
