-- Motivo opcional gravado ao concluir uma tarefa como "Sem interesse"
-- (fluxo de conclusão com 3 opções: virou oportunidade / agendar novo
-- contato / sem interesse).
alter table public.tarefas add column if not exists motivo_conclusao text;
