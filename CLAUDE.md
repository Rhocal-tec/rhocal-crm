# RHOCAL CRM — Especificação do Projeto (v2 — com perfil GESTOR)

CRM kanban colaborativo para a RHOCAL Equipamentos, conectando os setores COMERCIAL e COMPRAS em tempo real, com visão total do GESTOR e integração ao Omie ERP.

## Stack

- **Frontend:** Next.js 14+ (App Router) + TypeScript + Tailwind CSS
- **Backend/DB:** Supabase (Postgres + Auth + Realtime + RLS)
- **Drag and drop:** @dnd-kit/core
- **Deploy:** Vercel
- **ERP:** Omie API (app.omie.com.br/api/v1)

## Regra de ouro

**NADA é deletado. NUNCA.** Pedidos saem do kanban apenas por arquivamento. Todos os dados ficam disponíveis para busca permanentemente.

---

## Perfis de acesso

Três perfis, com login individual por colaborador (Supabase Auth, e-mail + senha):

| Perfil | Vê | Pode |
|---|---|---|
| COMERCIAL | Kanban, dados do pedido, itens, custo final liberado por compras, preço de venda, previsão de entrega. **Não vê:** fornecedores, as 3 cotações, datas/validades de cotação, histórico de CA, empresa que faturou, auditoria completa | Criar pedidos, definir margem/preço de venda, mover para APROVADO PELO CLIENTE e ARQUIVADO, gerar orçamento no Omie, buscar por nº de pedido |
| COMPRAS | Tudo, exceto controles exclusivos de gestor | Cadastrar cotações, marcar vencedora, liberar custo final, mover para EM COTAÇÃO / PEDIDO COTADO / PEDIDO EFETUADO, buscar por nº de pedido e por CA, ler auditoria |
| GESTOR | **Tudo:** cotações, custos, fornecedores, CA, auditoria completa | **Tudo:** mover qualquer card em qualquer direção, editar qualquer campo, buscar por pedido e por CA. Perfil de Rodrigo da Hora |

A separação é feita via **Row Level Security no Postgres**, não apenas na interface.

---

## Fluxo do Kanban (colunas, nesta ordem)

> **Nomes de exibição (UI) vs. valores internos do banco:** o enum `pedido_status` no Postgres mantém os códigos internos (`PEDIDO`, `EM_COTACAO`, `PEDIDO_COTADO`, `APROVADO_CLIENTE`, `PEDIDO_EFETUADO`, `ARQUIVADO`) — não renomear o enum no banco. A interface deve exibir os nomes abaixo. Fazer esse mapeamento em uma constante única no frontend (ex: `STATUS_LABELS`), nunca no banco.

| Valor interno (banco) | Nome exibido na UI |
|---|---|
| `PEDIDO` | **ORÇAMENTO** |
| `EM_COTACAO` | **ORÇAMENTO EM COTAÇÃO** |
| `PEDIDO_COTADO` | **ORÇAMENTO COTADO** |
| `APROVADO_CLIENTE` | **PEDIDO APROVADO** |
| `PEDIDO_EFETUADO` | **PEDIDO EFETUADO** |
| `ARQUIVADO` | **ARQUIVADO** |

1. **ORÇAMENTO** (`PEDIDO`) — Comercial cria o orçamento com cliente e itens
2. **ORÇAMENTO EM COTAÇÃO** (`EM_COTACAO`) — Compras arrasta ao iniciar cotações
3. **ORÇAMENTO COTADO** (`PEDIDO_COTADO`) — Compras arrasta ao concluir; libera o custo final por item e a previsão de chegada
4. **PEDIDO APROVADO** (`APROVADO_CLIENTE`) — Comercial arrasta após o cliente aprovar o orçamento
5. **PEDIDO EFETUADO** (`PEDIDO_EFETUADO`) — Compras arrasta ao efetuar a compra; informa dados da compra e data de entrega ao cliente
6. **ARQUIVADO** (`ARQUIVADO`) — fora do kanban, permanece buscável

As regras de quem move para onde permanecem exatamente as mesmas — só mudam os textos exibidos.

### Regras de movimentação

