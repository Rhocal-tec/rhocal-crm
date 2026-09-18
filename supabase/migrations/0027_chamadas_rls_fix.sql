-- Reconserta a policy de leitura de `chamadas`.
--
-- A migration 0017_mobcall_integracao.sql já criava
-- "chamadas leitura" for select to authenticated using (true), mas testado
-- ao vivo (sessão authenticated real, sem service role) contra produção, um
-- select em `chamadas` -- mesmo totalmente sem filtro -- retorna 0 linhas,
-- sem erro nenhum (RLS filtra silenciosamente). Serviço role vê as linhas
-- normalmente, então a tabela e os dados estão OK; só a policy de leitura
-- não está valendo como deveria. Provável alteração manual feita direto no
-- SQL Editor do Supabase, sem migration correspondente no repo (mesmo tipo
-- de drift já visto em chamadas.criado_em, que existe na migration mas não
-- na tabela real).
--
-- Este fix só recria a policy do zero, igual à intenção original — não muda
-- nenhuma outra regra.
--
-- Rodar no SQL Editor do Supabase antes do deploy (mesmo padrão das
-- migrations anteriores).

drop policy if exists "chamadas leitura" on public.chamadas;
create policy "chamadas leitura" on public.chamadas
  for select to authenticated using (true);
