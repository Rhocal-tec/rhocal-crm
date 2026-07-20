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

## Fase 18 — Melhorias pós-treinamento

### 18.1 — Autocomplete de fornecedor (Omie) na aba Cotações

- Campo "Fornecedor", ao adicionar uma nova cotação, ganha autocomplete: a partir de 3 caracteres digitados (mínimo exigido pela própria API do Omie), busca com debounce de 400ms na rota server-side `POST /api/omie/buscar-clientes-nome` com `{ nome, apenasFornecedor: true }`
- O Omie guarda fornecedores no mesmo cadastro de clientes (`ListarClientes`), diferenciando por uma tag no registro (`tags: [{ tag: "Fornecedor" }, ...]`) — não existe endpoint separado de fornecedores nem campo booleano dedicado; a rota filtra por essa tag no lado do servidor
- A busca por nome parcial usa `clientesFiltro: { razao_social: <termo> }` do `ListarClientes` — faz correspondência por substring (contém), sem distinção de maiúsculas/minúsculas; comportamento confirmado empiricamente contra a API real, não documentado explicitamente no portal do desenvolvedor Omie
- Lista suspensa (bg-surface-alt, hover destacado) com os resultados; ao selecionar, preenche o campo com o `razao_social` exato cadastrado no Omie
- Sem resultado (ou termo abaixo do mínimo): não bloqueia — o usuário pode continuar digitando livremente um fornecedor que ainda não está cadastrado no Omie

### 18.2 — Autocomplete de cliente por nome parcial na criação do pedido

- Campo "Nome do cliente" do Novo Orçamento ganha autocomplete pelo nome (mesma rota `/api/omie/buscar-clientes-nome`, sem `apenasFornecedor`), com o mesmo mínimo de 3 caracteres e debounce de 400ms
- Convive com a busca por CNPJ exato já existente — são dois caminhos independentes para achar o mesmo cliente; digitar no campo nome depois de uma busca por CNPJ (ou de uma seleção anterior) invalida o `cliente_omie_id` vinculado, exigindo nova seleção
- Ao selecionar uma sugestão, preenche nome e `cliente_omie_id` (pula a busca de cliente na hora de gerar o orçamento no Omie, igual já acontecia com CNPJ)

### 18.4 — Campo de observação por item

- Nova coluna pedido_itens.observacao (text, opcional)
- Campo "Observação" (textarea) disponível em todo formulário onde itens são criados ou editados: Novo Orçamento (NovoOrcamentoModal) e aba Itens do modal do pedido (ItensTab)
- Exibida na aba Itens, em bloco destacado, apenas quando preenchida

### 18.5 — Campo Código com busca automática no Omie

- Campo opcional "Código", posicionado antes de "Descrição", nos mesmos formulários de criação/edição de item (NovoOrcamentoModal e ItensTab)
- Ao perder o foco (blur) com um código preenchido, chama a rota server-side `POST /api/omie/buscar-produto-codigo`, que usa `ConsultarProduto` do Omie (endpoint `produtos/`) com `{ codigo_produto: 0, codigo }` — não usar `ListarProdutos` com `filtrar_codigo`: esse parâmetro não existe na API do Omie e a chamada falha (fault `SOAP-ENV:Client-5001`)
- "Não encontrado" chega como fault com a string "não cadastrado" (ex: "Código do Produto não cadastrado para o Código [...]") — tratar como resultado vazio (`encontrado: false`), não como erro
- Se encontrado: preenche a Descrição automaticamente com o retorno do Omie e salva o vínculo em pedido_itens.codigo_produto_omie — imediatamente via update quando o item já existe (ItensTab), ou junto do insert do pedido quando o item ainda está sendo criado (NovoOrcamentoModal); mostra indicador visual de sucesso (✓ verde)
- Se não encontrado: mensagem discreta "Código não encontrado no Omie", sem bloquear o preenchimento manual da descrição
- Itens com codigo_produto_omie já preenchido por este método pulam automaticamente a etapa de vinculação manual por descrição ao gerar o orçamento no Omie (mesma checagem que já existia em OmieOrcamentoSection)