- Só COMPRAS move para: EM COTAÇÃO, PEDIDO COTADO, PEDIDO EFETUADO
- Só COMERCIAL move para: APROVADO PELO CLIENTE e ARQUIVADO (manual, ao fim do ciclo)
- **GESTOR move qualquer card para qualquer coluna, em qualquer direção**
- **3 dias sem movimentação** → card muda de cor (alerta visual âmbar). Calculado no client a partir de `ultima_movimentacao`.
- **7 dias sem movimentação** → pedido é **arquivado automaticamente** com `arquivado_motivo = 'inatividade'` (job diário via pg_cron). Nunca deletar.

---

## Validação de movimentação para ORÇAMENTO COTADO

Ao mover um pedido para `PEDIDO_COTADO` (ORÇAMENTO COTADO), o sistema verifica se todos os itens têm uma cotação vencedora com `custo_final` preenchido. Se algum item estiver faltando, **exibir um aviso não bloqueante** (ex: toast ou banner: "Atenção: os itens X, Y ainda não têm cotação vencedora definida") — mas **permitir o movimento normalmente**. A decisão de mover mesmo com itens pendentes fica a critério do COMPRAS/GESTOR.

## Fluxo de preço

1. COMPRAS cadastra até **3 cotações de fornecedores por item** (fornecedor, preço, data da cotação, validade da cotação) — invisível ao comercial
2. COMPRAS marca a cotação vencedora e libera pro pedido apenas o **custo final por item** (um número, sem fornecedor)
3. COMERCIAL vê o custo final, define a **margem** (% ou valor) e o sistema calcula o preço de venda
4. O preço de venda alimenta o orçamento enviado ao Omie
5. GESTOR enxerga tudo: as 3 cotações, custo, margem e preço de venda

---

## CA (Certificado de Aprovação)

- Campo **opcional** em cada item do pedido
- Busca por CA (**COMPRAS e GESTOR**) retorna o histórico completo do produto: onde comprou, quanto pagou, quando cotou, validade das cotações, empresa que faturou, em quais pedidos apareceu

## Busca

- Todos os perfis: por **número do pedido** (cada perfil vê apenas o que sua permissão permite)
- COMPRAS e GESTOR: adicionalmente por **CA**, com histórico completo
- **Filtro de data (todos os perfis):** campo opcional de filtro por data, com duas opções — **data específica** ou **intervalo (de/até)**. Aplicado sobre `criado_em` na busca por número de pedido, e sobre `data_cotacao` na busca por CA (compras/gestor). O filtro de data pode ser combinado com o termo buscado, ou usado sozinho para listar tudo dentro do período.

---

## Auditoria

Toda criação, alteração e movimentação registra **DATA, HORA e COLABORADOR** em uma tabela `audit_log` (via triggers no Postgres). Inclui o evento de arquivamento automático por inatividade. Leitura: COMPRAS e GESTOR.

---

## Schema SQL (rodar no SQL Editor do Supabase)

> **Instalação nova:** rode o bloco completo abaixo.
> **Se você já rodou a versão anterior do schema (sem gestor):** NÃO rode este bloco de novo — vá direto para a seção **Migração v1 → v2** no fim.

