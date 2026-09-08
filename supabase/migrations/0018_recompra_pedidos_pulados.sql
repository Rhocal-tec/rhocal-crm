-- Motor de Recompra Preditiva — pedidos do Omie que o ConsultarPedido
-- devolveu mas que NÃO geram linha em pedidos_itens_historico
-- (cancelados, sem itens/det, sem infoCadastro, resposta sem
-- pedido_venda_produto).
--
-- Sem esta tabela, o filtro de "novos" em sincronizarHistorico só exclui os
-- pedidos gravados com sucesso, então esses pulados continuavam em `novos`
-- para sempre: a cada volta completa do cursor de página eles eram
-- re-consultados no Omie (chamada de API desperdiçada, sujeita a rate limit)
-- e re-logados em error_log. Registrando o "pulado" aqui, cada um custa 1
-- ConsultarPedido + 1 linha de log UMA vez só.
--
-- `motivo` guarda o porquê ('cancelado', 'sem infoCadastro', 'sem itens (det)',
-- 'resposta sem pedido_venda_produto') — permite, se um dia fizer sentido,
-- re-tentar os ambíguos com:
--   delete from public.recompra_pedidos_pulados where motivo <> 'cancelado';
create table if not exists public.recompra_pedidos_pulados (
  pedido_omie_id text primary key,
  motivo text not null,
  visto_em timestamptz not null default now()
);

alter table public.recompra_pedidos_pulados enable row level security;

drop policy if exists "recompra_pedidos_pulados acesso" on public.recompra_pedidos_pulados;
create policy "recompra_pedidos_pulados acesso" on public.recompra_pedidos_pulados
  for all to authenticated using (true) with check (true);
