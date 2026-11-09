-- Orçamento URGENTE: o comercial sinaliza e o Compras vê em vermelho, na frente da fila.
alter table public.pedidos add column if not exists urgente boolean not null default false;
alter table public.pedidos add column if not exists urgente_em timestamptz;