```sql
-- ===== ENUMS =====
create type setor_tipo as enum ('compras', 'comercial', 'gestor');
create type pedido_status as enum (
  'PEDIDO', 'EM_COTACAO', 'PEDIDO_COTADO',
  'APROVADO_CLIENTE', 'PEDIDO_EFETUADO', 'ARQUIVADO'
);
create type arquivo_motivo as enum ('manual', 'inatividade');

-- ===== PERFIS =====
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  setor setor_tipo not null,
  criado_em timestamptz not null default now()
);

-- ===== PEDIDOS =====
create table pedidos (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  cliente_nome text not null,
  cliente_omie_id bigint,
  status pedido_status not null default 'PEDIDO',
  previsao_chegada date,          -- preenchido por compras em PEDIDO_COTADO
  data_entrega_cliente date,      -- preenchido por compras em PEDIDO_EFETUADO
  dados_compra text,              -- observações da compra efetuada
  omie_orcamento_id bigint,       -- id do orçamento gerado no Omie
  arquivado_motivo arquivo_motivo,
  criado_por uuid not null references profiles(id),
  criado_em timestamptz not null default now(),
  ultima_movimentacao timestamptz not null default now()
);

-- ===== ITENS =====
create table pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id),
  descricao text not null,
  quantidade numeric not null default 1,
  ca text,                        -- OPCIONAL
  custo_final numeric,            -- liberado por compras (cotação vencedora)
  margem_pct numeric,             -- definida pelo comercial
  preco_venda numeric,            -- custo_final * (1 + margem_pct/100)
  criado_em timestamptz not null default now()
);

-- ===== COTAÇÕES (COMPRAS e GESTOR) =====
create table cotacoes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references pedido_itens(id),
  fornecedor text not null,
  preco numeric not null,
  data_cotacao date not null default current_date,
  validade_cotacao date not null,
  vencedora boolean not null default false,
  empresa_faturou text,
  criado_por uuid not null references profiles(id),
  criado_em timestamptz not null default now()
);
-- máximo 3 cotações por item: validar na aplicação e com trigger

-- ===== AUDITORIA =====
create table audit_log (
  id bigserial primary key,
  tabela text not null,
  registro_id uuid not null,
  acao text not null,             -- 'criou', 'alterou', 'moveu', 'arquivou_auto'
  dados_antes jsonb,
  dados_depois jsonb,
  colaborador uuid references profiles(id),
  data_hora timestamptz not null default now()
);

-- ===== TRIGGER: atualiza ultima_movimentacao ao mudar status =====
create or replace function fn_pedido_movimentado()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.ultima_movimentacao := now();
  end if;
  return new;
end $$;

create trigger trg_pedido_movimentado
  before update on pedidos
  for each row execute function fn_pedido_movimentado();

-- ===== TRIGGERS DE AUDITORIA =====
create or replace function fn_audit()
returns trigger language plpgsql security definer as $$
begin
  insert into audit_log (tabela, registro_id, acao, dados_antes, dados_depois, colaborador)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

create trigger trg_audit_pedidos after insert or update on pedidos
  for each row execute function fn_audit();
create trigger trg_audit_itens after insert or update on pedido_itens
  for each row execute function fn_audit();
create trigger trg_audit_cotacoes after insert or update on cotacoes
  for each row execute function fn_audit();

-- ===== ARQUIVAMENTO AUTOMÁTICO (7 dias) — pg_cron diário =====
-- Habilitar extensão pg_cron no dashboard do Supabase antes
create or replace function fn_arquivar_inativos()
returns void language plpgsql security definer as $$
begin
  update pedidos
     set status = 'ARQUIVADO',
         arquivado_motivo = 'inatividade'
   where status <> 'ARQUIVADO'
     and ultima_movimentacao < now() - interval '7 days';
end $$;

select cron.schedule('arquivar-inativos', '0 3 * * *', $$select fn_arquivar_inativos()$$);

-- ===== RLS =====
alter table profiles enable row level security;
alter table pedidos enable row level security;
alter table pedido_itens enable row level security;
alter table cotacoes enable row level security;
alter table audit_log enable row level security;

create or replace function meu_setor() returns setor_tipo
language sql stable security definer as
$$ select setor from profiles where id = auth.uid() $$;

-- profiles: todos autenticados leem nome/setor dos colegas
create policy "ler perfis" on profiles for select to authenticated using (true);

-- pedidos e itens: todos os perfis leem e escrevem (regras de etapa na aplicação)
create policy "pedidos leitura" on pedidos for select to authenticated using (true);
create policy "pedidos escrita" on pedidos for insert to authenticated with check (true);
create policy "pedidos update" on pedidos for update to authenticated using (true);

create policy "itens leitura" on pedido_itens for select to authenticated using (true);
create policy "itens escrita" on pedido_itens for insert to authenticated with check (true);
create policy "itens update" on pedido_itens for update to authenticated using (true);

-- cotações: COMPRAS e GESTOR (leitura e escrita)
create policy "cotacoes compras gestor" on cotacoes for all to authenticated
  using (meu_setor() in ('compras','gestor'))
  with check (meu_setor() in ('compras','gestor'));

-- auditoria: leitura COMPRAS e GESTOR; escrita só via trigger
create policy "audit leitura" on audit_log for select to authenticated
  using (meu_setor() in ('compras','gestor'));

-- ===== VIEW: histórico por CA (RLS herdada das tabelas) =====
create view vw_historico_ca as
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
from pedido_itens i
join pedidos p on p.id = i.pedido_id
left join cotacoes c on c.item_id = i.id
where i.ca is not null;
```

