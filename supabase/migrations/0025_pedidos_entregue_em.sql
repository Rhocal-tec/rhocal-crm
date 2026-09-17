-- Momento em que o pedido foi marcado como ENTREGUE (botão "Marcar como
-- Entregue" no kanban, a partir de PEDIDO_EFETUADO). Campo novo, separado de
-- data_entrega_real — esse já tem significado consolidado (chegada da
-- mercadoria vinda do fornecedor, comparada com previsao_chegada), não é
-- sobre a entrega ao cliente final.
alter table pedidos add column if not exists entregue_em timestamptz;
