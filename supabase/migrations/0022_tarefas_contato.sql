-- Campos de contato estruturados em `tarefas`, para tarefas "soltas" (sem
-- oportunidade_id/pedido_id ainda) — ex: lembrete de ligar pra um lead frio
-- que ainda nem é uma oportunidade. Quando a tarefa já tem oportunidade/pedido
-- pai, o contato já vive lá; estes campos ficam vazios nesse caso.
-- Idempotente, mesmo padrão das migrações anteriores.

alter table public.tarefas add column if not exists cliente_nome text;
alter table public.tarefas add column if not exists cliente_telefone text;
alter table public.tarefas add column if not exists cliente_cnpj text;
alter table public.tarefas add column if not exists contato_nome text;
alter table public.tarefas add column if not exists contato_cargo text;
alter table public.tarefas add column if not exists contato_email text;
