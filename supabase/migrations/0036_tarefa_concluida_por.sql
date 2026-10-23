-- Produtividade: registra QUEM concluiu cada tarefa e QUANDO. Antes, a tarefa
-- "Realizada" era creditada só ao responsável cadastrado — se outra pessoa
-- (ex: Joyce, que assumiu as tarefas de quem saiu) concluía, nada contava para
-- ela. Um gatilho no banco preenche os dois campos em qualquer caminho
-- (botão Concluir, mudança de situação, sincronização). Idempotente.
alter table public.tarefas
  add column if not exists concluida_por uuid references public.profiles(id),
  add column if not exists concluida_em timestamptz;

-- Tarefas já realizadas: mantém o crédito atual (responsável); data fica NULL
-- e a Produtividade continua usando a data prevista para elas.
update public.tarefas
   set concluida_por = responsavel
 where situacao = 'Realizada' and concluida_por is null and responsavel is not null;

create or replace function public.fn_tarefa_concluida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.situacao = 'Realizada' and (tg_op = 'INSERT' or old.situacao is distinct from 'Realizada') then
    new.concluida_por := coalesce(auth.uid(), new.responsavel, new.criado_por);
    new.concluida_em := now();
  elsif new.situacao is distinct from 'Realizada' then
    new.concluida_por := null;
    new.concluida_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tarefa_concluida on public.tarefas;
create trigger trg_tarefa_concluida
  before insert or update of situacao on public.tarefas
  for each row execute function public.fn_tarefa_concluida();

notify pgrst, 'reload schema';
