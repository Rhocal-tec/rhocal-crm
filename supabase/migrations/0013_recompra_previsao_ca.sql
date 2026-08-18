-- Motor de Recompra Preditiva — coluna `ca` faltando em recompra_previsao.
--
-- recompra_previsao foi criada fora do controle de migrations deste repo
-- (ver comentário em 0008_recompra_previsao_ui.sql). O código sempre
-- pressupôs essa coluna (recalcularRecorrencias grava `ca` em todo upsert,
-- cruzarComVencimentoCA lê `select("id, ca")`, RecompraCard exibe
-- `previsao.ca`, types/database.ts já a declara) — mas ela nunca existiu de
-- fato na tabela, confirmado ao vivo pelo erro "column recompra_previsao.ca
-- does not exist" na rota /api/cron/recompra-preditiva.
alter table public.recompra_previsao add column if not exists ca text;
