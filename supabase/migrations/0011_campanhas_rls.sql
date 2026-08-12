-- Fase 36.3: RLS para campanhas/campanha_clientes, mesmo padrão já usado em
-- oportunidades/tarefas/interacoes (leitura liberada, escrita liberada pra
-- qualquer usuário autenticado — regras de negócio ficam na aplicação).
alter table public.campanhas enable row level security;
alter table public.campanha_clientes enable row level security;

drop policy if exists "campanhas leitura" on public.campanhas;
create policy "campanhas leitura" on public.campanhas for select to authenticated using (true);

drop policy if exists "campanhas escrita" on public.campanhas;
create policy "campanhas escrita" on public.campanhas for all to authenticated using (true) with check (true);

drop policy if exists "campanha_clientes leitura" on public.campanha_clientes;
create policy "campanha_clientes leitura" on public.campanha_clientes for select to authenticated using (true);

drop policy if exists "campanha_clientes escrita" on public.campanha_clientes;
create policy "campanha_clientes escrita" on public.campanha_clientes for all to authenticated using (true) with check (true);
