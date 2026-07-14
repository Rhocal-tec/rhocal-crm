-- Fase 17: registra quem fez a última movimentação de status do pedido.
-- Pré-requisito (já rodado pelo usuário fora desta migração): coluna
-- pedidos.movido_por uuid references profiles(id).
--
-- Atualiza fn_pedido_movimentado (já existente, criada no schema base) para,
-- além de manter ultima_movimentacao, também gravar quem fez a mudança de
-- status via auth.uid(). CREATE OR REPLACE é idempotente — não precisa
-- recriar a trigger em si, só o corpo da função que ela já chama.

create or replace function public.fn_pedido_movimentado()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.ultima_movimentacao := now();
    new.movido_por := auth.uid();
  end if;
  return new;
end $$;
