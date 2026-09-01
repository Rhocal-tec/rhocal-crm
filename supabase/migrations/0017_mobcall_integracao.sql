-- Integração Mobcall (telefonia) — click-to-call + sincronização periódica.
--
-- A Mobcall não tem webhook: /api/mobcall/click-to-call registra a chamada
-- como 'em_andamento' e /api/mobcall/sync (Vercel Cron, */15) busca o
-- ListarChamadas recente e faz upsert por mobcall_call_id, preenchendo
-- status/duração reais depois.
--
-- Rodar no SQL Editor do Supabase antes do deploy (mesmo padrão de
-- 0013/0014/0015/0016).

-- 1) Ramal Mobcall do colaborador (extension usada no click-to-call).
--    Aditivo em profiles — text livre, opcional (nem todo perfil liga).
alter table public.profiles
  add column if not exists ramal_mobcall text;

-- 2) Registro de chamadas. Regra de ouro: nada é deletado — sem policy de
--    delete. Escrita real vem sempre das rotas server-side com a service
--    role key (que ignora RLS); as policies abaixo cobrem só leitura no
--    client e uma escrita autenticada defensiva.
create table if not exists public.chamadas (
  id uuid primary key default gen_random_uuid(),
  mobcall_call_id text unique,
  direcao text not null,                     -- 'saida' | 'entrada'
  status text not null default 'em_andamento', -- em_andamento|atendida|nao_atendida|falha
  numero_origem text,
  numero_destino text,
  duracao_segundos integer,
  oportunidade_id uuid references public.oportunidades(id),
  usuario_id uuid references public.profiles(id),
  empresa_id uuid references public.empresas(id),
  iniciada_em timestamptz,
  finalizada_em timestamptz,
  payload_bruto jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_chamadas_oportunidade on public.chamadas (oportunidade_id);
create index if not exists idx_chamadas_usuario on public.chamadas (usuario_id);
create index if not exists idx_chamadas_iniciada_em on public.chamadas (iniciada_em desc);

alter table public.chamadas enable row level security;

drop policy if exists "chamadas leitura" on public.chamadas;
create policy "chamadas leitura" on public.chamadas
  for select to authenticated using (true);

drop policy if exists "chamadas escrita" on public.chamadas;
create policy "chamadas escrita" on public.chamadas
  for all to authenticated using (true) with check (true);

-- Auditoria: reaproveita fn_audit(), já genérica por tabela/registro_id.
-- (registro_id é uuid — chamadas.id é uuid, compatível.)
drop trigger if exists trg_audit_chamadas on public.chamadas;
create trigger trg_audit_chamadas
  after insert or update on public.chamadas
  for each row execute function public.fn_audit();

-- 3) Vínculo automático chamada -> oportunidade, chamado pela rota /sync
--    logo após o upsert quando a chamada ainda não tem oportunidade_id.
--    Heurística: casa os últimos 8 dígitos do número do cliente
--    (numero_destino nas de saída, numero_origem nas de entrada) contra
--    oportunidades.cliente_telefone. Sem match, não faz nada (não é erro).
create or replace function public.vincular_chamada_oportunidade(chamada_id uuid)
returns void
language plpgsql
as $$
declare
  v_numero text;
  v_op uuid;
begin
  select regexp_replace(
           case when c.direcao = 'saida' then c.numero_destino else c.numero_origem end,
           '\D', '', 'g')
    into v_numero
  from public.chamadas c
  where c.id = chamada_id;

  if v_numero is null or length(v_numero) < 8 then
    return;
  end if;

  select o.id
    into v_op
  from public.oportunidades o
  where o.cliente_telefone is not null
    and right(regexp_replace(o.cliente_telefone, '\D', '', 'g'), 8) = right(v_numero, 8)
  order by o.ultima_movimentacao desc
  limit 1;

  if v_op is not null then
    update public.chamadas set oportunidade_id = v_op where id = chamada_id;
  end if;
end $$;
