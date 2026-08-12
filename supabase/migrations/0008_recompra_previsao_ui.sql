-- Motor de Recompra Preditiva — colunas e view necessárias para a aba "Hora
-- de Recomprar" (/recompra). Pressupõe que `recompra_previsao`,
-- `pedidos_itens_historico` e `itens_associados` já existem (criadas fora
-- do controle de migrations deste repo, numa investigação anterior) — este
-- arquivo só estende `recompra_previsao` e `profiles`. Idempotente.

alter table public.recompra_previsao add column if not exists pedido_id uuid references public.pedidos(id);
alter table public.recompra_previsao add column if not exists motivo_nao_conversao text;
alter table public.recompra_previsao add column if not exists texto_sugerido_ia text;

-- Código do vendedor no Omie, usado para filtrar os cards de recompra do
-- vendedor logado (RecompraCard/HoraDeRecomprarTab). Populado manualmente
-- por colaborador — não tem como derivar automaticamente a partir do login.
alter table public.profiles add column if not exists vendedor_omie_id text;

-- View de priorização — primeira versão, simples: CA vencendo primeiro,
-- depois data prevista mais próxima. Ajuste a ordenação depois se quiser um
-- critério mais elaborado (ex: score combinando confiabilidade e valor).
-- `select *` expande para a lista de colunas no momento da criação, então
-- precisa ficar depois dos `alter table` acima.
create or replace view public.v_recompra_priorizada as
select *
from public.recompra_previsao
where status in ('pendente', 'contatado')
order by ca_vencendo desc, data_prevista_recompra asc nulls last;

-- RLS — mesmo padrão permissivo já usado em oportunidades/tarefas (regras
-- finas de "só o meu vendedor" ficam na aplicação, não no RLS). Seguro rodar
-- de novo mesmo que já esteja aplicado.
alter table public.recompra_previsao enable row level security;
drop policy if exists "recompra_previsao leitura e escrita" on public.recompra_previsao;
create policy "recompra_previsao leitura e escrita" on public.recompra_previsao
  for all to authenticated using (true) with check (true);

alter table public.itens_associados enable row level security;
drop policy if exists "itens_associados leitura" on public.itens_associados;
create policy "itens_associados leitura" on public.itens_associados
  for select to authenticated using (true);
