-- Fase: adicionar/remover itens de um pedido já existente (só enquanto
-- omie_orcamento_id ainda é nulo). Sem policy de delete físico em
-- pedido_itens (regra de ouro do projeto: nada é deletado) — "remover" vira
-- soft-delete via esta coluna.
alter table public.pedido_itens
  add column if not exists excluido boolean not null default false;

-- vw_historico_ca precisa parar de trazer itens excluídos no histórico de CA
-- (busca por CA de compras/gestor e box de "última compra deste CA" na aba
-- Cotações) — mesma definição do schema original (CLAUDE.md), só com o
-- filtro novo adicionado ao where.
create or replace view public.vw_historico_ca as
select
  i.ca,
  i.descricao,
  p.numero as pedido_numero,
  p.cliente_nome,
  c.fornecedor,
  c.preco,
  c.data_cotacao,
  c.validade_cotacao,
  c.vencedora,
  c.empresa_faturou,
  i.custo_final,
  p.status,
  p.criado_em as pedido_criado_em
from public.pedido_itens i
join public.pedidos p on p.id = i.pedido_id
left join public.cotacoes c on c.item_id = i.id
where i.ca is not null
  and i.excluido = false;
