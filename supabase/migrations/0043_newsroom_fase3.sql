-- Newsroom — Fase 3: base de conhecimento e caixa de sugestões. Idempotente. Rode DEPOIS da 0042.

alter table public.newsroom_comunicados add column if not exists na_base boolean not null default false;
alter table public.newsroom_comunicados add column if not exists categoria text;

create table if not exists public.newsroom_sugestoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles(id),
  anonima boolean not null default false,
  categoria text,
  texto text not null check (char_length(texto) between 3 and 2000),
  status text not null default 'nova' check (status in ('nova','lida','respondida')),
  resposta text,
  respondido_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table public.newsroom_sugestoes enable row level security;

-- Anônima: usuario_id fica nulo (nem o gestor sabe quem enviou).
drop policy if exists "newsroom_sug insercao" on public.newsroom_sugestoes;
create policy "newsroom_sug insercao" on public.newsroom_sugestoes
  for insert to authenticated
  with check ((anonima and usuario_id is null) or (not anonima and usuario_id = auth.uid()));
drop policy if exists "newsroom_sug leitura" on public.newsroom_sugestoes;
create policy "newsroom_sug leitura" on public.newsroom_sugestoes
  for select to authenticated using (meu_setor() = 'gestor' or usuario_id = auth.uid());
drop policy if exists "newsroom_sug edicao gestor" on public.newsroom_sugestoes;
create policy "newsroom_sug edicao gestor" on public.newsroom_sugestoes
  for update to authenticated using (meu_setor() = 'gestor') with check (meu_setor() = 'gestor');
