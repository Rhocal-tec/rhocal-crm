-- Newsroom — Fase 2: recorrência, enquete, treinamento com perguntas, reconhecimento,
-- aviso por contexto, reações, comentários, metas (placar) e calendário da equipe.
-- Idempotente. Rode DEPOIS da 0041.

-- ===== Comunicados: novas colunas =====
alter table public.newsroom_comunicados drop constraint if exists newsroom_comunicados_tipo_check;
alter table public.newsroom_comunicados add constraint newsroom_comunicados_tipo_check
  check (tipo in ('novidade','aviso','urgente','treinamento','comemoracao','reconhecimento'));

alter table public.newsroom_comunicados add column if not exists recorrencia text
  check (recorrencia in ('diaria','semanal','mensal'));
alter table public.newsroom_comunicados add column if not exists recorrencia_dia integer;
alter table public.newsroom_comunicados add column if not exists recorrencia_hora text default '08:00';
alter table public.newsroom_comunicados add column if not exists enquete jsonb;
alter table public.newsroom_comunicados add column if not exists quiz jsonb;
alter table public.newsroom_comunicados add column if not exists destaque_usuario_id uuid references public.profiles(id);
alter table public.newsroom_comunicados add column if not exists contexto_rota text;

-- ===== Leituras: uma por ocorrência (avisos recorrentes) =====
alter table public.newsroom_leituras add column if not exists ocorrencia text not null default '';
alter table public.newsroom_leituras drop constraint if exists newsroom_leituras_comunicado_id_usuario_id_versao_key;
create unique index if not exists newsroom_leituras_unica_idx
  on public.newsroom_leituras (comunicado_id, usuario_id, versao, ocorrencia);

-- ===== Respostas de enquete e de treinamento (quiz) =====
create table if not exists public.newsroom_respostas (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references public.newsroom_comunicados(id),
  usuario_id uuid not null references public.profiles(id),
  versao integer not null default 1,
  ocorrencia text not null default '',
  dados jsonb not null,
  acertos integer,
  total integer,
  respondido_em timestamptz not null default now(),
  unique (comunicado_id, usuario_id, versao, ocorrencia)
);
alter table public.newsroom_respostas enable row level security;
drop policy if exists "newsroom_resp leitura" on public.newsroom_respostas;
create policy "newsroom_resp leitura" on public.newsroom_respostas
  for select to authenticated using (usuario_id = auth.uid() or meu_setor() = 'gestor');
drop policy if exists "newsroom_resp insercao" on public.newsroom_respostas;
create policy "newsroom_resp insercao" on public.newsroom_respostas
  for insert to authenticated with check (usuario_id = auth.uid());

-- ===== Reações e comentários =====
create table if not exists public.newsroom_reacoes (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references public.newsroom_comunicados(id),
  usuario_id uuid not null references public.profiles(id),
  emoji text not null,
  criado_em timestamptz not null default now(),
  unique (comunicado_id, usuario_id, emoji)
);
alter table public.newsroom_reacoes enable row level security;
drop policy if exists "newsroom_reac leitura" on public.newsroom_reacoes;
create policy "newsroom_reac leitura" on public.newsroom_reacoes
  for select to authenticated using (true);
drop policy if exists "newsroom_reac insercao" on public.newsroom_reacoes;
create policy "newsroom_reac insercao" on public.newsroom_reacoes
  for insert to authenticated with check (usuario_id = auth.uid());
drop policy if exists "newsroom_reac delete" on public.newsroom_reacoes;
create policy "newsroom_reac delete" on public.newsroom_reacoes
  for delete to authenticated using (usuario_id = auth.uid());

create table if not exists public.newsroom_comentarios (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references public.newsroom_comunicados(id),
  usuario_id uuid not null references public.profiles(id),
  texto text not null check (char_length(texto) between 1 and 500),
  criado_em timestamptz not null default now()
);
create index if not exists newsroom_comentarios_com_idx on public.newsroom_comentarios (comunicado_id);
alter table public.newsroom_comentarios enable row level security;
drop policy if exists "newsroom_coment leitura" on public.newsroom_comentarios;
create policy "newsroom_coment leitura" on public.newsroom_comentarios
  for select to authenticated using (true);
drop policy if exists "newsroom_coment insercao" on public.newsroom_comentarios;
create policy "newsroom_coment insercao" on public.newsroom_comentarios
  for insert to authenticated with check (usuario_id = auth.uid());
drop policy if exists "newsroom_coment delete" on public.newsroom_comentarios;
create policy "newsroom_coment delete" on public.newsroom_comentarios
  for delete to authenticated using (usuario_id = auth.uid() or meu_setor() = 'gestor');

-- ===== Metas (placar ao vivo) =====
create table if not exists public.newsroom_metas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  indicador text not null check (indicador in ('pedidos_efetuados','tarefas_concluidas','oportunidades_criadas','contatos_cs')),
  meta_valor numeric not null check (meta_valor > 0),
  inicio date not null,
  fim date not null,
  setor public.setor_tipo,
  ativa boolean not null default true,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);
alter table public.newsroom_metas enable row level security;
drop policy if exists "newsroom_metas leitura" on public.newsroom_metas;
create policy "newsroom_metas leitura" on public.newsroom_metas
  for select to authenticated using (true);
drop policy if exists "newsroom_metas insercao" on public.newsroom_metas;
create policy "newsroom_metas insercao" on public.newsroom_metas
  for insert to authenticated with check (meu_setor() = 'gestor');
drop policy if exists "newsroom_metas edicao" on public.newsroom_metas;
create policy "newsroom_metas edicao" on public.newsroom_metas
  for update to authenticated using (meu_setor() = 'gestor') with check (meu_setor() = 'gestor');

-- ===== Calendário da equipe (reuniões, feriados, férias, aniversários) =====
create table if not exists public.newsroom_datas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('aniversario','reuniao','feriado','ferias','evento')),
  titulo text not null,
  data date not null,
  data_fim date,
  hora text,
  usuario_id uuid references public.profiles(id),
  anual boolean not null default false,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);
alter table public.newsroom_datas enable row level security;
drop policy if exists "newsroom_datas leitura" on public.newsroom_datas;
create policy "newsroom_datas leitura" on public.newsroom_datas
  for select to authenticated using (true);
drop policy if exists "newsroom_datas insercao" on public.newsroom_datas;
create policy "newsroom_datas insercao" on public.newsroom_datas
  for insert to authenticated with check (meu_setor() = 'gestor');
drop policy if exists "newsroom_datas edicao" on public.newsroom_datas;
create policy "newsroom_datas edicao" on public.newsroom_datas
  for update to authenticated using (meu_setor() = 'gestor') with check (meu_setor() = 'gestor');
drop policy if exists "newsroom_datas delete" on public.newsroom_datas;
create policy "newsroom_datas delete" on public.newsroom_datas
  for delete to authenticated using (meu_setor() = 'gestor');
