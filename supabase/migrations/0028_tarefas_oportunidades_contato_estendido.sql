-- Fluxo de conclusão de tarefa "Criar Oportunidade": antes de criar a
-- oportunidade, o funcionário agora preenche um formulário com os dados de
-- contato (possivelmente corrigidos/completados) mais um relato livre da
-- conversa com o cliente. Estende `tarefas` (onde o formulário também grava
-- de volta, pra tarefa original ficar com o registro completo) e
-- `oportunidades` (destino final dos dados), e cria o vínculo de rastreio
-- oportunidade -> tarefa de origem. Idempotente, mesmo padrão das migrações
-- anteriores (0022_tarefas_contato.sql).

alter table public.tarefas add column if not exists contato_telefone text;
alter table public.tarefas add column if not exists whatsapp_empresa text;
alter table public.tarefas add column if not exists whatsapp_comprador text;
alter table public.tarefas add column if not exists historico_conversa text;

alter table public.oportunidades add column if not exists contato_telefone text;
alter table public.oportunidades add column if not exists whatsapp_empresa text;
alter table public.oportunidades add column if not exists whatsapp_comprador text;
alter table public.oportunidades add column if not exists historico_conversa text;
alter table public.oportunidades add column if not exists origem_tarefa_id uuid references public.tarefas(id);
