-- Fase 33: estende `tarefas` com os campos necessários para o kanban de
-- Tarefas por PRAZO (/tarefas) e para a futura importação/sincronização
-- bidirecional com o CRM do Omie (ListarTarefas/IncluirTarefa/AlterarTarefa —
-- ainda não implementada nesta migração, só o schema). Idempotente: seguro
-- rodar de novo mesmo que os campos já existam.

alter table public.tarefas add column if not exists tipo text;
alter table public.tarefas add column if not exists situacao text not null default 'Pendente';
alter table public.tarefas add column if not exists importante boolean not null default false;
alter table public.tarefas add column if not exists urgente boolean not null default false;
alter table public.tarefas add column if not exists omie_tarefa_id bigint;
alter table public.tarefas add column if not exists empresa_id uuid references public.empresas(id);

-- Backfill de empresa_id para tarefas já existentes, a partir da empresa da
-- oportunidade ou do pedido vinculado (uma tarefa só tem um dos dois).
update public.tarefas t
set empresa_id = o.empresa_id
from public.oportunidades o
where t.oportunidade_id = o.id
  and t.empresa_id is null;

update public.tarefas t
set empresa_id = p.empresa_id
from public.pedidos p
where t.pedido_id = p.id
  and t.empresa_id is null;

-- Mantém `situacao` coerente com o `concluida` já existente, para tarefas
-- marcadas concluídas antes desta migração entrarem direto na coluna
-- "Concluídas" do novo kanban por prazo.
update public.tarefas set situacao = 'Realizada' where concluida = true and situacao <> 'Realizada';
