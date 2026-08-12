-- Fase 33: o campo cDescricao do ListarTarefas do Omie confirmado ao vivo é,
-- na prática, um log corrido (várias entradas de datas diferentes
-- concatenadas na mesma tarefa), não uma descrição curta. Pra manter os
-- cartões do kanban legíveis, `descricao` guarda uma versão truncada
-- (~300 caracteres) e este campo novo guarda o texto original completo,
-- sem perder nada.

alter table public.tarefas add column if not exists descricao_completa_omie text;
