-- Fase 25: log de erros próprio (sem depender de serviço externo como Sentry).
-- Registra falhas das rotas server-side sensíveis (/api/omie/*, /api/cnpj/*)
-- direto no Supabase, mesma ideia de audit_log, mas sem trigger: quem insere
-- é a própria rota, no momento em que captura a exceção.

create table if not exists public.error_log (
  id bigserial primary key,
  rota text not null,
  mensagem text not null,
  pedido_id uuid references public.pedidos(id),
  colaborador uuid references public.profiles(id),
  data_hora timestamptz not null default now()
);

alter table public.error_log enable row level security;

-- Leitura: só gestor (mesmo padrão de audit_log).
drop policy if exists "error_log leitura gestor" on public.error_log;
create policy "error_log leitura gestor"
  on public.error_log
  for select
  to authenticated
  using (public.meu_setor() = 'gestor');

-- Escrita: audit_log só recebe insert via trigger security definer, mas aqui
-- não há trigger — é a própria rota (autenticada como o usuário logado) que
-- grava o erro. Sem esta policy, o RLS bloquearia até a rota registrar sua
-- própria falha. Liberado para qualquer autenticado, já que qualquer perfil
-- pode acionar uma rota Omie/CNPJ e precisa poder logar o próprio erro.
drop policy if exists "error_log insercao" on public.error_log;
create policy "error_log insercao"
  on public.error_log
  for insert
  to authenticated
  with check (true);
