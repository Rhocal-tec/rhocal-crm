-- Motor de Recompra Preditiva — filtro de recência na view de priorização.
--
-- Antes, v_recompra_priorizada (migration 0008) filtrava só por status
-- ('pendente'/'contatado') e não tinha nenhum corte por antiguidade: um
-- cliente que comprou uma única vez há anos aparecia como sugestão ativa —
-- e, pela ordenação `data_prevista_recompra asc`, subia pro TOPO da fila
-- (data mais no passado = mais "atrasado"), empurrando pra baixo quem tem
-- recompra realmente próxima.
--
-- Este filtro alinha o Motor de Recompra com o mesmo limiar de 180 dias já
-- usado na Inteligência Comercial (fase 35 — "esfriando" até 180 dias,
-- "frio"/"sem compra" além disso): só entram previsões cujo cliente comprou
-- o item nos últimos 180 dias.
--
-- `data_ultima_compra` é a coluna de recompra_previsao que guarda a data da
-- última compra daquele par cliente+item (preenchida por recalcularRecorrencias
-- em src/lib/recompra/sync-recompra-preditiva.ts). É NOT NULL. O cast `::date`
-- nos dois lados torna a comparação robusta independente de a coluna estar
-- tipada como date, timestamptz ou text-ISO.
--
-- Recria a view inteira (create or replace) — não altera a 0008. Mesma lista
-- de colunas (select *) e mesma ordenação; só acrescenta o AND de recência.

create or replace view public.v_recompra_priorizada as
select *
from public.recompra_previsao
where status in ('pendente', 'contatado')
  and data_ultima_compra::date >= (now() - interval '180 days')::date
order by ca_vencendo desc, data_prevista_recompra asc nulls last;
