-- Cruzamento direto chamada -> colaborador via IDs internos da Mobcall.
--
-- payload_bruto.sourceUserId/destinationUserId (o que veio preenchido no
-- ListarChamadas) identifica o agente Mobcall que originou/atendeu a
-- ligação -- mais confiável que a heurística de DID/ramal usada antes.
-- mobcall_user_id guarda esse ID (texto, mesmo padrão de ramal_mobcall) pra
-- cruzar contra profiles e resolver chamadas.usuario_id.
--
-- Rodar no SQL Editor do Supabase antes do deploy (mesmo padrão das
-- migrations anteriores).

alter table public.profiles
  add column if not exists mobcall_user_id text;
