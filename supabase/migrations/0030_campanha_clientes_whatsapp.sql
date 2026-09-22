-- Disparo assistido de WhatsApp na aba Inteligência Comercial (Campanhas).
-- Coluna dedicada, separada de `status` (que já tem um significado próprio:
-- resultado da conversão, calculado por "Ver resultado" — 'enviado' ali é só
-- o estado padrão "ainda não avaliado", não "mensagem clicada"). Marcar aqui
-- é sempre otimista: sabemos que o botão "Abrir no WhatsApp" foi clicado,
-- nunca se a mensagem foi de fato enviada dentro do WhatsApp.
alter table public.campanha_clientes add column if not exists whatsapp_enviado_em timestamptz;
