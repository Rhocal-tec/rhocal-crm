-- Campo "O que o cliente deseja/precisa" — diferente de historico_conversa
-- (relato livre da conversa que já rolou): é a necessidade identificada,
-- pra o comercial ver de cara ao abrir a oportunidade, antes mesmo de entrar
-- em contato. Idempotente, mesmo padrão das migrações anteriores
-- (0022_tarefas_contato.sql, 0028_tarefas_oportunidades_contato_estendido.sql).

alter table public.tarefas add column if not exists necessidade_cliente text;
alter table public.oportunidades add column if not exists necessidade_cliente text;
