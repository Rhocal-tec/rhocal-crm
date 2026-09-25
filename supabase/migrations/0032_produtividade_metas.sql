-- Aba Produtividade — metas comerciais mensais + data de efetuação por pedido.
--
-- Rodar no SQL Editor do Supabase antes do deploy (mesmo padrão das
-- migrações anteriores). Idempotente: seguro rodar de novo.

-- =====================================================================
-- 1) metas_comerciais
-- Uma linha por empresa + mês + funcionário. funcionario_id nulo = meta
-- GLOBAL da empresa no mês (é só nela que dias_uteis_ajuste faz sentido —
-- o ajuste de feriado municipal/emenda vale pro mês da empresa inteira).
-- Unicidade em dois índices parciais (global / por funcionário): um unique
-- comum deixaria passar duas metas globais no mesmo mês por causa do null,
-- e "nulls not distinct" exigiria Postgres 15+.
-- Sem policy de delete (regra de ouro): "tirar" uma meta = gravar 0.
-- =====================================================================
create table if not exists public.metas_comerciais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  funcionario_id uuid references public.profiles(id),
  ano integer not null check (ano between 2020 and 2100),
  mes integer not null check (mes between 1 and 12),
  valor_meta numeric not null default 0 check (valor_meta >= 0),
  dias_uteis_ajuste integer check (dias_uteis_ajuste between 0 and 31),
  criado_por uuid not null references public.profiles(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint metas_comerciais_ajuste_so_global
    check (funcionario_id is null or dias_uteis_ajuste is null)
);

create unique index if not exists metas_comerciais_unica_global
  on public.metas_comerciais (empresa_id, ano, mes)
  where funcionario_id is null;
create unique index if not exists metas_comerciais_unica_funcionario
  on public.metas_comerciais (empresa_id, funcionario_id, ano, mes)
  where funcionario_id is not null;

create or replace function public.fn_metas_comerciais_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_metas_comerciais_atualizado_em on public.metas_comerciais;
create trigger trg_metas_comerciais_atualizado_em
  before update on public.metas_comerciais
  for each row execute function public.fn_metas_comerciais_atualizado_em();

-- Auditoria: mesma fn_audit genérica das outras tabelas.
drop trigger if exists trg_audit_metas_comerciais on public.metas_comerciais;
create trigger trg_audit_metas_comerciais
  after insert or update on public.metas_comerciais
  for each row execute function public.fn_audit();

alter table public.metas_comerciais enable row level security;

-- Leitura: todos os autenticados (comercial vê a própria meta e a global).
drop policy if exists "metas leitura" on public.metas_comerciais;
create policy "metas leitura" on public.metas_comerciais
  for select to authenticated using (true);

-- Escrita: só gestor, garantido no banco (não só escondendo a tela).
drop policy if exists "metas insert gestor" on public.metas_comerciais;
create policy "metas insert gestor" on public.metas_comerciais
  for insert to authenticated with check (meu_setor() = 'gestor');

drop policy if exists "metas update gestor" on public.metas_comerciais;
create policy "metas update gestor" on public.metas_comerciais
  for update to authenticated
  using (meu_setor() = 'gestor')
  with check (meu_setor() = 'gestor');

-- =====================================================================
-- 2) fn_pedidos_efetuados — primeira vez que cada pedido da empresa entrou
-- em PEDIDO_EFETUADO (ou ENTREGUE, caso alguém tenha pulado direto),
-- reconstruída do audit_log. É a base do "faturado" da aba Produtividade:
-- o status atual não serve porque o job de 7 dias arquiva pedidos já
-- efetuados. security definer porque audit_log só é legível por
-- compras/gestor (RLS) e o comercial também usa a aba — a função expõe só
-- (pedido_id, data), nada dos dados_antes/dados_depois.
-- =====================================================================
create or replace function public.fn_pedidos_efetuados(p_empresa_id uuid)
returns table (pedido_id uuid, efetuado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select a.registro_id as pedido_id, min(a.data_hora) as efetuado_em
    from audit_log a
    join pedidos p on p.id = a.registro_id
   where auth.uid() is not null
     and a.tabela = 'pedidos'
     and p.empresa_id = p_empresa_id
     and a.dados_depois->>'status' in ('PEDIDO_EFETUADO', 'ENTREGUE')
   group by a.registro_id
   order by a.registro_id
$$;

revoke all on function public.fn_pedidos_efetuados(uuid) from public, anon;
grant execute on function public.fn_pedidos_efetuados(uuid) to authenticated;
