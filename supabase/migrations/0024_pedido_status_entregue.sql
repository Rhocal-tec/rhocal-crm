-- Novo valor terminal no enum pedido_status: ENTREGUE — pedido efetuado que
-- já chegou de fato ao cliente. Precisa ficar sozinho neste arquivo: o
-- Postgres não permite usar um valor novo de enum na mesma transação em que
-- ele foi adicionado (mesmo cuidado do "Passo A" da migração v1→v2 original
-- registrada no CLAUDE.md, quando 'gestor' foi adicionado a setor_tipo).
alter type pedido_status add value if not exists 'ENTREGUE';
