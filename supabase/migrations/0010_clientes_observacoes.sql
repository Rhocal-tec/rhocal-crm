-- Fase 35 (expansão): a tabela `clientes` precisa de um campo de observações
-- livre pra alimentar a ficha do cliente na Inteligência Comercial e a
-- exportação de CSV.

alter table public.clientes add column if not exists observacoes text;
