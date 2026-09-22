-- Motor de Recompra Preditiva — estende pra rodar também na MATSEG, não só
-- RHOCAL. Adiciona empresa_id em 4 tabelas (pedidos_itens_historico,
-- recompra_previsao, itens_associados, recompra_pedidos_pulados — esta
-- última não estava na lista original, mas tem exatamente o mesmo risco de
-- colisão: onConflict "pedido_omie_id" sozinho, sem empresa_id, e RHOCAL/
-- MATSEG são apps Omie separados com numeração de pedido própria).
--
-- sync_estado NÃO ganha empresa_id — a chave já é uma string livre, o
-- código passa a prefixá-la por empresa (ex: "recompra_pagina_atual_matseg"
-- em vez de "recompra_pagina_atual"). Nada a migrar aqui: chaves antigas
-- (sem sufixo) ficam órfãs e inofensivas, tabela pequena.
--
-- Idempotente: seguro rodar de novo.

-- =====================================================================
-- Função auxiliar temporária: acha (e derruba) qualquer índice/constraint
-- único existente cujo CONJUNTO de colunas bata exatamente com o
-- informado — independente de ter sido declarado como "unique(...)"
-- nomeado ou um "create unique index" solto. Evita depender de adivinhar o
-- nome exato da constraint antiga (essas 4 tabelas foram criadas fora do
-- controle de migrations deste repo). Removida no fim deste arquivo.
-- =====================================================================
create or replace function public._migracao_0031_drop_unique_por_colunas(
  p_tabela text,
  p_colunas text[]
) returns void language plpgsql as $$
declare
  v_indexname text;
  v_conname text;
begin
  select i.relname into v_indexname
  from pg_index idx
  join pg_class i on i.oid = idx.indexrelid
  join pg_class t on t.oid = idx.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = p_tabela
    and idx.indisunique
    and (
      select array_agg(a.attname order by a.attname)
      from unnest(idx.indkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
    ) = (select array_agg(c order by c) from unnest(p_colunas) as c)
  limit 1;

  if v_indexname is null then
    raise notice '[migração 0031] nenhum índice único em %(%) — nada a remover', p_tabela, array_to_string(p_colunas, ',');
    return;
  end if;

  select c.conname into v_conname
  from pg_constraint c
  join pg_class i on i.oid = c.conindid
  where i.relname = v_indexname;

  if v_conname is not null then
    execute format('alter table public.%I drop constraint %I', p_tabela, v_conname);
    raise notice '[migração 0031] constraint % removida de %', v_conname, p_tabela;
  else
    execute format('drop index public.%I', v_indexname);
    raise notice '[migração 0031] índice % removido de %', v_indexname, p_tabela;
  end if;
end;
$$;

-- =====================================================================
-- 1) pedidos_itens_historico
-- =====================================================================
alter table public.pedidos_itens_historico add column if not exists empresa_id uuid references public.empresas(id);

update public.pedidos_itens_historico
   set empresa_id = (select id from public.empresas where slug = 'rhocal')
 where empresa_id is null;

alter table public.pedidos_itens_historico alter column empresa_id set not null;

select public._migracao_0031_drop_unique_por_colunas('pedidos_itens_historico', array['pedido_omie_id', 'item_codigo']);

create unique index if not exists pedidos_itens_historico_empresa_pedido_item_key
  on public.pedidos_itens_historico (empresa_id, pedido_omie_id, item_codigo);

-- =====================================================================
-- 2) recompra_previsao
-- =====================================================================
alter table public.recompra_previsao add column if not exists empresa_id uuid references public.empresas(id);

update public.recompra_previsao
   set empresa_id = (select id from public.empresas where slug = 'rhocal')
 where empresa_id is null;

alter table public.recompra_previsao alter column empresa_id set not null;

select public._migracao_0031_drop_unique_por_colunas('recompra_previsao', array['cliente_omie_codigo', 'item_codigo']);

create unique index if not exists recompra_previsao_empresa_cliente_item_key
  on public.recompra_previsao (empresa_id, cliente_omie_codigo, item_codigo);

-- Recria a view (não muda a lógica — mesmo texto da migração 0019) só pra
-- ela pegar a coluna empresa_id: "select *" em uma view fica CONGELADO no
-- momento da criação/replace, não acompanha coluna nova adicionada depois
-- na tabela por baixo.
create or replace view public.v_recompra_priorizada as
select *
from public.recompra_previsao
where status in ('pendente', 'contatado')
  and data_ultima_compra::date >= (now() - interval '180 days')::date
order by ca_vencendo desc, data_prevista_recompra asc nulls last;

-- =====================================================================
-- 3) itens_associados
-- =====================================================================
alter table public.itens_associados add column if not exists empresa_id uuid references public.empresas(id);

update public.itens_associados
   set empresa_id = (select id from public.empresas where slug = 'rhocal')
 where empresa_id is null;

alter table public.itens_associados alter column empresa_id set not null;

select public._migracao_0031_drop_unique_por_colunas('itens_associados', array['item_codigo_principal', 'item_codigo_associado']);

create unique index if not exists itens_associados_empresa_principal_associado_key
  on public.itens_associados (empresa_id, item_codigo_principal, item_codigo_associado);

-- =====================================================================
-- 4) recompra_pedidos_pulados — não estava na lista original, achado ao
-- ler pedidos-pulados.ts: mesmo padrão de risco (onConflict só por
-- pedido_omie_id, sem empresa_id) — sem esta correção, um código de pedido
-- MATSEG que colidisse com um já pulado da RHOCAL nunca seria processado.
-- =====================================================================
alter table public.recompra_pedidos_pulados add column if not exists empresa_id uuid references public.empresas(id);

update public.recompra_pedidos_pulados
   set empresa_id = (select id from public.empresas where slug = 'rhocal')
 where empresa_id is null;

alter table public.recompra_pedidos_pulados alter column empresa_id set not null;

select public._migracao_0031_drop_unique_por_colunas('recompra_pedidos_pulados', array['pedido_omie_id']);

create unique index if not exists recompra_pedidos_pulados_empresa_pedido_key
  on public.recompra_pedidos_pulados (empresa_id, pedido_omie_id);

-- =====================================================================
-- limpeza
-- =====================================================================
drop function public._migracao_0031_drop_unique_por_colunas(text, text[]);
