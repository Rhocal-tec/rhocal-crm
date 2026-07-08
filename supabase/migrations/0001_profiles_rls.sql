-- RLS da tabela profiles
-- Escopo: qualquer usuário autenticado pode LER qualquer perfil
-- (necessário para o kanban exibir nome/setor de quem criou/moveu pedidos).
-- Escrita não é liberada por policy aqui: perfis são gerenciados via painel/service_role.

alter table public.profiles enable row level security;

-- Idempotente: recria a policy caso já exista.
drop policy if exists "profiles_select_authenticated" on public.profiles;

create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);
