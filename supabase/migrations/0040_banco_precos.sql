-- Banco de Preços (Compras): histórico de preços de fornecedores por item/CA.
-- Alimentado manualmente pelo comprador e, daqui pra frente, automaticamente a
-- cada cotação registrada. Compartilhado entre empresas. Sem delete (regra de ouro).

create table if not exists public.banco_precos (
  id uuid primary key default gen_random_uuid(),
  ca text,
  item_descricao text not null,
  fornecedor text not null,
  marca text,
  unidade text,
  preco numeric(14,2) not null check (preco >= 0),
  quantidade_minima numeric(14,3),
  frete numeric(14,2),
  condicao_pagamento text,
  prazo_entrega_dias integer,
  data_preco date not null default current_date,
  validade date,
  observacao text,
  origem text not null default 'manual' check (origem in ('manual', 'cotacao')),
  cotacao_id uuid unique,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);

create index if not exists banco_precos_ca_idx on public.banco_precos (ca);
create index if not exists banco_precos_data_idx on public.banco_precos (data_preco desc);
create index if not exists banco_precos_desc_idx on public.banco_precos (lower(item_descricao));

alter table public.banco_precos enable row level security;

drop policy if exists "banco_precos leitura" on public.banco_precos;
create policy "banco_precos leitura" on public.banco_precos
  for select to authenticated
  using (meu_setor() in ('compras', 'gestor'));

drop policy if exists "banco_precos insercao" on public.banco_precos;
create policy "banco_precos insercao" on public.banco_precos
  for insert to authenticated
  with check (meu_setor() in ('compras', 'gestor'));

drop policy if exists "banco_precos edicao" on public.banco_precos;
create policy "banco_precos edicao" on public.banco_precos
  for update to authenticated
  using (meu_setor() in ('compras', 'gestor'))
  with check (meu_setor() in ('compras', 'gestor'));

-- Alimentação automática a partir das cotações (só dali pra frente, sem backfill).
create or replace function public.fn_cotacao_para_banco_precos()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ca text;
  v_desc text;
begin
  select i.ca, i.descricao into v_ca, v_desc from pedido_itens i where i.id = new.item_id;
  if v_desc is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into banco_precos
      (ca, item_descricao, fornecedor, preco, data_preco, validade, origem, cotacao_id, criado_por)
    values
      (nullif(trim(v_ca), ''), v_desc, new.fornecedor, new.preco,
       new.data_cotacao::date, new.validade_cotacao::date, 'cotacao', new.id, new.criado_por)
    on conflict (cotacao_id) do nothing;
  else
    update banco_precos
       set fornecedor = new.fornecedor,
           preco = new.preco,
           validade = new.validade_cotacao::date
     where cotacao_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_cotacao_banco_precos on public.cotacoes;
create trigger trg_cotacao_banco_precos
after insert or update of preco, fornecedor, validade_cotacao on public.cotacoes
for each row execute function public.fn_cotacao_para_banco_precos();
