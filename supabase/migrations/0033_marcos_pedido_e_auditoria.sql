-- Marcos do funil de pedidos (aba Produtividade) + correção da auditoria de
-- oportunidades, tarefas e clientes.
--
-- Rodar no SQL Editor do Supabase, o arquivo INTEIRO numa única execução.
-- Idempotente: seguro rodar de novo. A última consulta do arquivo lista os
-- gatilhos das tabelas corrigidas — confira que aparecem todos (ver seção 3).

-- =====================================================================
-- 1) fn_pedidos_marcos — por pedido da empresa, a PRIMEIRA vez que ele
-- chegou a cada etapa do funil OU A UMA POSTERIOR, reconstruída do
-- audit_log:
--   cotado_em   = 1ª vez em PEDIDO_COTADO, APROVADO_CLIENTE, PEDIDO_EFETUADO ou ENTREGUE
--   aprovado_em = 1ª vez em APROVADO_CLIENTE, PEDIDO_EFETUADO ou ENTREGUE
--   efetuado_em = 1ª vez em PEDIDO_EFETUADO ou ENTREGUE
--   entregue_em = 1ª vez em ENTREGUE
-- "Ou posterior" faz o funil nunca encolher: um pedido entregue conta
-- também como efetuado/aprovado/cotado, mesmo que tenha pulado etapa
-- (o gestor move em qualquer direção; o orçamento direto já nasce em
-- PEDIDO_COTADO). O status atual não serve porque o job de 7 dias arquiva
-- pedidos em qualquer etapa.
-- security definer porque audit_log só é legível por compras/gestor (RLS) e
-- o comercial também usa a aba — a função expõe só o id e as 4 datas.
-- =====================================================================
create or replace function public.fn_pedidos_marcos(p_empresa_id uuid)
returns table (
  pedido_id uuid,
  cotado_em timestamptz,
  aprovado_em timestamptz,
  efetuado_em timestamptz,
  entregue_em timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    a.registro_id as pedido_id,
    min(a.data_hora) as cotado_em,
    min(a.data_hora) filter (
      where a.dados_depois->>'status' in ('APROVADO_CLIENTE', 'PEDIDO_EFETUADO', 'ENTREGUE')
    ) as aprovado_em,
    min(a.data_hora) filter (
      where a.dados_depois->>'status' in ('PEDIDO_EFETUADO', 'ENTREGUE')
    ) as efetuado_em,
    min(a.data_hora) filter (
      where a.dados_depois->>'status' = 'ENTREGUE'
    ) as entregue_em
  from audit_log a
  join pedidos p on p.id = a.registro_id
  where auth.uid() is not null
    and a.tabela = 'pedidos'
    and p.empresa_id = p_empresa_id
    and a.dados_depois->>'status' in ('PEDIDO_COTADO', 'APROVADO_CLIENTE', 'PEDIDO_EFETUADO', 'ENTREGUE')
  group by a.registro_id
  order by a.registro_id
$$;

revoke all on function public.fn_pedidos_marcos(uuid) from public, anon;
grant execute on function public.fn_pedidos_marcos(uuid) to authenticated;

-- fn_pedidos_efetuados (migração 0032) passa a derivar da função nova —
-- mesma assinatura e mesmo resultado, nada que a usa quebra.
create or replace function public.fn_pedidos_efetuados(p_empresa_id uuid)
returns table (pedido_id uuid, efetuado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select m.pedido_id, m.efetuado_em
    from fn_pedidos_marcos(p_empresa_id) m
   where m.efetuado_em is not null
   order by m.pedido_id
$$;

revoke all on function public.fn_pedidos_efetuados(uuid) from public, anon;
grant execute on function public.fn_pedidos_efetuados(uuid) to authenticated;

-- =====================================================================
-- 2) Correção dos gatilhos de oportunidades, tarefas e clientes.
--
-- DIAGNÓSTICO (25/09/2026): a migração 0004 declarava em `oportunidades`
-- dois gatilhos — trg_oportunidade_movimentada (atualiza
-- ultima_movimentacao/movido_por ao mudar o status) e
-- trg_audit_oportunidades — e NENHUM dos dois existe no banco:
--   - as 25 oportunidades existentes foram inseridas sem gerar nenhuma linha
--     em audit_log (um gatilho "after insert" dispara em todo insert);
--   - as 11 PERDIDAS chegaram lá por UPDATE (MarcarOportunidadePerdida
--     Section) e mesmo assim ficaram com movido_por nulo e
--     ultima_movimentacao = criado_em.
-- fn_audit em si funciona (metas_comerciais, da 0032, audita normalmente),
-- então não é falha da função: os gatilhos simplesmente nunca foram
-- criados. Causa mais provável: as tabelas foram criadas pelo bloco SQL da
-- Fase 31 no CLAUDE.md (só create table + RLS, sem gatilhos), e o arquivo
-- 0004 nunca rodou por inteiro — e, se rodou, o "create table if not
-- exists" dele não mudaria nada numa tabela já existente. Mesmo sintoma em
-- `clientes` (0009 declara trg_audit_clientes; zero linhas em audit_log).
-- `tarefas` nunca teve gatilho de auditoria declarado.
--
-- Para não repetir o erro: este arquivo recria os gatilhos de forma
-- idempotente (drop if exists + create) e TERMINA com uma consulta ao
-- catálogo listando os gatilhos criados — o resultado aparece no SQL Editor
-- na hora, sem depender de alguém lembrar de conferir depois.
--
-- DADOS HISTÓRICOS: nada anterior a esta correção é reconstruído.
-- Oportunidades e tarefas criadas/alteradas antes dela não têm histórico em
-- audit_log, e oportunidades já movidas antes dela continuam com
-- ultima_movimentacao/movido_por desatualizados. Para esse período, a aba
-- Produtividade segue com aproximações: data prevista (ou de criação) para
-- as tarefas, situação atual, e ultima_movimentacao como data de GANHO. Só
-- a partir desta correção as datas ficam exatas.
-- =====================================================================

-- 2a) oportunidades: movimentação (ultima_movimentacao/movido_por)
create or replace function public.fn_oportunidade_movimentada()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.ultima_movimentacao := now();
    new.movido_por := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_oportunidade_movimentada on public.oportunidades;