### 18.6 — Alerta de cotação atrasada

- Pedido em EM_COTACAO (ORÇAMENTO EM COTAÇÃO) com ultima_movimentacao 2h ou mais no passado: card do kanban fica vermelho (accent-danger) em vez do âmbar padrão, com o texto "Cotação atrasada — Xh sem movimentação" (horas exatas, calculadas no client)
- Essa regra tem prioridade sobre o alerta âmbar de 3 dias enquanto o pedido estiver especificamente em EM_COTACAO; nas demais colunas, a regra de 3/7 dias continua normal

### 18.7 — Tamanho, Número e Cor por item

- Novas colunas pedido_itens.tamanho, numero e cor (text, opcionais)
- Editáveis nos mesmos formulários de criação/edição de item (NovoOrcamentoModal e ItensTab)
- Exibidos na listagem de itens quando preenchidos (ex: "Tam. G · Nº 42 · Cor Azul"), omitindo os campos vazios sem deixar espaço estranho no layout

### 18.8 — Número Omie visível no cabeçalho do modal

- Se pedidos.omie_orcamento_id estiver preenchido, o cabeçalho do modal do pedido exibe um badge destacado (accent-primary) ao lado de "Pedido #N", ex: "Pedido #12 · Omie #4521"

## Fase 19 — Atalho do Comercial

- Nova coluna pedidos.orcamento_direto (boolean, default false)
- Toggle "Orçamento direto (sem cotação do Compras)" no topo do formulário Novo Orçamento, disponível para comercial e gestor (o modal já só é aberto por esses dois perfis)
- Com o toggle ativado, cada item ganha um campo obrigatório "Preço de venda", além dos campos já existentes (descrição, quantidade, CA, código, observação, tamanho/número/cor)
- Ao salvar com o toggle ativado: o pedido nasce direto com status = APROVADO_CLIENTE (pula PEDIDO e as etapas de cotação) e orcamento_direto = true; cada item salva preco_venda com o valor informado, com custo_final e margem_pct nulos — não fazem sentido nesse fluxo
- Card do kanban e cabeçalho do modal exibem um badge "DIRETO" (accent-compras) quando orcamento_direto = true, para compras/gestor identificarem de cara que esse pedido pulou a cotação
- O botão "Gerar orçamento no Omie" já fica disponível imediatamente — a condição existente (status em COTADO/APROVADO/EFETUADO com preco_venda preenchido em todos os itens) já cobre isso automaticamente, sem necessidade de lógica adicional
- Pedidos criados nesse modo continuam podendo ser movidos, arquivados ou marcados como perdidos normalmente — nenhuma regra de permissão de movimentação distingue orçamento direto do fluxo normal
- Aba Itens do modal: quando custo_final está nulo mas preco_venda já está preenchido (caso do orçamento direto), exibe "Preço de venda: R$ X (orçamento direto)" em vez do "Aguardando cotação" padrão (que só se aplica a itens realmente esperando cotação de compras)

## Fase 20 — Converter Orçamento em Pedido de Venda no Omie

