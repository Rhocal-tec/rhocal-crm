-- Motor de Recompra Preditiva: tabela de controle de progresso do backfill
-- em lotes. Confirmado ao vivo (Vercel Function logs, FUNCTION_INVOCATION_TIMEOUT)
-- que o plano Hobby atual está limitando a função a ~10s por invocação — sem
-- Fluid Compute habilitado, esse teto não é configurável via maxDuration.
-- Por isso o job passa a processar só um lote pequeno de pedidos novos por
-- execução, usando esta tabela pra lembrar onde parou entre uma invocação
-- (cron diário) e a próxima.
create table if not exists public.sync_estado (
  chave text primary key,
  valor text,
  atualizado_em timestamptz default now()
);

alter table public.sync_estado enable row level security;

drop policy if exists "sync_estado acesso" on public.sync_estado;
create policy "sync_estado acesso" on public.sync_estado for all to authenticated using (true) with check (true);