create trigger trg_oportunidade_movimentada
  before update on public.oportunidades
  for each row execute function public.fn_oportunidade_movimentada();

-- 2b) auditoria (fn_audit genérica, a mesma de pedidos/itens/cotações)
drop trigger if exists trg_audit_oportunidades on public.oportunidades;
create trigger trg_audit_oportunidades
  after insert or update on public.oportunidades
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_tarefas on public.tarefas;
create trigger trg_audit_tarefas
  after insert or update on public.tarefas
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_clientes on public.clientes;
create trigger trg_audit_clientes
  after insert or update on public.clientes
  for each row execute function public.fn_audit();

-- `chamadas` (0017) tem o mesmo problema, mas fica de fora de propósito: o
-- sync do Mobcall roda a cada 15 min com upsert, e auditar cada chamada
-- regravada encheria o audit_log sem ganho — decisão separada.

-- =====================================================================
-- 3) Conferência: deve listar 5 linhas —
--   clientes      trg_audit_clientes
--   oportunidades trg_audit_oportunidades
--   oportunidades trg_oportunidade_movimentada
--   pedidos       trg_audit_pedidos        (já existia, referência)
--   tarefas       trg_audit_tarefas
-- =====================================================================
select c.relname as tabela, t.tgname as gatilho, t.tgenabled as habilitado
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and not t.tgisinternal
   and t.tgname in (
     'trg_oportunidade_movimentada',
     'trg_audit_oportunidades',
     'trg_audit_tarefas',
     'trg_audit_clientes',
     'trg_audit_pedidos'
   )
 order by 1, 2;