- Nova coluna pedidos.omie_convertido_pedido (boolean, default false)
- Etapa "10" = "Pedido de Venda" no Omie desta conta — **confirmado via `ListarEtapasFaturamento`** no endpoint `https://app.omie.com.br/api/v1/produtos/etapafat/` (não em `/produtos/pedido/`), filtrando pela operação `cCodOperacao: "11"` (Venda de Produto). Nunca assumir esse valor sem checar: os códigos de etapa são fixos entre contas, mas a descrição de cada um é customizável por conta — nesta conta, "10" tem `cDescrPadrao: "Pedido de Venda"` e descrição customizada "Pedido + Orçamento", ativa (`cInativo: "N"`)
- O método correto da API é **`AlterarPedidoVenda`** (não `AlterarPedido`) — mesma estrutura de entrada do `IncluirPedido` (`cabecalho`, `det`, `informacoes_adicionais`, `lista_parcelas`, `frete`, `observacoes`, `departamentos` opcionais). Nunca reenviar `total_pedido`, `infoCadastro` ou `exportacao` — a própria documentação do Omie marca esses blocos como "preenchimento automático - não informar"
- **`cabecalho` e `det[].ide` (vindos do `ConsultarPedido`) também têm campos calculados/de consulta misturados com os campos de entrada válidos** — ex: `cabecalho.numero_pedido`/`sequencial` e `det[].ide.codigo_item`/`id_ordem_producao` — e reenviá-los faz o `AlterarPedidoVenda` inteiro falhar (ex: "A tag [numero_pedido] não deve ser enviada na alteração!"). A rota usa uma allowlist explícita (`CABECALHO_CAMPOS_ENTRADA`/`IDE_CAMPOS_ENTRADA` em `orcamento/route.ts`) para montar `cabecalho` e cada item de `det` só com os campos de entrada documentados, e nunca reenvia o bloco `det[].imposto` (deixa o Omie recalcular os impostos, como a própria doc recomenda)
- Botão "Converter em Pedido de Venda" no modal do pedido (aba Dados, componente ConverterPedidoVendaSection), visível para comercial/gestor, só quando: status = APROVADO_CLIENTE E omie_orcamento_id preenchido E omie_convertido_pedido = false
- Ao clicar, formulário pede a condição de pagamento — escolhida manualmente a cada conversão, sem padrão fixo: à vista (1 parcela, com data de vencimento) ou parcelado (nº de parcelas + intervalo em dias entre elas, ex. 30/60/90). O intervalo é aplicado a partir de hoje (quantidade_dias = intervalo × número da parcela); percentual dividido igualmente entre as parcelas, com o arredondamento absorvido pela última
- **Cada parcela precisa de 4 campos obrigatórios, não só `numero_parcela`/`percentual`**: `valor` (R$ daquela parcela) e `data_vencimento` (data calendário, formato dd/mm/aaaa) também são obrigatórios — confirmado ao vivo com "O preenchimento da tag [valor] é obrigatório!". `valor` é calculado a partir do total do pedido (somado direto de `det[].produto.quantidade × valor_unitario`, já que `total_pedido` não é reenviado) × percentual da parcela, com o arredondamento de centavos absorvido pela última parcela; `data_vencimento` é `hoje + quantidade_dias`, formatada com o mesmo helper `formatarDataOmie` usado em `data_previsao`
- Fluxo da conversão (rota `POST /api/omie/orcamento`, ação `converter_pedido_venda`): consulta o pedido atual no Omie via `ConsultarPedido` (preserva qualquer edição feita direto no Omie, em vez de reconstruir o payload do zero a partir do nosso banco) → reaproveita a lógica já existente da Fase 10 (`obterCategoriaReceitaPadrao`/`obterContaCorrentePadrao`) para codigo_categoria/codigo_conta_corrente → monta o payload só com os campos de entrada válidos, sobrescrevendo etapa/codigo_parcela ("999")/qtde_parcelas/lista_parcelas → chama `AlterarPedidoVenda`
- **Cliente vinculado é obrigatório para converter**, mesmo que o orçamento tenha sido gerado com "Gerar sem vincular cliente" (que manda codigo_cliente = 0 — válido pro Omie na criação do orçamento, mas rejeitado na conversão com o fault "O preenchimento das tags [codigo_cliente] ou [codigo_cliente_integracao] é obrigatório!"). Se pedidos.cliente_omie_id ainda for null quando o comercial clica em "Converter em Pedido de Venda", o próprio ConverterPedidoVendaSection mostra antes um passo de busca/vínculo de cliente (reaproveitando a rota `/api/omie/buscar-clientes-nome` da Fase 18.2), salva cliente_omie_id imediatamente ao selecionar, e só então segue pro formulário de condição de pagamento. A rota sempre sobrescreve cabecalho.codigo_cliente com pedidos.cliente_omie_id (nunca confia no valor que o ConsultarPedido devolveu, que pode ser o 0 antigo)
- **`informacoes_adicionais.codVend`/`codProj` (vendedor/projeto) são referências opcionais que podem ter virado inválidas** desde que o orçamento foi criado — confirmado ao vivo com o fault "O vendedor está inativo! - tag: [codVend]" ao reenviar o codVend antigo vindo do `ConsultarPedido`. A rota omite os dois na conversão (`codVend`/`codProj` como `undefined`, que o `JSON.stringify` descarta) em vez de arriscar reenviar uma referência que virou inválida — diferente dos casos acima (campo que não pode ser enviado), aqui o campo é aceito, só que seu valor específico não é mais válido
- Sucesso: grava omie_convertido_pedido = true; cabeçalho do modal passa a exibir, ao lado do número Omie (Fase 18.8), o badge "Convertido em Pedido de Venda ✓" (accent-success)
- Erros do Omie tratados no mesmo padrão já usado nas outras integrações: mensagem da API exibida em banner accent-danger, nunca trava a UI de forma silenciosa

