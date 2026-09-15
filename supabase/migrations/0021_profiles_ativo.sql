-- Desativação de colaborador (sem excluir) — profiles.ativo.
--
-- Caso concreto: vendas2@rhocal.com.br (Nicoly Santos) já tem o acesso
-- banido no Supabase Auth, mas o profile continua aparecendo normalmente
-- pro resto do sistema (dropdowns de atribuição, etc). Excluir o profile não
-- é opção: ela tem 2 pedidos (pedidos.criado_por) e 19 linhas de auditoria
-- (audit_log.colaborador) vinculadas, e pedidos.criado_por é
-- `not null references profiles(id)` sem `on delete cascade`/`set null` —
-- a exclusão quebraria com violação de foreign key.
--
-- Rodar no SQL Editor do Supabase antes do deploy (mesmo padrão das
-- migrações anteriores).

alter table public.profiles
  add column if not exists ativo boolean not null default true;

update public.profiles
   set ativo = false
 where id = '3f144849-f117-496c-9d87-0e5edb2d346a';
