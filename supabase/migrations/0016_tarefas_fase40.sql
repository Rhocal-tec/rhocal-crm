-- Fase 40 — Tarefas: tipos dinâmicos, status "Cancelada", lembrete e soft-delete.
--
-- Migração ADITIVA sobre a tabela `tarefas` já existente (fases 31/33/39) —
-- não recria a tabela, não cria enums (situacao/tipo continuam text livre,
-- mesmo padrão de AuditAcao/TarefaSituacao). Rodar no SQL Editor do Supabase
-- antes do deploy do código desta fase (mesmo padrão de 0013/0014/0015).

-- 1) Tipos de tarefa dinâmicos (botão "+"). `tarefas.tipo` continua sendo
--    text e guarda o NOME do tipo (não um FK) — mantém compatível com os
--    códigos de atividade importados do Omie (fase 39.3) e com dados antigos.
create table if not exists public.tipos_tarefa (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);

alter table public.tipos_tarefa enable row level security;

drop policy if exists "tipos_tarefa leitura" on public.tipos_tarefa;
create policy "tipos_tarefa leitura" on public.tipos_tarefa
  for select to authenticated using (true);

drop policy if exists "tipos_tarefa escrita" on public.tipos_tarefa;
create policy "tipos_tarefa escrita" on public.tipos_tarefa
  for all to authenticated using (true) with check (true);

insert into public.tipos_tarefa (nome) values
  ('Ligação'), ('WhatsApp'), ('E-mail'), ('Reunião'), ('Outro')
on conflict (nome) do nothing;

-- 2) Lembrete configurável por tarefa. A ENTREGA da notificação
--    (Telegram/WhatsApp — backlog V2) ainda não existe; por ora a coluna só
--    guarda a preferência para quando esse mecanismo for construído.
alter table public.tarefas
  add column if not exists notificar_em text not null default 'nao_notificar';

-- 3) Soft-delete (regra de ouro: nada é deletado). A "exclusão" é
--    update excluida = true — nenhuma policy de delete físico é criada.
alter table public.tarefas add column if not exists excluida boolean not null default false;
alter table public.tarefas add column if not exists excluida_em timestamptz;
alter table public.tarefas add column if not exists excluida_por uuid references public.profiles(id);
create index if not exists idx_tarefas_excluida on public.tarefas (excluida);

-- 4) Status "Cancelada": `situacao` continua text livre — sem alteração de
--    schema. Valores de uso passam a ser:
--    'Pendente' | 'Em Execução' | 'Realizada' | 'Cancelada'.
--    Só 'Realizada' e 'Cancelada' são terminais (saem das colunas por prazo).
