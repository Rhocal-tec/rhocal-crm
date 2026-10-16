-- Produtividade de campanhas: guarda QUEM clicou em "Abrir no WhatsApp" para
-- cada cliente da campanha (o horário já existe em whatsapp_enviado_em). Envios
-- antigos ficam com NULL ("não identificado"). Idempotente.
alter table public.campanha_clientes
  add column if not exists whatsapp_enviado_por uuid references public.profiles(id);

notify pgrst, 'reload schema';
