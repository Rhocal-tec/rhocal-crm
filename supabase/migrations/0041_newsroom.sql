-- Newsroom (comunicados internos) — Fase 1. Só o gestor publica; equipe lê e confirma.
-- Sem delete (regra de ouro): encerrar = mudar status. Idempotente.

create table if not exists public.newsroom_comunicados (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  corpo text not null,
  tipo text not null check (tipo in ('novidade','aviso','urgente','treinamento','comemoracao')),
  exibicao text not null check (exibicao in ('popup','faixa','mural')),
  exige_confirmacao boolean not null default false,
  fixado boolean not null default false,
  inicio_em timestamptz not null default now(),
  fim_em timestamptz,
  prazo_ciencia_em timestamptz,
  status text not null default 'rascunho' check (status in ('rascunho','publicado','encerrado')),
  link_video text,
  versao integer not null default 1,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.newsroom_destinos (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references public.newsroom_comunicados(id),
  tipo text not null check (tipo in ('todos','setor','pessoa')),
  setor public.setor_tipo,
  usuario_id uuid references public.profiles(id)
);
create index if not exists newsroom_destinos_com_idx on public.newsroom_destinos (comunicado_id);

create table if not exists public.newsroom_anexos (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references public.newsroom_comunicados(id),
  nome text not null,
  caminho text not null,
  mime text,
  tamanho integer,
  criado_em timestamptz not null default now()
);
create index if not exists newsroom_anexos_com_idx on public.newsroom_anexos (comunicado_id);

create table if not exists public.newsroom_leituras (
  id uuid primary key default gen_random_uuid(),
  comunicado_id uuid not null references public.newsroom_comunicados(id),
  usuario_id uuid not null references public.profiles(id),
  versao integer not null default 1,
  lido_em timestamptz not null default now(),
  unique (comunicado_id, usuario_id, versao)
);
create index if not exists newsroom_leituras_usr_idx on public.newsroom_leituras (usuario_id);

alter table public.newsroom_comunicados enable row level security;
alter table public.newsroom_destinos enable row level security;
alter table public.newsroom_anexos enable row level security;
alter table public.newsroom_leituras enable row level security;

-- Comunicados: gestor vê/edita tudo; demais só os publicados destinados a eles.
drop policy if exists "newsroom_com leitura" on public.newsroom_comunicados;
create policy "newsroom_com leitura" on public.newsroom_comunicados
  for select to authenticated
  using (
    meu_setor() = 'gestor'
    or (
      status in ('publicado','encerrado')
      and exists (
        select 1 from public.newsroom_destinos d
        where d.comunicado_id = newsroom_comunicados.id
          and (d.tipo = 'todos'
               or (d.tipo = 'setor' and d.setor = meu_setor())
               or (d.tipo = 'pessoa' and d.usuario_id = auth.uid()))
      )
    )
  );
drop policy if exists "newsroom_com escrita gestor" on public.newsroom_comunicados;
create policy "newsroom_com escrita gestor" on public.newsroom_comunicados
  for insert to authenticated with check (meu_setor() = 'gestor');
drop policy if exists "newsroom_com edicao gestor" on public.newsroom_comunicados;
create policy "newsroom_com edicao gestor" on public.newsroom_comunicados
  for update to authenticated using (meu_setor() = 'gestor') with check (meu_setor() = 'gestor');

-- Destinos e anexos: leitura aberta a autenticados (não são sensíveis); escrita só gestor.
drop policy if exists "newsroom_dest leitura" on public.newsroom_destinos;
create policy "newsroom_dest leitura" on public.newsroom_destinos
  for select to authenticated using (true);
drop policy if exists "newsroom_dest insercao gestor" on public.newsroom_destinos;
create policy "newsroom_dest insercao gestor" on public.newsroom_destinos
  for insert to authenticated with check (meu_setor() = 'gestor');
drop policy if exists "newsroom_dest edicao gestor" on public.newsroom_destinos;
create policy "newsroom_dest edicao gestor" on public.newsroom_destinos
  for update to authenticated using (meu_setor() = 'gestor') with check (meu_setor() = 'gestor');

drop policy if exists "newsroom_anx leitura" on public.newsroom_anexos;
create policy "newsroom_anx leitura" on public.newsroom_anexos
  for select to authenticated using (true);
drop policy if exists "newsroom_anx insercao gestor" on public.newsroom_anexos;
create policy "newsroom_anx insercao gestor" on public.newsroom_anexos
  for insert to authenticated with check (meu_setor() = 'gestor');

-- Leituras: cada um registra a própria; gestor vê todas.
drop policy if exists "newsroom_leit leitura" on public.newsroom_leituras;
create policy "newsroom_leit leitura" on public.newsroom_leituras
  for select to authenticated using (usuario_id = auth.uid() or meu_setor() = 'gestor');
drop policy if exists "newsroom_leit insercao" on public.newsroom_leituras;
create policy "newsroom_leit insercao" on public.newsroom_leituras
  for insert to authenticated with check (usuario_id = auth.uid());

-- Destinos são só configuração de público: o gestor pode trocá-los ao editar o aviso.
drop policy if exists "newsroom_dest delete gestor" on public.newsroom_destinos;
create policy "newsroom_dest delete gestor" on public.newsroom_destinos
  for delete to authenticated using (meu_setor() = 'gestor');

-- Bucket privado de anexos (imagem, GIF, PDF).
insert into storage.buckets (id, name, public)
values ('newsroom', 'newsroom', false)
on conflict (id) do nothing;

drop policy if exists "newsroom storage leitura" on storage.objects;
create policy "newsroom storage leitura" on storage.objects
  for select to authenticated using (bucket_id = 'newsroom');
drop policy if exists "newsroom storage upload gestor" on storage.objects;
create policy "newsroom storage upload gestor" on storage.objects
  for insert to authenticated with check (bucket_id = 'newsroom' and meu_setor() = 'gestor');
