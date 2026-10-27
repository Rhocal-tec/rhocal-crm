-- Módulo CS (pós-venda) — Fase 1: fila do dia, atendimento com pesquisa,
-- reclamações e repasses. Nada é apagado (sem policy de delete). Idempotente.
-- Rode DEPOIS da 0037 (que cria o perfil 'cs').

-- ===== Regras editáveis pela diretoria (gestor) =====
create table if not exists public.cs_config (
  chave text primary key,
  valor integer not null,
  descricao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id)
);

insert into public.cs_config (chave, valor, descricao) values
  ('pos_entrega_inicio', 1, 'Pós-entrega: entra na fila X dias após a entrega'),
  ('pos_entrega_fim', 3, 'Pós-entrega: sai da fila após X dias'),
  ('percepcao_inicio', 15, 'Percepção: entra X dias após a compra'),
  ('percepcao_fim', 45, 'Percepção: até X dias após a compra'),
  ('alerta_inicio', 46, 'Alerta de inatividade: a partir de X dias sem compra'),
  ('alerta_fim', 59, 'Alerta de inatividade: até X dias sem compra'),
  ('recuperacao_inicio', 60, 'Recuperação: X dias ou mais sem compra'),
  ('recompra_antecedencia', 7, 'Recompra programada: entra X dias antes da reposição'),
  ('meta_dia', 20, 'Meta de contatos por dia'),
  ('prazo_reclamacao_horas', 48, 'Prazo de retorno de reclamação (horas)'),
  ('alerta_reclamacao_horas', 12, 'Alerta de reclamação: faltando X horas'),
  ('retentativa_dias_uteis', 2, 'Cliente sem resposta volta à fila após X dias úteis')
on conflict (chave) do nothing;

-- ===== Contatos (cada atendimento) =====
create table if not exists public.cs_contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  cliente_chave text not null,
  cliente_nome text not null,
  cliente_cnpj text,
  fase text not null,
  canal text,
  status text not null default 'em_andamento',
  observacao text,
  usuario_id uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists cs_contatos_cliente_idx on public.cs_contatos (empresa_id, cliente_chave, criado_em desc);
create index if not exists cs_contatos_data_idx on public.cs_contatos (empresa_id, criado_em desc);

-- ===== Pesquisa de satisfação (1 por contato) =====
create table if not exists public.cs_pesquisas (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid not null unique references public.cs_contatos(id),
  nota integer check (nota between 0 and 10),
  motivos text[] not null default '{}',
  comentario text,
  p1_palavra text,
  p2_motivos text[] not null default '{}',
  p3_outros_fornecedores boolean,
  p3_nome text,
  p3_texto text,
  p4_mudaria text,
  p5_origem text,
  ajustes_pedido text,
  proxima_reposicao date,
  aceita_contato boolean,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ===== Reclamações =====
create table if not exists public.cs_reclamacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  contato_id uuid references public.cs_contatos(id),
  cliente_nome text not null,
  cliente_cnpj text,
  categoria text not null,
  descricao text,
  area_responsavel text not null,
  status text not null default 'aberta',
  aberta_em timestamptz not null default now(),
  prazo_em timestamptz not null,
  solucao text,
  retorno_em timestamptz,
  criado_por uuid references public.profiles(id),
  atualizado_em timestamptz not null default now()
);
create index if not exists cs_reclamacoes_status_idx on public.cs_reclamacoes (empresa_id, status, prazo_em);

-- ===== Repasses =====
create table if not exists public.cs_repasses (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id),
  contato_id uuid references public.cs_contatos(id),
  cliente_nome text not null,
  cliente_cnpj text,
  destino text not null,
  destinatario_id uuid references public.profiles(id),
  resumo text not null,
  resultado text not null default 'pendente',
  valor numeric(14,2),
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  resolvido_por uuid references public.profiles(id),
  resolvido_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index if not exists cs_repasses_destino_idx on public.cs_repasses (empresa_id, destino, resultado);

-- atualizado_em automático
create or replace function public.fn_cs_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['cs_contatos','cs_pesquisas','cs_reclamacoes','cs_repasses'] loop
    execute format('drop trigger if exists trg_%1$s_atualizado on public.%1$s', t);
    execute format('create trigger trg_%1$s_atualizado before update on public.%1$s for each row execute function public.fn_cs_atualizado_em()', t);
  end loop;
end $$;

-- ===== RLS (mesmo padrão do CRM: autenticados leem/escrevem; sem delete) =====
alter table public.cs_config enable row level security;
alter table public.cs_contatos enable row level security;
alter table public.cs_pesquisas enable row level security;
alter table public.cs_reclamacoes enable row level security;
alter table public.cs_repasses enable row level security;

drop policy if exists "cs_config leitura" on public.cs_config;
create policy "cs_config leitura" on public.cs_config for select to authenticated using (true);
drop policy if exists "cs_config escrita gestor" on public.cs_config;
create policy "cs_config escrita gestor" on public.cs_config for update to authenticated
  using (public.meu_setor() = 'gestor') with check (public.meu_setor() = 'gestor');

do $$
declare t text;
begin
  foreach t in array array['cs_contatos','cs_pesquisas','cs_reclamacoes','cs_repasses'] loop
    execute format('drop policy if exists "%1$s leitura" on public.%1$s', t);
    execute format('create policy "%1$s leitura" on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists "%1$s insert" on public.%1$s', t);
    execute format('create policy "%1$s insert" on public.%1$s for insert to authenticated with check (true)', t);
    execute format('drop policy if exists "%1$s update" on public.%1$s', t);
    execute format('create policy "%1$s update" on public.%1$s for update to authenticated using (true) with check (true)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