> **Importante sobre DELETE:** nenhuma policy de delete é criada em nenhuma tabela. Sem policy, o RLS bloqueia delete para todos, inclusive gestor. É intencional.

### Migração v1 → v2 (SÓ para quem já rodou o schema antigo)

```sql
-- PASSO A: rodar e executar este comando SOZINHO primeiro
alter type setor_tipo add value if not exists 'gestor';
```

```sql
-- PASSO B: rodar depois, em execução separada
drop policy "cotacoes compras" on cotacoes;
create policy "cotacoes compras gestor" on cotacoes for all to authenticated
  using (meu_setor() in ('compras','gestor'))
  with check (meu_setor() in ('compras','gestor'));

drop policy "audit leitura compras" on audit_log;
create policy "audit leitura" on audit_log for select to authenticated
  using (meu_setor() in ('compras','gestor'));
```

O Passo A precisa rodar separado porque o Postgres não permite criar e usar um valor novo de enum na mesma execução.

### Criar o usuário do GESTOR (Rodrigo da Hora)

1. Authentication → Users → criar usuário com o e-mail do Rodrigo
2. Copiar o UUID do usuário criado e rodar:

```sql
insert into profiles (id, nome, setor)
values ('UUID_DO_USUARIO_RODRIGO', 'Rodrigo da Hora', 'gestor');
```

---

## Integração Omie — Gerar Orçamento (v1)

- Rota server-side: `POST /api/omie/orcamento` (nunca expor credenciais no client)
- Env vars: `OMIE_APP_KEY`, `OMIE_APP_SECRET`
- Endpoint Omie: `https://app.omie.com.br/api/v1/produtos/pedido/` — call `IncluirPedido`, na etapa de orçamento
- Disparo: botão "Gerar orçamento no Omie", disponível quando o pedido está em PEDIDO_COTADO, APROVADO_CLIENTE ou PEDIDO_EFETUADO — qualquer etapa a partir da cotação — com preço de venda preenchido em todos os itens (COMERCIAL e GESTOR podem acionar). Se o pedido ainda estiver em PEDIDO ou EM_COTACAO (antes de ser cotado), a mensagem de bloqueio deve indicar que ele precisa passar pela cotação primeiro, sem citar um status específico
- Salvar o retorno (`codigo_pedido`) em `pedidos.omie_orcamento_id`
- Antes de enviar, buscar/confirmar o cliente no Omie (`ListarClientes` por CNPJ/nome) para obter `codigo_cliente_omie`
- Implementado no modal do pedido (aba Dados), não no card: busca o cliente por nome, mostra os resultados para o usuário confirmar; se não encontrar, avisa e permite seguir sem vincular. Depois de gerado, mostra "Orçamento Omie: #N" no lugar do botão. Erros da API do Omie (credenciais, campo obrigatório, rede) aparecem em um banner usando o tom `accent-danger`

## Realtime

- Assinar mudanças da tabela `pedidos` via Supabase Realtime (postgres_changes) para o kanban refletir movimentações instantaneamente em todas as telas
- Habilitar replicação da tabela `pedidos` no dashboard do Supabase (Database → Replication)

## Design System — Identidade Visual

Direção visual ancorada na marca real da RHOCAL (logo oficial: "R" branco estilizado, como uma chama/fita, sobre fundo laranja) e no setor da empresa (segurança do trabalho / EPI).

**Logo:** arquivo `rhocal-logo.png` (fundo laranja quadrado com o "R" branco). Usar no topo do login (tamanho maior, centralizado) e como ícone pequeno no cabeçalho de todas as páginas internas (kanban, busca, arquivados), ao lado do texto "RHOCAL CRM".

