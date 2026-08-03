-- Fase 31: módulo de Oportunidades/Prospecção (funil anterior ao pedido) +
-- tabela de Tarefas (acompanhamento, usada por oportunidades e por pedidos).
-- Sincronização com o CRM do Omie fica de fora desta migração — a própria
-- especificação da Fase 31 exige investigar antes as Fases do Processo,
-- Origens e Motivos de Conclusão configurados em cada conta (RHOCAL/MATSEG).

create table if not exists public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  empresa_id uuid not null references public.empresas(id),
  cliente_nome text not null,
  cliente_cnpj text,
  cliente_telefone text,
  cliente_contato text,
  origem text,
  temperatura text,
  valor_estimado numeric,
  status text not null default 'NOVO_LEAD',
  motivo_perda text,
  omie_oportunidade_id bigint,
  pedido_id uuid references public.pedidos(id),
  criado_por uuid not null references public.profiles(id),
  criado_em timestamptz not null default now(),
  ultima_movimentacao timestamptz not null default now(),
  movido_por uuid references public.profiles(id)
);

alter table public.oportunidades enable row level security;

-- Mesmo padrão de pedidos/pedido_itens: RLS liberado para todo autenticado,
-- a separação por setor (compras não participa da pré-venda) é feita na
-- aplicação (nav/página), não no banco.
drop policy if exists "oportunidades leitura" on public.oportunidades;
create policy "oportunidades leitura"
  on public.oportunidades
  for select
  to authenticated
  using (true);

drop policy if exists "oportunidades escrita" on public.oportunidades;
create policy "oportunidades escrita"
  on public.oportunidades
  for all
  to authenticated
  using (true)
  with check (true);

-- Atualiza ultima_movimentacao/movido_por ao mudar o status do funil — mesmo
-- padrão de fn_pedido_movimentado (fase 17), aplicado à tabela oportunidades.
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

-- Auditoria: reaproveita fn_audit(), já genérica por tabela/registro_id.
drop trigger if exists trg_audit_oportunidades on public.oportunidades;
create trigger trg_audit_oportunidades
  after insert or update on public.oportunidades
  for each row execute function public.fn_audit();

-- ===== TAREFAS (acompanhamento — vale para oportunidades e para pedidos) =====
create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid references public.oportunidades(id),
  pedido_id uuid references public.pedidos(id),
  descricao text not null,
  responsavel uuid references public.profiles(id),
  data_prevista date,
  concluida boolean not null default false,
  criado_por uuid not null references public.profiles(id),
  criado_em timestamptz not null default now()
);

alter table public.tarefas enable row level security;

drop policy if exists "tarefas leitura" on public.tarefas;
create policy "tarefas leitura"
  on public.tarefas
  for select
  to authenticated
  using (true);

drop policy if exists "tarefas escrita" on public.tarefas;
create policy "tarefas escrita"
  on public.tarefas
  for all
  to authenticated
  using (true)
  with check (true);
