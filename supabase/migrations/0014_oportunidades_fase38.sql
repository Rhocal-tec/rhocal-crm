-- Fase 38 — Oportunidades enriquecidas.
--
-- Novos campos em oportunidades: previsão de fechamento e dados de contato
-- mais ricos (nome/cargo/e-mail), além de produto/serviço de interesse e
-- concorrentes citados pelo cliente. Rodada manualmente no SQL Editor do
-- Supabase antes do código que a usa (mesmo padrão de 0013) — este arquivo
-- só formaliza a alteração no controle de migrations do repo.
alter table public.oportunidades add column if not exists previsao_fechamento date;
alter table public.oportunidades add column if not exists contato_nome text;
alter table public.oportunidades add column if not exists contato_cargo text;
alter table public.oportunidades add column if not exists contato_email text;
alter table public.oportunidades add column if not exists produto_servico text;
alter table public.oportunidades add column if not exists concorrentes text;
