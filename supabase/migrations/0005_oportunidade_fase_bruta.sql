-- Fase 31 (ajuste pós-investigação real da API do Omie): a importação via
-- "Importar do Omie" (ListarOportunidades) traz fasesStatus.nCodFase/
-- nCodStatus/nCodMotivo — códigos numéricos opacos e específicos da conta,
-- que ainda não foram mapeados para nomes legíveis (ver aviso na fase 31 do
-- CLAUDE.md). Guarda os códigos brutos como referência para consulta manual
-- futura, em vez de tentar traduzir agora.

alter table public.oportunidades add column if not exists omie_fase_bruta text;
