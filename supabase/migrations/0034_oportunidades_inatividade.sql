-- Fase 42 — Oportunidades: arquivamento automático por inatividade (3 dias)
-- + "Encerrar" rápido (perdida) direto no card.
--
-- Contexto: a Fase 31 deixou esse comportamento "a definir" ("mover
-- automaticamente para uma situação esfriada/inativa a definir"). Léo pediu
-- agora que oportunidades paradas há mais de 3 dias saiam do funil ativo.
-- Seguindo a regra de ouro do projeto ("NADA é deletado. NUNCA"), elas NÃO
-- são apagadas — são movidas para o novo status terminal INATIVA (mesmo
-- espírito do ARQUIVADO por inatividade em pedidos, fase 0/12 do schema
-- original), continuando buscáveis/consultáveis pra sempre.
--
-- status continua text livre (não enum) nesta tabela — nenhuma alteração de
-- tipo necessária, só o novo valor de uso 'INATIVA' (ver src/types/database.ts).
--
-- Idempotente: seguro rodar de novo.

create or replace function public.fn_oportunidades_inativar_paradas()
returns void language plpgsql security definer as $$
begin
  update public.oportunidades
     set status = 'INATIVA'
   where status not in ('GANHO', 'PERDIDO', 'INATIVA')
     and ultima_movimentacao < now() - interval '3 days';
end $$;

-- Job diário (mesmo padrão de fn_arquivar_inativos/pedidos) — cron.schedule
-- com o mesmo nome de job atualiza o agendamento existente em vez de
-- duplicar, então é seguro rodar esta migração mais de uma vez.
select cron.schedule(
  'oportunidades-inativar-paradas',
  '0 4 * * *',
  $$select public.fn_oportunidades_inativar_paradas()$$
);

-- Roda uma vez agora, ao aplicar a migração, pra já limpar do quadro as
-- oportunidades que JÁ estão paradas há 3+ dias — sem esperar o próximo
-- disparo do cron (04:00). Dali pra frente o job diário cuida sozinho.
select public.fn_oportunidades_inativar_paradas();
