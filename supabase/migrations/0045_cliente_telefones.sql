-- Telefones adicionais do cliente, vindos da ponte com o CRM WhatsApp.
-- Rodar em BLOCOS separados no SQL Editor do Supabase.

-- BLOCO 1 — tabela
create table if not exists public.cliente_telefones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  telefone text not null,            -- só dígitos, com 55
  origem text not null default 'crm-whatsapp',
  criado_por_email text,
  criado_em timestamptz not null default now()
);

-- BLOCO 2 — índices
create index if not exists cliente_telefones_cliente_idx on public.cliente_telefones (cliente_id);
create index if not exists cliente_telefones_fim_idx on public.cliente_telefones (right(telefone, 4));

-- BLOCO 3 — RLS: só leitura para autenticados (a escrita é pela rota da ponte,
-- com service role). Sem policy de delete: nada é apagado.
alter table public.cliente_telefones enable row level security;
drop policy if exists "cliente_telefones leitura" on public.cliente_telefones;
create policy "cliente_telefones leitura" on public.cliente_telefones
  for select to authenticated using (true);