## Fase 21 — PDF do orçamento, gerado direto no CRM (sem depender do Omie)

Documento comercial pronto para enviar ao cliente, gerado a partir dos dados já existentes no pedido — não depende de o orçamento já ter sido gerado no Omie.

**Layout:** formal e claro (fundo branco, estilo proposta comercial/papel timbrado), não o visual escuro do sistema. Logo da RHOCAL (/public/rhocal-logo.png) no cabeçalho, laranja #F1592A como cor de destaque em títulos/linhas divisórias.

**Dados fixos da RHOCAL (cabeçalho do documento, hardcoded no template):**
RHOCAL EQUIPAMENTOS DE SEGURANÇA LTDA
CNPJ: 53.263.859/0001-50
IE: 206.912.722.113
Av. Capitão Francisco César, 842 — Vila Pindorama
Barueri-SP — CEP: 06415-000
Telefone: (11) 4161-6675

**Novos campos no pedido, necessários para o PDF:**
- pedidos.valor_frete (numeric, opcional, default 0) — editável por comercial/gestor na aba Dados
- pedidos.modo_faturamento (text, opcional) — select com opções fixas: "21 dias", "30/60/90 dias", "PIX", "Cartão" — editável por comercial/gestor na aba Dados
- pedidos.cliente_cnpj (text, opcional) — salvar o CNPJ digitado/buscado do cliente para exibir no documento

**Conteúdo do PDF:**
- Cabeçalho: logo RHOCAL + dados fixos da RHOCAL (acima) + "Orçamento Nº [número do pedido]" + data e hora de emissão (momento em que o PDF é gerado)
- Dados do cliente: nome, CNPJ, telefone e contato (quando preenchidos)
- Tabela de itens: descrição, CA (se preenchido), tamanho/número/cor combinados (se preenchidos), quantidade, preço unitário, subtotal
- Frete: linha separada abaixo da tabela de itens, mostrando o valor do frete (se maior que zero)
- Total geral em destaque = soma dos itens + frete
- Modo de faturamento: exibido em destaque (ex: "Condição de pagamento: 30/60/90 dias")
- Rodapé/assinatura: nome do vendedor (comercial que criou o pedido, criado_por via join com profiles), data e hora de emissão do documento, e o texto de validade ("Orçamento válido por 7 dias a partir da data de emissão")

**Geração:** botão "Baixar PDF do Orçamento" no modal do pedido (aba Dados), disponível para comercial e gestor, habilitado quando todos os itens tiverem preco_venda preenchido — independente do pedido já ter ou não omie_orcamento_id. Gerar client-side (@react-pdf/renderer ou jsPDF), sem depender de serviço externo.
