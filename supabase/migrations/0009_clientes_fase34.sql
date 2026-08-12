-- Fase 34: módulo de Clientes — cadastro próprio no CRM, sincronizado com o
-- Omie (IncluirCliente/AlterarCliente) e reaproveitado pela busca de cliente
-- em Novo Orçamento/Novo Lead.
--
-- NÃO é escopada por empresa_id (diferente de pedidos/oportunidades/tarefas):
-- RHOCAL e MATSEG compartilham o mesmo cadastro de clientes no Omie
-- ("Compartilhamento de Cadastros entre Aplicativos", fase 30) — o mesmo
-- codigo_cliente_omie vale para as duas contas, então um único registro
-- nosso serve às duas empresas. Chamadas ao Omie feitas a partir desta tela
-- usam a empresa ATIVA no seletor do header, não um "dono" fixo do registro.

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text,
  telefone text,
  contato text,
  email text,
  endereco text,
  endereco_numero text,
  bairro text,
  cidade text,
  estado text,
  cep text,
  omie_cliente_id bigint,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Idempotente: cobre tanto a instalação nova (create table acima) quanto o
-- caso de a tabela já existir com um schema parcial (mesmo padrão das
-- migrações 0006/0007/0008).
alter table public.clientes add column if not exists razao_social text;
alter table public.clientes add column if not exists nome_fantasia text;
alter table public.clientes add column if not exists cnpj text;
alter table public.clientes add column if not exists telefone text;
alter table public.clientes add column if not exists contato text;
alter table public.clientes add column if not exists email text;
alter table public.clientes add column if not exists endereco text;
alter table public.clientes add column if not exists endereco_numero text;
alter table public.clientes add column if not exists bairro text;
alter table public.clientes add column if not exists cidade text;
alter table public.clientes add column if not exists estado text;
alter table public.clientes add column if not exists cep text;
alter table public.clientes add column if not exists omie_cliente_id bigint;
alter table public.clientes add column if not exists criado_por uuid references public.profiles(id);
alter table public.clientes add column if not exists criado_em timestamptz not null default now();
alter table public.clientes add column if not exists atualizado_em timestamptz not null default now();

-- CNPJ (quando preenchido) e omie_cliente_id (quando sincronizado) precisam
-- ser únicos, para não duplicar o mesmo cliente físico ao importar ou
-- cadastrar de novo. Índice parcial porque os dois campos são opcionais.
drop index if exists clientes_cnpj_unico;
create unique index clientes_cnpj_unico on public.clientes (cnpj) where cnpj is not null;
drop index if exists clientes_omie_cliente_id_unico;
create unique index clientes_omie_cliente_id_unico on public.clientes (omie_cliente_id) where omie_cliente_id is not null;

alter table public.clientes enable row level security;

-- Mesmo padrão de pedidos/oportunidades/tarefas: RLS liberado para todo
-- autenticado (módulo visível a todos os perfis, incluindo compras — fase 34).
drop policy if exists "clientes leitura" on public.clientes;
create policy "clientes leitura"
  on public.clientes
  for select
  to authenticated
  using (true);

drop policy if exists "clientes escrita" on public.clientes;
create policy "clientes escrita"
  on public.clientes
  for all
  to authenticated
  using (true)
  with check (true);

-- Atualiza atualizado_em a cada edição — mesmo padrão de ultima_movimentacao
-- em pedidos/oportunidades (fn_pedido_movimentado/fn_oportunidade_movimentada).
create or replace function public.fn_cliente_atualizado()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_cliente_atualizado on public.clientes;
create trigger trg_cliente_atualizado
  before update on public.clientes
  for each row execute function public.fn_cliente_atualizado();

-- Auditoria: reaproveita fn_audit(), já genérica por tabela/registro_id.
drop trigger if exists trg_audit_clientes on public.clientes;
create trigger trg_audit_clientes
  after insert or update on public.clientes
  for each row execute function public.fn_audit();