**Paleta (tokens CSS) — cor primária extraída diretamente do logo oficial:**
- `--bg-base: #12181C` — fundo geral (grafite quase preto)
- `--bg-surface: #1C242A` — superfície de cards e painéis
- `--bg-surface-alt: #232C33` — superfície secundária (hover, linhas alternadas, headers de tabela)
- `--accent-primary: #F1592A` — laranja oficial da marca RHOCAL (ações principais, botões, destaque, logo)
- `--accent-compras: #3B7DD8` — azul aço (usado em elementos do setor COMPRAS)
- `--accent-success: #2FAE66` — verde (status aprovado/sucesso)
- `--accent-alert: #F4B400` — âmbar (alerta de 3+ dias sem movimentação — já usado nas regras de negócio)
- `--accent-danger: #E5484D` — vermelho de erro (falhas de API, validação — ex: erros da integração Omie)
- `--text-primary: #E8EBED` — texto principal sobre fundo escuro
- `--text-muted: #8A939B` — texto secundário/legendas

**Tipografia:**
- Display/títulos e números de pedido: **Barlow Condensed** (técnica, remete à sinalização industrial)
- Corpo/UI geral: **Inter**
- Dados e códigos (nº pedido, CA, valores monetários): **IBM Plex Mono**

**Elemento de assinatura:** faixa diagonal fina no topo de cada coluna do kanban, na cor correspondente ao status daquela coluna (não usar o padrão preto/amarelo óbvio de fita zebrada — só uma linha de cor sólida, discreta).

**Escopo de aplicação:** esse design system se aplica a TODAS as telas do CRM, sem exceção — login, kanban, modal de pedido (todas as abas), página de busca, página de arquivados, e qualquer tela futura. Nenhuma tela deve ficar com o visual padrão do Next.js/Tailwind sem estilização.

**Estrutura:** cantos levemente arredondados nos cards (não retos, não excessivamente arredondados), bastante espaço negativo entre colunas, badges de perfil (COMERCIAL/COMPRAS/GESTOR) cada um com sua cor de identificação. Manter acessibilidade: contraste AA mínimo, foco de teclado visível, responsivo até mobile.

## UI

- Nome no topo: **RHOCAL CRM**
- Kanban com 5 colunas visíveis (ARQUIVADO fica em página própria com busca)
- Card: nº do pedido, cliente, resumo de itens, badge do status, tempo parado
- Card ≥ 3 dias parado: borda/fundo âmbar; contador "há X dias sem movimentação"
- Página de busca: campo único que aceita nº de pedido; se o perfil for COMPRAS ou GESTOR, aceita também CA e mostra o histórico completo (vw_historico_ca)
- Modal do pedido com abas: **Dados** | **Itens** | **Cotações** (visível para COMPRAS e GESTOR) | **Histórico** (audit do pedido, visível para COMPRAS e GESTOR)
- GESTOR: sem restrições de movimentação nem de edição; badge "GESTOR" no topo ao lado do nome
- Login simples com e-mail/senha; após login, carregar o perfil (nome + setor) e adaptar a UI

## V2 (não implementar agora — backlog)

- Painel executivo do GESTOR ao logar: pedidos por etapa, tempo médio por coluna, pedidos parados 3+ dias, valor total em negociação
- Alerta de cotação próxima do vencimento
- Notificações Telegram/WhatsApp a cada movimentação de card

## Fases de build (nesta ordem)

1. Scaffold Next.js + Tailwind + supabase-js + dnd-kit
2. Rodar o schema SQL no Supabase; criar usuários de teste (compras, comercial e gestor/Rodrigo)
3. Auth + carregamento de perfil (3 perfis: compras, comercial, gestor)
4. Kanban com drag and drop + Realtime + regra visual de 3 dias + permissões de movimentação por perfil (gestor move tudo)
5. Modal do pedido: criação (comercial/gestor), itens com CA opcional
6. Módulo de cotações (compras/gestor): 3 fornecedores, vencedora, liberar custo final
7. Margem e preço de venda (comercial/gestor)
8. Busca por pedido (todos) e por CA (compras/gestor)
9. Arquivamento manual + página de arquivados
10. Integração Omie (gerar orçamento)
11. Deploy Vercel

## Fase 13 — Status PERDIDO + motivo da perda

- Novo valor no enum pedido_status: PERDIDO (label UI: PERDIDO)
- O comercial (e gestor) pode marcar um pedido como perdido a partir de qualquer status ativo (antes de PEDIDO_EFETUADO), via botão "Marcar como perdido" no modal do pedido
- Ao marcar, abrir um pequeno formulário obrigatório: motivo da perda — select com opções fixas (Preço, Prazo de entrega, Concorrência, Cliente desistiu, Outro) + campo de texto livre opcional para detalhes. Salvar em pedidos.motivo_perda (text)
- Pedido PERDIDO sai do kanban ativo e aparece na página de arquivados (com badge/filtro distinguindo ARQUIVADO de PERDIDO), permanecendo buscável
- Regra dos 7 dias de inatividade continua arquivando (não marca como perdido — perda é sempre decisão humana)

## Fase 14 — Painel executivo do GESTOR

Página /painel acessível somente ao perfil gestor (link no header, visível só pra ele). Conteúdo:

- Cards de resumo: total de pedidos ativos por etapa; valor total em negociação (soma de preco_venda dos pedidos ativos); pedidos parados 3+ dias; taxa de conversão (pedidos EFETUADOS dividido por (EFETUADOS + PERDIDOS), no período)
- Tempo médio por etapa: calculado a partir do audit_log (diferença entre movimentações de status)
- Motivos de perda: contagem por motivo (gráfico simples ou lista ordenada)
- Filtro de período (mês atual, últimos 30/90 dias, personalizado)
- Seguir o design system; gráficos podem usar recharts ou similar, mantendo a paleta

## Fase 15 — Inteligência de CA na cotação + alerta de validade

- Sugestão automática por CA: na aba Cotações, ao abrir um item que tem CA preenchido, buscar automaticamente no histórico (vw_historico_ca) as compras/cotações anteriores daquele CA e exibir um box discreto: "Última compra deste CA: R$ X — fornecedor Y — em DD/MM/AAAA". Só para compras/gestor
- Alerta de cotação vencida: cotação cuja validade_cotacao já passou deve aparecer visualmente marcada (borda/texto em vermelho suave + tag "Vencida") em todos os lugares onde cotações aparecem. Se a cotação vencedora de um item estiver vencida, mostrar aviso no topo do modal do pedido

## Fase 16 — Entrega real, duplicar pedido e contato do cliente

- Data real de entrega: novo campo data_entrega_real (date) em pedidos, preenchido por compras/gestor quando o pedido chega de fato. Exibir na aba Dados junto da previsão, permitindo comparar prometido × real
- Duplicar pedido: botão "Duplicar" no modal do pedido (qualquer status, inclusive arquivado), disponível para comercial/gestor. Cria um novo pedido em ORÇAMENTO com o mesmo cliente e os mesmos itens (descrição, quantidade, CA), SEM copiar cotações, custos, margens nem vínculos Omie — esses são refeitos no novo ciclo
- Contato do cliente: novos campos opcionais em pedidos: cliente_telefone (text) e cliente_contato (text, nome da pessoa de contato). Editáveis na criação e na aba Dados, por comercial/gestor

## Fase 17 — Exibir quem fez a última movimentação

- Nova coluna pedidos.movido_por (uuid, references profiles). A trigger fn_pedido_movimentado (já existente) passa a gravar new.movido_por = auth.uid(), além de atualizar ultima_movimentacao, sempre que o status mudar
- Card do kanban: texto pequeno e discreto abaixo do indicador de dias parado, mostrando quem moveu por último (ex: "Movido por Ariane"), resolvido via join/lookup com profiles a partir de movido_por
- Aba Dados do modal do pedido: ao lado de "Última movimentação: DD/MM/AAAA", acrescentar o nome de quem fez (ex: "Última movimentação: 10/07/2026 por Ariane Villariço")
- Vale para qualquer colaborador e qualquer direção de movimentação, incluindo a criação inicial do pedido — nesse caso (movido_por ainda nulo) usa criado_por, já que não houve mudança de status
