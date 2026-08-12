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

## Fase 22 — Ajustes de precificação e edição pós-cotação

**22.1 — Frete em formato de moeda brasileira**
O campo "Frete" (aba Dados, pedidos.valor_frete) deve usar máscara/formatação de moeda brasileira (R$ 0.000,00) tanto na digitação quanto na exibição — mesmo padrão já usado em custo final e preço de venda.

**22.2 — Cotação continua editável após concluída**
Os campos de cotação (fornecedor, preço, data, validade, previsão de chegada, custo final) na aba Cotações continuam totalmente editáveis por compras/gestor independente do status atual do pedido — mesmo depois que o pedido já saiu de EM_COTACAO e avançou para PEDIDO_COTADO, APROVADO_CLIENTE ou além. Nunca bloquear edição por causa do status do pedido ter avançado. Alterações continuam sendo auditadas normalmente pelos triggers já existentes.

**22.3 — Margem substituída por preço de venda direto**
Remover o campo de margem percentual (margem_pct) da interface do comercial/gestor. Em seu lugar, um campo "Preço de venda" por item, onde o comercial digita diretamente o valor final em reais (sem cálculo automático de margem sobre o custo). A coluna margem_pct permanece no schema (nunca deletar coluna), apenas sem uso ativo na UI a partir de agora. O total do pedido continua sendo a soma dos preco_venda de todos os itens + frete (fase 21).

**22.4 — Observação, tamanho, número e cor no PDF do orçamento**
Confirmar/garantir que o PDF gerado (fase 21) exibe, por item: o conteúdo do campo observacao (quando preenchido) e os campos tamanho, numero e cor (quando preenchidos, combinados de forma legível) — junto com descrição, CA, quantidade e valores já especificados.

## Fase 23 — Busca de CNPJ na Receita Federal (fallback quando não está no Omie)

Quando o comercial digita um CNPJ na criação do pedido e ele NÃO é encontrado no Omie (fase 18.2/CNPJ), buscar automaticamente na Receita Federal via API pública BrasilAPI (https://brasilapi.com.br/api/cnpj/v1/{cnpj}, gratuita, sem necessidade de chave) como fallback:

1. Se a busca no Omie falhar (cliente não encontrado), chamar a rota server-side (nova: POST /api/cnpj/consultar, que por sua vez chama a BrasilAPI) com o CNPJ digitado
2. Se a BrasilAPI encontrar o CNPJ, preencher automaticamente: nome (razão social ou nome fantasia, o que estiver disponível), telefone (se disponível no retorno) — o cliente_omie_id permanece vazio, já que esse cliente não está cadastrado no Omie ainda
3. Exibir um aviso discreto: "Cliente encontrado na Receita Federal, mas ainda não está cadastrado no Omie. Ele poderá ser cadastrado lá antes de gerar o orçamento." — não bloqueia a criação do pedido
4. Se nem a BrasilAPI encontrar o CNPJ (CNPJ inválido ou inexistente), mostrar mensagem clara e deixar o preenchimento manual, sem bloquear
5. A busca por nome parcial (fase 18.2) continua funcionando normalmente só contra o Omie — a Receita Federal só entra como fallback quando um CNPJ completo é digitado e não bate com nada no Omie

## Fase 24 — Cadastrar cliente no Omie direto do CRM

Quando um cliente não é encontrado no Omie (fase 23), oferecer a opção de cadastrá-lo sem sair do CRM, usando o método IncluirCliente da API do Omie.

Captura de dados (ao consultar a Receita Federal, fase 23): além de nome e telefone (já usados para preencher o formulário do pedido), capturar e manter em estado temporário do formulário os demais campos retornados pela BrasilAPI necessários para o cadastro: razão social, nome fantasia, DDD e telefone separados, logradouro, número, bairro, município, UF e CEP.

Fluxo:
1. Quando o cliente não tem cliente_omie_id (não encontrado no Omie), exibir um botão "Cadastrar no Omie" próximo ao campo de cliente no formulário
2. Ao clicar, abrir um formulário curto e pré-preenchido (com os dados da Receita Federal, quando disponíveis) para revisão/complemento: razão social, nome fantasia, CNPJ, telefone (DDD + número), endereço completo (logradouro, número, bairro, cidade, estado, CEP), e e-mail (opcional). Todos os campos editáveis antes de confirmar
3. Ao confirmar, chamar uma rota server-side (POST /api/omie/cadastrar-cliente) que monta o payload no formato exigido pelo Omie:
{
  "codigo_cliente_integracao": "RHOCAL-CRM-CLI-{timestamp ou CNPJ}",
  "razao_social": "...",
  "nome_fantasia": "...",
  "cnpj_cpf": "...",
  "telefone1_ddd": "...",
  "telefone1_numero": "...",
  "endereco": "...",
  "endereco_numero": "...",
  "bairro": "...",
  "cidade": "...",
  "estado": "...",
  "email": "..."
}
4. Se o cadastro for bem-sucedido, o Omie retorna o codigo_cliente_omie — salvar esse valor imediatamente em cliente_omie_id do pedido (ou manter em estado, se o pedido ainda não foi criado) e mostrar confirmação visual ("Cliente cadastrado no Omie com sucesso")
5. Tratar erros da API (ex: CNPJ já cadastrado, campo obrigatório faltando) de forma amigável, seguindo o mesmo padrão já usado nos outros erros do Omie

## Fase 25 — Log de erros próprio (sem depender de serviço externo)

Em vez de um serviço de monitoramento terceirizado (ex: Sentry), registrar erros de rotas sensíveis direto no Supabase — mesmo padrão já usado em audit_log, sem custo e sem dependência externa.

Schema:
create table error_log (
  id bigserial primary key,
  rota text not null,
  mensagem text not null,
  pedido_id uuid references pedidos(id),
  colaborador uuid references profiles(id),
  data_hora timestamptz not null default now()
);
alter table error_log enable row level security;
create policy "error_log leitura gestor" on error_log for select to authenticated
  using (meu_setor() = 'gestor');

Instrumentação: todas as rotas server-side sensíveis (/api/omie/*, /api/cnpj/*) devem capturar exceções em try/catch e, além de retornar a mensagem amigável já existente ao usuário, inserir um registro em error_log com a rota, a mensagem de erro (nunca incluir chaves de API ou dados sensíveis na mensagem salva), o pedido relacionado (se houver) e o colaborador logado no momento.

Visualização: nova aba/seção "Erros recentes" dentro do Painel executivo (/painel, fase 14), visível somente ao gestor — lista os últimos erros registrados (rota, mensagem, data/hora, colaborador), permitindo identificar problemas sem precisar de ferramenta externa.

## Fase 26 — Item "Já em estoque" (fora do fluxo de cotação)

Nem todo item precisa de cotação — alguns já estão em estoque na RHOCAL. Uma marcação por item resolve isso, mantendo comercial e compras com visões diferentes do mesmo pedido.

Novo campo: pedido_itens.em_estoque (boolean, default false)

Comportamento:
- Checkbox "Já em estoque (não precisa cotar)" por item, editável por comercial, compras e gestor, disponível na criação e edição do item
- Comercial e gestor: sempre veem TODOS os itens do pedido, com ou sem a marcação, normalmente na aba Itens
- Compras: na aba Cotações, itens marcados como em_estoque = true NÃO aparecem na lista de itens a cotar — ficam 100% fora dessa aba, sem nenhuma exceção ou campo simplificado de custo
- Validação ao mover para ORÇAMENTO COTADO: a checagem de "itens sem cotação vencedora" (aviso não bloqueante, fase existente) deve ignorar itens em_estoque = true — eles não contam como pendência de cotação
- Itens em estoque continuam aparecendo normalmente no PDF do orçamento (fase 21) e em qualquer outro lugar que liste itens do pedido — a marcação afeta apenas a aba Cotações
- Preço de venda imediato: assim que um item é marcado como em_estoque = true, o campo "Preço de venda" (fase 22.3) fica disponível para o comercial preencher imediatamente naquele item — mesmo comportamento já usado no "Orçamento direto" (fase 19), já que um item em estoque não depende de custo vindo de cotação. Isso vale item a item: num mesmo pedido, itens em estoque já podem ter preço de venda definido, enquanto outros itens (que ainda vão para cotação) esperam o custo do Compras normalmente.

## Fase 27 — Indicador visual de margem no preço de venda (por cor, sem expor percentual)

Quando o comercial (ou gestor) digita o preço de venda de um item (fase 22.3), o campo deve mudar de cor automaticamente conforme a margem implícita naquele preço — sem NUNCA exibir o percentual numérico ao comercial. O cálculo e as faixas são internos ao sistema.

Cálculo (por item, recalculado a cada alteração do preço de venda):
percentual = (custo_final / preco_venda) * 100

Esse percentual representa "quanto do preço final é custo" — quanto MENOR, melhor a margem; quanto MAIOR, mais apertada.

Faixas de cor (ajustadas para contraste — evitar tons próximos do laranja da marca `--accent-primary` #F1592A ou do azul de compras `--accent-compras` #3B7DD8 já usados no resto da interface):
- Percentual menor que 60%: Azul vívido (#2563EB) — Margem ótima, acima do ideal
- Percentual de 60% a 65%: Verde (#16A34A) — Margem boa
- Percentual de 66% a 70%: Amarelo puro (#EAB308) — Margem apertando
- Percentual de 71% a 75%: Vermelho (#DC2626) — Margem crítica
- Percentual maior que 75%: Vermelho bem escuro (#7F1D1D) — Perigo real, preço muito próximo ou abaixo do custo

Implementação:
- O campo "Preço de venda" (input) tem fundo preenchido com a cor correspondente em opacidade alta (~50%, não um tingimento sutil) e borda de 2px na cor cheia, atualizando em tempo real enquanto o comercial digita
- Reforço redundante: um selo/círculo sólido preenchido com a cor exata aparece ao lado do campo (fora do input), para o indicador não depender só do preenchimento de fundo
- Se custo_final ainda não estiver preenchido (item aguardando cotação), não aplicar nenhuma cor nem selo — mostrar o campo no estado neutro padrão
- O percentual calculado NUNCA aparece em nenhum lugar da interface do comercial — nem como texto, nem como tooltip, nem no PDF. É puramente uma cor
- Para compras e gestor, essa mesma lógica de cor pode ser exibida opcionalmente já que eles têm acesso a ambos os números de qualquer forma — não é obrigatório

## Fase 28 — Frete, modo de faturamento e item "em estoque" exclusivos do Comercial

Restringe a visibilidade de três elementos que hoje eram visíveis também para Compras, tornando-os exclusivos do Comercial (o Gestor continua vendo/editando tudo, por ser regra permanente do sistema — nunca há campo escondido do Gestor).

28.1 — Frete e Modo de faturamento invisíveis para Compras
Os campos valor_frete e modo_faturamento (aba Dados) deixam de aparecer inteiramente na tela de Compras — nem como leitura, nem como edição. Continuam visíveis e editáveis normalmente para Comercial e Gestor. Esses campos só fazem sentido preencher a partir do momento em que o pedido está em PEDIDO_COTADO (Orçamento Cotado) ou além, já que dependem do custo já estar definido — mas a restrição de visibilidade é por PERFIL (nunca aparecem pra Compras), não por status.

28.2 — Papel de Compras no Orçamento Cotado é só mover o card
Reforça que, na etapa ORÇAMENTO COTADO, a única ação de Compras é arrastar o card para lá (a partir de EM_COTACAO). Nenhum campo de frete, modo de faturamento ou preço de venda é visível ou editável por Compras nessa etapa — esses são preenchidos pelo Comercial. Não altera a Fase 22.2: os campos de cotação (fornecedor, preço, custo final) continuam editáveis por Compras/Gestor a qualquer momento, normalmente.

28.3 — Item "Já em estoque" exclusivo do Comercial
A marcação/checkbox em_estoque (fase 26) deixa de ser editável por Compras — só Comercial (e Gestor) podem marcar ou desmarcar. Além disso, itens marcados como em_estoque = true ficam completamente invisíveis para Compras em qualquer lugar do sistema (não só na aba Cotações) — Compras enxerga exclusivamente os itens que ainda precisam ser cotados.

## Fase 29 — Comercial em modo somente-leitura durante "Orçamento em Cotação"

Enquanto o pedido está com status EM_COTACAO (Orçamento em Cotação), o Comercial (não o Gestor) fica em modo estritamente somente-leitura: nenhuma edição é permitida, e apenas um subconjunto mínimo de informação é exibido.

O que o Comercial vê nesse status (somente leitura, sem nenhum controle editável):
- Número do pedido
- Dados do cliente (nome, CNPJ, telefone, contato) — exibidos, não editáveis
- Lista de itens sendo cotados: descrição, quantidade, CA, tamanho/número/cor, observação — exibidos, não editáveis

O que o Comercial NÃO vê nesse status:
- Nenhum campo de Frete ou Modo de faturamento (mesmo sendo campos dele em outras etapas — fase 28)
- Nenhum campo de Preço de venda (mesmo em itens marcados como "em estoque" — fase 26)
- Nenhum botão de ação (arquivar, marcar como perdido, duplicar, gerar orçamento no Omie, etc.) — todos ficam ocultos ou desabilitados nesse status especificamente para o Comercial
- A aba Cotações continua nunca visível para o Comercial (regra já existente, não muda)

Quando o status muda: assim que o Compras move o pedido para PEDIDO_COTADO (Orçamento Cotado), todas as permissões normais do Comercial voltam a valer (frete, modo de faturamento, preço de venda, ações do pedido) — a restrição desta fase vale exclusivamente enquanto o status for EM_COTACAO.

Gestor não é afetado: o Gestor continua com acesso total e irrestrito em qualquer status, incluindo EM_COTACAO — essa fase restringe apenas o perfil Comercial.

## Fase 30 — Múltiplas empresas (RHOCAL e MATSEG) — troca de "workspace" dentro do mesmo login

Uma segunda empresa do mesmo nicho passa a operar no mesmo CRM, com o mesmo login de cada colaborador. Dentro do sistema, existe um seletor de empresa ativa — trocar de empresa é como trocar de workspace inteiro: logo, cores, kanban, busca, arquivados e painel executivo passam a refletir a empresa selecionada. Clientes e produtos são compartilhados entre as duas no Omie (recurso "Compartilhamento de Cadastros entre Aplicativos" do próprio Omie), mas cada empresa é um "aplicativo" Omie distinto, com App Key/App Secret próprios.

Conceito central — "empresa ativa":
- Existe um seletor visível no header (ex: dropdown ou toggle com o logo de cada empresa), disponível para todos os perfis, em qualquer tela
- A empresa selecionada vira o contexto ativo da sessão naquele navegador (guardado em localStorage, para lembrar da última escolha daquele usuário/dispositivo)
- Trocar a empresa ativa NÃO desloga nem troca de usuário — é só o contexto de dados e visual que muda

O que muda ao trocar de empresa ativa:
1. Identidade visual: logo no header e a cor de destaque (accent-primary) do sistema trocam para a da empresa ativa (RHOCAL: laranja #F1592A + logo RHOCAL; MATSEG: amarelo #F9C304 + logo MATSEG). As demais cores funcionais do design system (azul de compras, verde de sucesso, âmbar de alerta) permanecem as mesmas nas duas — são cores de status, não de marca
2. Kanban: mostra somente os pedidos cuja empresa_id é a empresa ativa — RHOCAL e MATSEG NÃO aparecem misturadas no mesmo quadro
3. Busca, Arquivados, Painel executivo: igualmente escopados pela empresa ativa — cada tela reflete só os dados daquela empresa
4. Criação de pedido: ao criar um "Novo Orçamento", o pedido é automaticamente vinculado à empresa ativa no momento da criação (empresa_id preenchido sozinho, sem precisar de campo de seleção manual no formulário)
5. PDF do orçamento (fase 21): usa o logo, cores, razão social, CNPJ, IE, endereço e telefone da empresa à qual aquele pedido pertence (a empresa em que ele foi criado, não necessariamente a empresa ativa no momento de gerar o PDF — o pedido "pertence" à empresa da criação, permanentemente)
6. Chamadas ao Omie relacionadas a um pedido (buscar cliente, buscar produto, buscar fornecedor, cadastrar cliente, gerar orçamento, converter em Pedido de Venda) usam sempre o par de credenciais da empresa DONA daquele pedido (não da empresa ativa no momento, para evitar inconsistência caso o usuário troque de empresa no meio de uma operação)

Dados das duas empresas:

RHOCAL:
- Razão social: RHOCAL EQUIPAMENTOS DE SEGURANÇA LTDA
- Nome fantasia: RHOCAL
- CNPJ: 53.263.859/0001-50
- IE: 206.912.722.113
- Endereço: Av. Capitão Francisco César, 842 — Vila Pindorama, Barueri-SP, CEP 06415-000
- Telefone: (11) 4161-6675
- Logo: /public/rhocal-logo.png
- Cor de destaque (marca): #F1592A (laranja)
- Cor secundária: —
- Credenciais Omie: OMIE_APP_KEY_RHOCAL / OMIE_APP_SECRET_RHOCAL

MATSEG:
- Razão social: MATI SERG EQUIPAMENTOS DE SEGURANÇA E SERVIÇOS GERAIS LTDA
- Nome fantasia: MATSEG
- CNPJ: 46.540.967/0001-67
- IE: (não informada)
- Endereço: Rua Marechal Deodoro, 253 — Loja 02, Vila Engenho Novo, Barueri-SP, CEP 06415-130
- Telefone: (11) 96747-1574
- Logo: /public/matseg-logo.png
- Cor de destaque (marca): #F9C304 (amarelo)
- Cor secundária: #060606 (preto)
- Credenciais Omie: OMIE_APP_KEY_MATSEG / OMIE_APP_SECRET_MATSEG

Schema:
create table empresas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome_fantasia text not null,
  razao_social text not null,
  cnpj text not null,
  ie text,
  endereco text not null,
  telefone text not null,
  logo_path text not null,
  cor_primaria text not null,
  cor_secundaria text,
  criado_em timestamptz not null default now()
);

alter table pedidos add column empresa_id uuid references empresas(id);

insert into empresas (slug, nome_fantasia, razao_social, cnpj, ie, endereco, telefone, logo_path, cor_primaria, cor_secundaria) values
('rhocal', 'RHOCAL', 'RHOCAL EQUIPAMENTOS DE SEGURANÇA LTDA', '53.263.859/0001-50', '206.912.722.113', 'Av. Capitão Francisco César, 842 — Vila Pindorama, Barueri-SP — CEP: 06415-000', '(11) 4161-6675', '/rhocal-logo.png', '#F1592A', null),
('matseg', 'MATSEG', 'MATI SERG EQUIPAMENTOS DE SEGURANÇA E SERVIÇOS GERAIS LTDA', '46.540.967/0001-67', null, 'Rua Marechal Deodoro, 253 — Loja 02, Vila Engenho Novo, Barueri-SP — CEP: 06415-130', '(11) 96747-1574', '/matseg-logo.png', '#F9C304', '#060606');

RLS: leitura liberada para todos os perfis autenticados (é dado de configuração, não sensível).

Credenciais Omie: as variáveis de ambiente OMIE_APP_KEY/OMIE_APP_SECRET existentes são renomeadas para OMIE_APP_KEY_RHOCAL/OMIE_APP_SECRET_RHOCAL (mesmos valores, só o nome muda). Novas variáveis OMIE_APP_KEY_MATSEG/OMIE_APP_SECRET_MATSEG são adicionadas com as credenciais da MATSEG. Todas as rotas server-side que chamam a API do Omie (/api/omie/*) passam a receber um parâmetro indicando qual empresa (ex: empresaSlug) usar para escolher o par de credenciais correto.

Implementação técnica sugerida:
- Um EmpresaContext (React Context) na aplicação, com o slug da empresa ativa e os dados completos dela (nome, logo, cores), carregado a partir do localStorage (default: rhocal)
- As cores de marca (accent-primary e, se aplicável, uma cor secundária) tornam-se CSS custom properties atualizadas dinamicamente pelo EmpresaContext, em vez de fixas no Tailwind config
- Todas as queries de listagem (kanban, busca, arquivados, painel executivo) recebem .eq('empresa_id', empresaAtivaId) como filtro
- O seletor no header troca o valor do contexto e persiste no localStorage

## Fase 31 — Módulo de Oportunidades/Prospecção (novo funil, anterior ao pedido) + sincronização com o CRM do Omie

Novo processo dentro do próprio RHOCAL CRM: um funil de Oportunidades/Prospecção, separado do kanban de pedidos já existente, para acompanhar negócios ainda em fase de contato/qualificação — antes de virarem um orçamento de verdade. Inspirado no módulo de CRM do Omie ("Oportunidades"), mas como uma aba própria do nosso sistema, com sincronização opcional para o Omie.

Conceito: Oportunidade → (evolui) → vira um Pedido (Novo Orçamento, fluxo já existente) quando o negócio amadurece. Uma oportunidade pode também ser perdida antes de virar pedido.

Nova aba de navegação: "Oportunidades", no header, ao lado de Kanban/Busca/Arquivados/Painel — visível para comercial e gestor (compras não participa dessa etapa pré-venda). Escopada pela empresa ativa (fase 30), como tudo mais no sistema.

Nova tabela oportunidades:
```sql
create table oportunidades (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  empresa_id uuid not null references empresas(id),
  cliente_nome text not null,
  cliente_cnpj text,
  cliente_telefone text,
  cliente_contato text,
  origem text,
  temperatura text,
  valor_estimado numeric,
  status text not null default 'NOVO_LEAD',
  motivo_perda text,
  omie_oportunidade_id bigint,
  pedido_id uuid references pedidos(id),
  criado_por uuid not null references profiles(id),
  criado_em timestamptz not null default now(),
  ultima_movimentacao timestamptz not null default now(),
  movido_por uuid references profiles(id)
);
alter table oportunidades enable row level security;
create policy "oportunidades leitura" on oportunidades for select to authenticated using (true);
create policy "oportunidades escrita" on oportunidades for all to authenticated using (true) with check (true);
```

Etapas do funil (kanban de Oportunidades) — provisórias, a confirmar/ajustar após a investigação das Fases do Processo configuradas no Omie:
1. NOVO_LEAD — "Novo Lead"
2. EM_CONTATO — "Em Contato"
3. QUALIFICADO — "Qualificado"
4. PROPOSTA — "Proposta Enviada"
5. GANHO — "Convertida em Orçamento" (terminal, positivo)
6. PERDIDO — "Perdida" (terminal, negativo, com motivo obrigatório — mesmo padrão do Fase 13 de pedidos)

Conversão em pedido: botão "Converter em Orçamento" disponível em qualquer etapa não-terminal da oportunidade. Ao clicar, cria um novo pedido (fluxo já existente, status inicial PEDIDO) pré-preenchido com os dados do cliente da oportunidade (nome, CNPJ, telefone, contato), vinculado via oportunidades.pedido_id, e move a oportunidade automaticamente para GANHO.

Marcar como perdida: mesmo padrão do Fase 13 — motivo obrigatório (select com opções + detalhe opcional).

Auditoria: reaproveitar os mesmos triggers/padrão de audit_log já existente (a tabela já é genérica por tabela/registro_id), aplicando também às tabelas oportunidades.

Alertas de tempo parado: mesmo padrão do kanban de pedidos (3 dias = âmbar, 7 dias = arquivamento — ou nesse caso, mover automaticamente para uma situação "esfriada"/inativa a definir).

✅ Investigação concluída — mapeamento confirmado (RHOCAL e MATSEG usam a mesma configuração padrão do Omie, sem personalização):

Fases do Processo do Omie (fixas em 6, mesmas nas duas empresas):
1. 01 Prospect
2. 02 Qualificação
3. 03 Apresentação
4. 04 Proposta
5. 05 Negociação
6. 06 Conclusão (registra ganho ou perda, com status e motivo separados)

Mapeamento nosso status ↔ Fase do Omie:
- NOVO_LEAD → 01 Prospect
- EM_CONTATO → 01 Prospect
- QUALIFICADO → 02 Qualificação
- PROPOSTA → 04 Proposta
- GANHO → 06 Conclusão (status "Ganho")
- PERDIDO → 06 Conclusão (status "Perdido", com motivo)

Origens de Oportunidade configuradas no Omie (usar exatamente estes valores no campo origem): Ativo, Ativo Telemarketing, Email MKT, Indicação Cliente, Bing, Telemarketing, Google, Anúncio. Adicionar também "Lead Frio / Reativação" (valor próprio do nosso sistema, não existe no Omie — ao sincronizar, mapear para "Ativo" como fallback, já que é prospecção ativa).

Motivos de Conclusão configurados no Omie (usar ao marcar como perdida, mapeando com os motivos já usados no nosso sistema para os mais próximos): Preço, Tecnologia, Marca, Referências, Orçamento, Oportunidade nunca existiu, Ordem da Matriz, Projeto cancelado internamente, Projeto Futuro.

Sincronização com o CRM do Omie (após a investigação):
1. Ao criar uma oportunidade, criar automaticamente uma Oportunidade correspondente no Omie (IncluirOportunidade, usando as credenciais da empresa — fase 30), salvando o omie_oportunidade_id retornado
2. A cada movimentação de etapa no nosso funil, atualizar a etapa da Oportunidade no Omie via AlterarOportunidade
3. Ao marcar como perdida, refletir no Omie com o motivo de conclusão correspondente
4. Ao converter em pedido (GANHO), refletir no Omie como oportunidade ganha
5. Tratar falhas de sincronização sem bloquear o uso do CRM — se a chamada ao Omie falhar, registrar em error_log (fase 25) e seguir normalmente

Nova tabela tarefas (acompanhamento — vale tanto para oportunidades quanto para pedidos):
```sql
create table tarefas (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid references oportunidades(id),
  pedido_id uuid references pedidos(id),
  descricao text not null,
  responsavel uuid references profiles(id),
  data_prevista date,
  concluida boolean not null default false,
  criado_por uuid not null references profiles(id),
  criado_em timestamptz not null default now()
);
alter table tarefas enable row level security;
create policy "tarefas leitura" on tarefas for select to authenticated using (true);
create policy "tarefas escrita" on tarefas for all to authenticated using (true) with check (true);
```

Interface: aba "Tarefas" tanto no modal de oportunidade quanto no modal de pedido, para comercial e gestor, com responsável, data prevista e status de conclusão.

Botão "Importar do Omie": exclusivo do gestor, disponível na tela de Oportunidades. Ao clicar, chama `ListarOportunidades` da API do Omie usando a credencial da empresa ativa (fase 30 — cada empresa é um app Omie separado) e cria, no nosso banco, uma oportunidade nova para cada registro do Omie ainda não importado — status inicial sempre `NOVO_LEAD` por padrão, independente da etapa em que a oportunidade esteja no Omie (o mapeamento fino de etapas continua pendente da investigação já registrada acima). Evita duplicar comparando com `omie_oportunidade_id` já gravado: só insere as que ainda não têm esse vínculo no nosso banco.

**Formato real confirmado ao vivo** (nada disso é documentado explicitamente no portal do desenvolvedor Omie — só foi possível confirmar chamando a API de verdade, mesmo padrão de cautela já usado nas fases 18.5/20):
- `ListarOportunidades` no endpoint `https://app.omie.com.br/api/v1/crm/oportunidades/` devolve o array em `cadastros` (não `oportunidades_cadastro`, que seria o padrão do resto da integração Omie deste projeto). Cada item vem com os dados agrupados em sub-objetos: `identificacao.nCodOp` (id da oportunidade), `identificacao.nCodConta` (código da "Conta" — cliente, ver abaixo), `ticket.nTicket` (valor estimado — confirmado comparando vários registros reais, inclusive um com valor zerado de verdade), `fasesStatus.{nCodFase,nCodStatus,nCodMotivo}` (códigos numéricos opacos, gravados brutos em `oportunidades.omie_fase_bruta` sem tradução). A API limitou a 100 registros por página mesmo pedindo `registros_por_pagina: 200` — paginação completa ainda não implementada, o botão importa só a primeira página por clique
- O nome do cliente **não** vem em `identificacao.cDesOp` (é uma descrição da oportunidade, tipo "CLIENTE LTDA - Solução 01 (1)", não o nome limpo) nem existe um campo de nome solto no item. É preciso resolver `identificacao.nCodConta` numa chamada separada
- **`nCodConta` é uma "Conta" do módulo CRM, uma entidade própria — não é o mesmo espaço de código do cadastro geral de Clientes** (`geral/clientes/`). `ConsultarCliente`/`codigo_cliente_omie` com esse código retorna erro ("Cliente não cadastrado para o Código [...]"). A resolução correta é `ConsultarConta` no endpoint `https://app.omie.com.br/api/v1/crm/contas/`, com o parâmetro **`{ nCod: <código> }`** — camelCase, diferente do padrão snake_case (`codigo_produto`, `codigo_cliente_omie`) usado no resto da integração Omie deste projeto. A resposta traz nome em `identificacao.cNome`, CNPJ em `identificacao.cDoc` e telefone em `telefone_email.cNumTel` — os três são salvos em `cliente_nome`/`cliente_cnpj`/`cliente_telefone` da oportunidade importada, numa única chamada por conta (deduplicada: uma só por conta, mesmo que várias oportunidades novas pertençam à mesma)
- **`ConsultarCliente` tem um rate limit próprio da Omie** ("API bloqueada por consumo indevido", ~25 min de espera) que foi disparado durante os testes deste botão — motivo a mais para nunca usar esse endpoint pra resolver `nCodConta`, além de estar simplesmente errado

Perfil comercial usado pelo SDR (pré-vendas): o mesmo login/perfil `comercial` cobre tanto o vendedor de orçamento quanto o SDR de prospecção — sem perfil dedicado. Reflexo disso no campo `origem` da oportunidade: a lista de opções ganha "Lead Frio / Reativação" como valor comum de uso do SDR, ao lado das demais origens já digitáveis livremente nesse campo.

## Fase 32 — Ferramentas de trabalho para o SDR + inteligência de funil

Três melhorias priorizadas para o SDR trabalhar mais rápido e gerar dado confiável para análise posterior.

### 32.1 — Log de tentativas de contato

Registro do que já foi FEITO (diferente de tarefas, que registra o que ainda vai ser feito).

```sql
create table interacoes (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid references oportunidades(id),
  pedido_id uuid references pedidos(id),
  tipo text not null,
  resultado text not null,
  observacao text,
  registrado_por uuid not null references profiles(id),
  criado_em timestamptz not null default now()
);
alter table interacoes enable row level security;
create policy "interacoes leitura" on interacoes for select to authenticated using (true);
create policy "interacoes escrita" on interacoes for all to authenticated using (true) with check (true);
```

Interface: nova sub-seção "Histórico de contato" no modal de oportunidade, com formulário rápido (tipo: Ligação/WhatsApp/E-mail/Reunião + resultado: Atendeu/Não atendeu/Agendou retorno/Recusou/Outro + observação opcional) e lista cronológica dos registros já feitos. Visível para comercial e gestor.

### 32.2 — Funil com conversão por etapa no Painel executivo

Estender o Painel executivo (fase 14), com uma seção dedicada a Oportunidades (só gestor):
- Contagem de oportunidades por etapa
- Taxa de conversão entre etapas consecutivas
- Tempo médio até o primeiro contato (diferença entre criado_em e a primeira linha em interacoes daquela oportunidade)
- Conversão por origem (taxa de GANHO por valor de origem, incluindo "Lead Frio / Reativação")
- Filtro de período, reaproveitando o mesmo padrão de filtro já usado no painel de pedidos

### 32.3 — Cadastro relâmpago de lead

Um formulário compacto e rápido para o SDR cadastrar um lead em segundos: nome do cliente + telefone + origem. Botão "Cadastro rápido" separado do "Novo Lead" completo, abrindo um modal pequeno. Ao salvar, cria a oportunidade normalmente (status NOVO_LEAD), completando os demais dados depois, a qualquer momento.

## Fase 33 — Kanban de Tarefas: importação, sincronização bidirecional com o Omie e melhorias próprias

Nova página `/tarefas`, separada dos modais de oportunidade/pedido (onde a aba Tarefas da fase 31 continua existindo) — um kanban dedicado ao acompanhamento do dia a dia do Comercial/SDR, agrupado por **PRAZO**, diferente do Omie (que agrupa por situação).

Colunas `tarefas` estendidas: `tipo` (text, opcional — Ligação/WhatsApp/E-mail/Reunião/Outro), `situacao` (text, default `'Pendente'`; `'Realizada'` mantido em sincronia com `concluida` em todo lugar que a tarefa é concluída), `importante`/`urgente` (boolean, default false), `omie_tarefa_id` (bigint), `empresa_id` (uuid, references empresas), `descricao_completa_omie` (text — ver 33.5).

Link "Tarefas" no header, visível para comercial e gestor (mesma regra de acesso de Oportunidades — compras não participa).

### 33.1 — Kanban por PRAZO

4 colunas, calculadas (não são movidas manualmente, sem drag-and-drop):
- **Atrasadas** — `data_prevista` no passado e `situacao != 'Realizada'` (destaque vermelho)
- **Hoje** — `data_prevista = hoje`
- **Futuras** — `data_prevista` no futuro, ou tarefa sem `data_prevista` preenchida
- **Concluídas** — `situacao = 'Realizada'` (tem prioridade sobre a data: uma tarefa realizada cai aqui mesmo que a data prevista seja passada/hoje/futura)

Escopado pela empresa ativa (`EmpresaContext`, via `tarefas.empresa_id`). Cada cartão mostra: descrição, cliente (resolvido via `oportunidade_id`/`pedido_id`), tipo (se preenchido), responsável, data prevista, e badges quando `importante`/`urgente`.

### 33.2 — Quatro melhorias próprias

- **Minha fila**: toggle no topo da página, filtra a visão para `responsavel = usuário logado`
- **Concluir com um clique**: botão no próprio cartão, marca `situacao = 'Realizada'` e `concluida = true` direto, sem abrir modal
- **Encadeamento**: ao concluir, abre um formulário opcional "Criar próxima tarefa?" (descrição + data sugerida = hoje + 3 dias), vinculado à mesma oportunidade/pedido — pode ser dispensado sem criar nada
- **Contador de tentativas**: na aba Tarefas do modal de oportunidade, mostra quantas tarefas com tipo de contato (Ligação/WhatsApp/E-mail/Reunião) já foram marcadas como Realizada

### 33.3 — Importação do `ListarTarefas` (Omie CRM) — formato confirmado ao vivo

Igual às integrações anteriores (fases 18.5/20/31), nada abaixo está documentado no portal do desenvolvedor Omie — só foi possível confirmar chamando a API de verdade:

- Endpoint `https://app.omie.com.br/api/v1/crm/tarefas/`, call `ListarTarefas`. Diferente do `ListarOportunidades`, os campos vêm **achatados direto no item** (sem sub-objetos `identificacao`/`ticket`/`fasesStatus`): `cDescricao`, `cImportante`/`cUrgente`/`cRealizada` ("S"/"N"), `cHora` ("HH:MM"), `dData` ("DD/MM/AAAA"), `nCodAtividade` (código de atividade opaco, não mapeado), `nCodNotif`, `nCodOp` (código da Oportunidade — **mesmo espaço de código de `identificacao.nCodOp` do `ListarOportunidades`**, usado para linkar a tarefa importada à nossa oportunidade via `omie_oportunidade_id`), `nCodTarefa` (id da tarefa, salvo em `omie_tarefa_id`), `nCodUsuario`/`nIncluidoPor` (códigos de usuário do Omie, sem mapeamento para `profiles.id` neste projeto)
- **`registros_por_pagina` tem teto real de 100** mesmo pedindo mais (confirmado pedindo 500, a API devolveu 100) — mesmo comportamento já visto no `ListarOportunidades`
- **`cRealizada` funciona como filtro server-side**, mesmo sem estar documentado: passar `cRealizada: 'N'` derrubou `total_de_registros` de 5033 para 83 num teste ao vivo contra a conta da RHOCAL. `filtrar_realizada` (nome alternativo testado) é rejeitado (`FILTRAR_REALIZADA não faz parte da estrutura`) — o nome certo é o mesmo campo do retorno (`cRealizada`)
- **`cDescricao` não é uma descrição curta** — na prática é um log corrido, com várias entradas de datas diferentes concatenadas na mesma tarefa (ex: histórico de tentativas de contato ao longo de meses). Decisão: `descricao` guarda uma versão truncada (~300 caracteres + "…"), e o texto original completo vai para `descricao_completa_omie` — nada é perdido, só a exibição padrão fica resumida (um "ver mais" no detalhe da tarefa fica para depois, não implementado ainda)

Botão **"Importar tarefas do Omie"**, exclusivo do gestor, na página `/tarefas`. Importa **por padrão só as pendentes** (`cRealizada: 'N'`) — decisão consciente para não inundar o kanban com anos de histórico já concluído (nada impede importar o resto depois, se fizer sentido). Evita duplicar comparando `omie_tarefa_id` já gravado. Resolve `oportunidade_id` via `nCodOp` → `oportunidades.omie_oportunidade_id`; tarefa cujo `nCodOp` ainda não corresponde a nenhuma oportunidade nossa (oportunidade ainda não importada) é importada mesmo assim, só fica com `oportunidade_id = null`. `responsavel` fica sempre `null` nas tarefas importadas — sem tentativa de mapear `nCodUsuario`/`nIncluidoPor`, a equipe reatribui manualmente.

### 33.4 — Sincronização bidirecional (`IncluirTarefa`/`AlterarTarefa`)

Ao criar ou editar uma tarefa no nosso CRM (TarefasTab, kanban `/tarefas`, encadeamento), reflete no Omie via rota server-side `POST /api/omie/sincronizar-tarefa`, usando as credenciais da empresa da oportunidade vinculada (fase 30). Ao concluir uma tarefa aqui (por qualquer caminho — checkbox na aba Tarefas ou botão "Concluir" no kanban), o mesmo fluxo marca `cRealizada: 'S'` lá.

**Só sincroniza tarefas vinculadas a uma oportunidade que já tem `omie_oportunidade_id`** — o módulo CRM do Omie só tem tarefas presas a Oportunidades, não existe equivalente para tarefas de pedido (`pedido_id`) nem para oportunidades ainda não sincronizadas com o Omie. Nesses casos a sincronização é pulada silenciosamente (não é erro, só não se aplica).

**`IncluirTarefa`/`AlterarTarefa` foram implementados por inferência** (simetria com os campos que o próprio `ListarTarefas` devolve — `cDescricao`, `dData`, `cHora`, `cImportante`, `cUrgente`, `cRealizada`, mais `nCodOp` no Incluir e `nCodTarefa` no Alterar), **sem confirmação ao vivo com uma escrita de teste** — ao contrário do resto da investigação desta fase, não foi feita uma chamada de gravação real contra a conta de produção do Omie sem autorização explícita. `cHora` usa um horário fixo de fallback (`'09:00'`), já que a UI não coleta horário. Caso os nomes de campo estejam errados, o Omie retorna um fault, que cai no tratamento do parágrafo abaixo — vale conferir `error_log` (fase 25) depois do primeiro uso real para validar o formato.

Falhas de sincronização (Omie fora do ar, campo rejeitado, credencial ausente) são registradas em `error_log` (fase 25) e **nunca bloqueiam a tela** — a tarefa já está salva no nosso banco antes de qualquer tentativa de sincronizar, e a chamada ao Omie é best-effort/fire-and-forget a partir do client.

### 33.5 — Schema

```sql
alter table public.tarefas add column if not exists tipo text;
alter table public.tarefas add column if not exists situacao text not null default 'Pendente';
alter table public.tarefas add column if not exists importante boolean not null default false;
alter table public.tarefas add column if not exists urgente boolean not null default false;
alter table public.tarefas add column if not exists omie_tarefa_id bigint;
alter table public.tarefas add column if not exists empresa_id uuid references public.empresas(id);
alter table public.tarefas add column if not exists descricao_completa_omie text;
```

## Fase 34 — Módulo de Clientes

Cadastro próprio de clientes no CRM, centralizando o que hoje acontece espalhado a cada Novo Orçamento/Novo Lead (busca por nome/CNPJ no Omie, fallback na Receita Federal, cadastro manual no Omie — fases 18.2/23/24). Em vez de repetir essa busca a cada pedido ou oportunidade, mantém um cadastro único, pesquisável e sincronizado com o Omie.

Nova aba "Clientes" no header (`/clientes`), visível a **todos os perfis** — junto com Kanban/Busca/Arquivados, é uma das únicas telas sem restrição por setor (compras também participa, diferente de Oportunidades/Tarefas/Painel).

**Tabela `clientes` (já criada no Supabase):**
- **Não é escopada por `empresa_id`** — diferente de pedidos/oportunidades/tarefas. RHOCAL e MATSEG compartilham o mesmo cadastro de clientes no Omie (fase 30, recurso "Compartilhamento de Cadastros entre Aplicativos"): o mesmo `codigo_cliente_omie` vale para as duas contas, então um único registro nosso serve às duas empresas — não existe um "dono" fixo do registro como em pedidos/oportunidades. Chamadas ao Omie feitas a partir desta tela usam a empresa **ativa** no seletor do header no momento da chamada.
- Campos: `razao_social`, `nome_fantasia`, `cnpj` (dígitos, único quando preenchido), `telefone`, `contato`, `email`, `endereco`, `endereco_numero`, `bairro`, `cidade`, `estado`, `cep`, `observacoes` (texto livre, adicionado na fase 35 pra alimentar a ficha do cliente na Inteligência Comercial), `omie_cliente_id` (único quando preenchido), `criado_por`, `criado_em`, `atualizado_em` (atualizado via trigger a cada edição, mesmo padrão de `ultima_movimentacao`).

**Página `/clientes`:**
- Listagem com busca por nome ou CNPJ (filtro simples sobre os clientes carregados)
- Botão "Novo Cliente" abre o formulário de cadastro; clicar numa linha da lista abre o mesmo formulário em modo edição
- Botão "Importar clientes do Omie", exclusivo do gestor — mesma posição/padrão visual do botão equivalente em Oportunidades (fase 31) e Tarefas (fase 33.3)

**Formulário de cadastro/edição — reaproveita ao máximo a lógica das fases 23/24:**
- Campo CNPJ com busca automática ao perder o foco: primeiro consulta o Omie (`ListarClientes` filtrando por `cnpj_cpf`, mesma rota `POST /api/omie/buscar-cliente-cnpj` da fase 18.2/23, enviando a empresa ativa como `empresaSlug`); se não encontrado, cai no fallback da Receita Federal (`POST /api/cnpj/consultar`, fase 23), preenchendo razão social/nome fantasia/telefone/endereço automaticamente
- Encontrado no Omie: preenche razão social/nome fantasia e vincula `omie_cliente_id` — o cliente já nasce sincronizado
- Encontrado só na Receita Federal (ainda não cadastrado no Omie): preenche os campos disponíveis e mostra o aviso já existente da fase 23 ("Cliente encontrado na Receita Federal, mas ainda não está cadastrado no Omie") — o cadastro no Omie acontece no momento de salvar (ver sincronização abaixo)
- Não encontrado em nenhum dos dois: segue com preenchimento manual, sem bloquear

**Sincronização bidirecional com o Omie — reaproveita `POST /api/omie/cadastrar-cliente` (fase 24), que ganha suporte a edição:**
- Salvar um cliente **sem** `omie_cliente_id`: a rota chama `IncluirCliente` (comportamento já existente da fase 24) e grava o `codigo_cliente_omie` retornado
- Salvar um cliente **com** `omie_cliente_id` já preenchido: a rota passa a aceitar um `codigoClienteOmie` no corpo da requisição — quando presente, chama `AlterarCliente` em vez de `IncluirCliente` (mesmo formato de payload/campos de entrada). Igual à fase 33.4, `AlterarCliente` foi implementado por simetria com `IncluirCliente`, sem confirmação ao vivo de uma escrita de teste — falhas caem no tratamento de erro padrão e ficam registradas em `error_log` (fase 25), e vale conferir lá após o primeiro uso real
- Falha na sincronização com o Omie **nunca** impede salvar o cliente no nosso banco — o registro local é sempre salvo primeiro; o erro do Omie aparece só como um banner `accent-danger`, mesmo padrão das outras integrações

**Botão "Importar clientes do Omie"** (rota nova `POST /api/omie/importar-clientes`, exclusiva do gestor — checagem também no servidor, não só escondendo o botão): usa `ListarClientes` com paginação (teto real de 100 registros por página, mesmo comportamento já confirmado nos outros `Listar*` do Omie — fases 31/33.3) e evita duplicar comparando `omie_cliente_id` já gravado. Usa a empresa ativa (`empresaSlug`) para resolver as credenciais.

**Integração com o campo de cliente em Novo Orçamento (`NovoOrcamentoModal`) e Novo Lead (`NovaOportunidadeModal`/`CadastroRelampagoModal`, fase 32.3):** a busca por nome (fase 18.2) e por CNPJ (fase 23) passam a consultar primeiro a tabela `clientes` local — mais rápida, sem round-trip ao Omie/Receita. Na busca por nome, os resultados locais aparecem combinados com os do Omie (quando aplicável); na busca por CNPJ, um cliente já cadastrado localmente é usado direto, pulando a chamada ao Omie/Receita nesse caso. Selecionar uma sugestão vinda da tabela local também preenche telefone e nome do contato quando disponíveis — dado que a busca direta no Omie não tinha, já que o cadastro do Omie não guarda esses dois campos.

### Schema

```sql
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text,
  telefone text,
  contato text,
  email text,
  endereco text,
  endereco_numero text,
  bairro text,
  cidade text,
  estado text,
  cep text,
  observacoes text, -- fase 35: alimenta a ficha do cliente na Inteligência Comercial
  omie_cliente_id bigint,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.clientes enable row level security;

drop policy if exists "clientes leitura" on public.clientes;
create policy "clientes leitura" on public.clientes for select to authenticated using (true);

drop policy if exists "clientes escrita" on public.clientes;
create policy "clientes escrita" on public.clientes for all to authenticated using (true) with check (true);

drop index if exists clientes_cnpj_unico;
create unique index clientes_cnpj_unico on public.clientes (cnpj) where cnpj is not null;
drop index if exists clientes_omie_cliente_id_unico;
create unique index clientes_omie_cliente_id_unico on public.clientes (omie_cliente_id) where omie_cliente_id is not null;
```

## Fase 35 — Inteligência Comercial (segmentação RFM para campanhas de marketing)

Página `/inteligencia`, exclusiva do **gestor** (mesma regra de acesso do Painel executivo — link "Inteligência" no header só aparece pra esse perfil, e a página redireciona qualquer outro perfil pro Kanban). Não é um relatório fixo como o Painel (fase 14): é uma ferramenta de segmentação — cruza clientes + oportunidades + pedidos + interações, filtra por múltiplos critérios combinados e exporta o resultado em CSV para campanhas de marketing/reativação (Meta Ads, Google Ads, RD Station etc.).

**Escopo:** pedidos e oportunidades são filtrados pela empresa **ativa** (`EmpresaContext`, mesmo padrão do Painel/fase 30) — a base de comparação é sempre "os clientes da RHOCAL" ou "os clientes da MATSEG", nunca as duas juntas; trocar de empresa no seletor do header já refiltra a página inteira, sem precisar de um seletor próprio dentro da tela. Já a tabela `clientes` (fase 34) **não** é escopada por empresa (cadastro compartilhado no Omie) — entra como enriquecimento (e-mail, cidade/UF, CEP, observações) quando existe um cadastro correspondente; nem todo cliente com pedido/oportunidade no histórico tem necessariamente um registro em `clientes` ainda, então esses campos podem aparecer vazios até o cadastro ser feito.

**Como um "cliente" é identificado (matching):** nenhuma das quatro tabelas (`clientes`, `pedidos`, `oportunidades`, `interacoes`) tem FK direta pras outras — a junção é reconstruída em memória com um **union-find** sobre os identificadores disponíveis, priorizando `cliente_omie_id` (só existe em `pedidos` e em `clientes.omie_cliente_id`) e caindo pra CNPJ (dígitos) e depois nome normalizado como fallback:
- Um registro que carregue **dois identificadores ao mesmo tempo** (ex: um cadastro em `clientes` com `omie_cliente_id` E `cnpj` preenchidos, ou um pedido com `cliente_omie_id` E `cliente_cnpj` preenchidos) serve de **ponte** entre os dois espaços de chave — é assim que um pedido só com `cliente_omie_id` e uma oportunidade do mesmo cliente só com `cliente_cnpj` acabam caindo no mesmo grupo, mesmo sem nenhum dos dois registros conhecer o identificador do outro diretamente
- `interacoes` e `tarefas` não entram nesse matching por identificador — elas se conectam ao grupo através da FK que já têm (`oportunidade_id`/`pedido_id`), então herdam o cliente da oportunidade/pedido a que já pertencem
- É uma heurística, não uma chave garantida — um cliente cujo nome está escrito de formas diferentes em registros sem CNPJ nem `cliente_omie_id` preenchido em nenhum deles não é unificado automaticamente
- Todo cliente cadastrado em `clientes` (fase 34) aparece na tela mesmo com **zero** pedidos/oportunidades — o cruzamento não exige histórico prévio, só existir o cadastro

**O que conta como "compra" (para Recência/Frequência/Valor):** um pedido só entra nas métricas RFM se ele **já passou** pelo status `PEDIDO_EFETUADO` em algum momento ("pedido convertido") — reconstruído a partir do `audit_log` (mesma técnica já usada no Painel para tempo médio por etapa/taxa de conversão), não pelo status atual. Isso é necessário porque o job de arquivamento por inatividade (7 dias sem movimentação) acaba arquivando a maioria dos pedidos efetuados depois de um tempo — se a métrica olhasse só `status = PEDIDO_EFETUADO`, ela perderia quase todo o histórico já arquivado. A **data da compra** é o momento em que o `audit_log` registra a primeira transição para `PEDIDO_EFETUADO`. Pedidos que nunca chegaram a `PEDIDO_EFETUADO` (orçamentos perdidos, abandonados, ainda em cotação) não contam pra Recência/Frequência/Valor, mas aparecem normalmente no histórico completo da ficha do cliente e na "quantidade total de pedidos" (que conta qualquer status).

Duas contagens de pedidos aparecem lado a lado, com propósitos diferentes:
- `qtdPedidosTotal`: **todos** os pedidos do cliente, qualquer status (orçamentos ainda em aberto, perdidos, etc.)
- `qtdPedidosEfetuados`: só os convertidos — é essa que alimenta Frequência (RFM) e o filtro "Frequência de compra"

**Temperatura automática** — badge colorido calculado a partir da Recência (dias desde o último pedido convertido), sem depender de nenhum campo manual:
- 🟢 **Verde**: último pedido convertido há **menos de 90 dias**
- 🟡 **Amarelo**: último pedido convertido entre **91 e 180 dias**
- 🔴 **Vermelho**: último pedido convertido **há mais de 180 dias**
- ⚪ **Cinza**: nunca teve um pedido convertido (inclui quem só tem oportunidade, sem pedido nenhum, e quem tem pedidos mas nenhum chegou a `PEDIDO_EFETUADO`)

Esses limiares (90/180 dias) são uma decisão de produto desta fase, ajustada pro ciclo de recompra de EPI (mais espaçado que varejo comum) — não é um valor cravado, ajustável depois se a segmentação não bater com a realidade.

**Diferente da temperatura manual** (`oportunidades.temperatura`, texto livre digitado pelo comercial na fase 31 — o filtro sugere "Quente"/"Morno"/"Frio" como atalho, mas aceita qualquer outro valor já usado nos dados) — as duas colunas aparecem lado a lado porque respondem perguntas diferentes: a automática mede histórico de compra real, a manual mede a percepção do comercial sobre o momento do lead. Quando um cliente tem mais de uma oportunidade, usa-se a mais recente (`criado_em`) pra temperatura manual, **etapa do funil**, **origem**, **valor estimado** (soma do `valor_estimado` das oportunidades ABERTAS do cliente, não só da mais recente) e **data de criação**.

**Vendedor** = quem criou (`criado_por`) o registro mais recente do cliente entre pedidos e oportunidades (qualquer um dos dois, o que for mais novo).

**Interações** (`interacoes`, fase 32.1): contadas e resumidas por cliente via as mesmas FKs `oportunidade_id`/`pedido_id` usadas pra tarefas — quantidade total, tipo mais frequente (`tipo` com mais ocorrências) e data da mais recente ("último contato").

### Cards de resumo (topo da página, mesmo padrão visual do Painel)

Refletem o conjunto **filtrado** (não a base inteira) — dão feedback imediato de quantos clientes cada filtro deixa de pé:
- Total ativos (verde) / esfriando (amarelo) / frios (vermelho) / sem compra (cinza)
- Valor total em pipeline: soma do `valor_estimado` das oportunidades abertas de todos os clientes filtrados
- Ticket médio geral: média ponderada (soma do valor de todos os pedidos convertidos ÷ soma da quantidade de pedidos convertidos) — não a média simples dos tickets médios individuais, que sobre-representaria cliente de baixo volume

### Filtros (combináveis entre si — E lógico entre todos, todos opcionais)

- Temperatura automática (verde/amarelo/vermelho/cinza, múltipla escolha)
- Temperatura manual (Quente/Morno/Frio sugeridos + qualquer valor livre encontrado nos dados)
- Etapa do funil (`OPORTUNIDADE_STATUS_LABELS`, fase 31)
- Origem (`ORIGEM_OPCOES`, fase 31, mais qualquer valor livre encontrado nos dados)
- Última compra: faixas fixas — últimos 30/60/90/180 dias, ou "nunca comprou" (em vez de um intervalo de datas livre)
- Frequência de compra: faixas fixas sobre `qtdPedidosEfetuados` — 1 pedido / 2 a 5 pedidos / 6 pedidos ou mais
- Ticket médio: faixas fixas — até R$ 1.000 / R$ 1.000–5.000 / acima de R$ 5.000
- Cidade (contém, texto livre) / UF (valores encontrados nos dados)
- Vendedor (valores encontrados nos dados)
- Empresa ativa: não é um filtro dentro da página — é o seletor do header (`EmpresaContext`), que já escopa toda a consulta de pedidos/oportunidades (ver "Escopo" acima)

### Tabela de resultados

Colunas: nome, CNPJ, cidade/UF, temperatura automática (badge), temperatura manual, última compra, qtd. pedidos (efetuados, com o total geral ao lado quando diferente), ticket médio, etapa do funil, origem, vendedor, qtd. interações. Checkbox de seleção por linha (+ selecionar todos os filtrados).

### Exportar CSV

Botão "Exportar CSV", gerado **client-side** com `papaparse` (`Papa.unparse`) — sem round-trip ao servidor, já que os dados já estão todos carregados na tela. Exporta os clientes **selecionados** (se nenhum estiver selecionado, exporta todos os que passaram pelo filtro atual); BOM UTF-8 na frente do arquivo pra acentuação não corromper ao abrir no Excel. Colunas do CSV (nesta ordem, uma linha por cliente): nome, razão social, nome fantasia, CNPJ, e-mail, telefone, contato, cidade, UF, CEP, observações, temperatura automática, temperatura manual, etapa funil, origem, valor estimado pipeline, vendedor, data criação oportunidade, última compra, qtd. pedidos total, qtd. pedidos efetuados, ticket médio, valor total acumulado, itens mais comprados (top 5, formato "descrição (qtd); descrição (qtd)..."), qtd. interações, tipo de interação mais usado, último contato.

### Ver ficha

Botão "Ver ficha" por linha, abre um modal com:
- **Dados cadastrais**: razão social, nome fantasia, CNPJ, e-mail, telefone, contato, cidade/UF, CEP, vendedor e observações (quando preenchidos)
- **Resumo de compras (RFM)**: última compra, qtd. de pedidos (total/efetuados), ticket médio, valor total acumulado, itens mais comprados (top 5)
- **Histórico de pedidos**: todos os pedidos do cliente (qualquer status, não só os convertidos) — número, status, data, valor
- **Oportunidades abertas**: oportunidades do cliente com status fora de `GANHO`/`PERDIDO`
- **Tarefas pendentes**: tarefas (`situacao != 'Realizada'`) vinculadas a alguma oportunidade ou pedido desse cliente
- **Histórico de contato**: resumo (qtd., tipo mais usado, último contato) + as 10 interações mais recentes (tipo, resultado, data)

## Fase 36 — Inteligência Comercial avançada: score de propensão, alertas de churn e histórico de campanhas

Estende a página `/inteligencia` (fase 35) com três ferramentas de ação sobre a base já segmentada: um score que ranqueia quem tem mais chance de comprar de novo, um alerta automático de quem está saindo do padrão de recompra, e um jeito de guardar campanhas já disparadas pra medir o resultado depois.

### 36.1 — Score de propensão à compra (0-100)

Calculado por cliente, direto na agregação já existente (`agregarClientesInteligencia`), a partir de 4 fatores normalizados pra 0-100 cada e depois combinados por peso:

| Fator | Peso | Normalização (0-100) |
|---|---|---|
| Recência | 35% | `100 − (dias_desde_última_compra / 365) × 100`, limitado a [0,100]. Cliente sem nenhum pedido efetuado (`ultimaCompra = null`) recebe 0 |
| Frequência | 30% | `min(qtd_pedidos_efetuados / 10, 1) × 100` — 10 pedidos efetuados ou mais já satura em 100 |
| Valor | 25% | `valor_total_acumulado / maior_valor_total_acumulado_da_base × 100` — normalizado pelo maior valor acumulado **entre os clientes carregados na tela** (empresa ativa), não um teto fixo cravado; se ninguém da base tem valor acumulado, todos ficam em 0 |
| Temperatura da oportunidade | 10% | Mapeamento fixo sobre `oportunidades.temperatura` (texto livre) da oportunidade mais recente do cliente: "Quente" = 100, "Morno" = 50, "Frio" = 0. Sem oportunidade ou com valor livre não mapeado: 50 (neutro — não penaliza a falta do dado como se fosse "Frio") |

`score = round(frequência×0,30 + recência×0,35 + valor×0,25 + temperatura×0,10)`, sempre um inteiro entre 0 e 100.

Exibição: nova coluna "Score" na tabela de resultados, com badge colorido (reaproveita as mesmas cores da temperatura automática — verde/âmbar/vermelho já usadas na fase 35, sem inventar paleta nova) — **verde 70-100, amarelo 40-69, vermelho 0-39**. Coluna ordenável: clicar no cabeçalho alterna desc → asc → ordem padrão (por nome). Novo filtro "Score de propensão" (Alto 70-100 / Médio 40-69 / Baixo 0-39), combinável com os demais filtros da fase 35.

Esses pesos e limiares (10 pedidos = teto de frequência, 365 dias = piso de recência, faixas 70/40 do badge) são decisão de produto desta fase — ajustável depois se a régua não bater com a realidade comercial, mesmo espírito dos limiares 90/180 da fase 35.

### 36.2 — Alertas de churn

Reaproveita a mesma técnica de intervalo médio já usada no Motor de Recompra Preditiva (`src/lib/recompra/calculo-recorrencia.ts`) — média dos intervalos, em dias, entre compras consecutivas — só que calculada **por cliente** (sobre as datas de primeira efetuação de cada pedido, mesma fonte que já alimenta Recência/Frequência/Valor na fase 35) em vez de por item/categoria.

- `intervalo_médio_dias` = média dos intervalos entre pedidos efetuados consecutivos. Exige pelo menos **2** pedidos efetuados — sem isso não há base pra média, e o cliente não entra no cálculo (não é "risco zero", é "sem dado suficiente pra avaliar")
- Cliente em alerta quando `dias_desde_última_compra > 1,5 × intervalo_médio_dias`

Seção dedicada no **topo da página** (acima dos cards de resumo), título "⚠️ Clientes em risco de churn (X)" — mostra o conjunto completo de clientes em risco da empresa ativa, **independente dos filtros de segmentação** aplicados mais abaixo na tela (é um painel de monitoramento fixo, não parte do fluxo de filtro/exportação). Cada linha mostra nome, dias desde a última compra e o intervalo médio de referência, com um botão "Criar tarefa".

"Criar tarefa" abre um formulário compacto (mesmos campos da aba Tarefas — descrição, responsável, data prevista, tipo, importante/urgente — fases 32/33), pré-preenchido com uma descrição sugerida ("Contatar {cliente} — risco de churn"). A tarefa criada é vinculada automaticamente: à oportunidade **aberta mais recente** do cliente, se existir (permite sincronizar com o Omie, mesma regra da fase 33.4); senão, ao **pedido mais recente** do cliente (sempre existe, já que entrar em alerta de churn exige histórico de pelo menos 2 pedidos efetuados). `empresa_id` da tarefa é sempre a empresa ativa no momento.

### 36.3 — Histórico de campanhas

Reaproveita as tabelas `campanhas` e `campanha_clientes`, já criadas no Supabase:

```sql
create table campanhas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  nome text not null,
  descricao text,
  filtros_aplicados jsonb,
  total_clientes integer not null,
  criado_por uuid not null references profiles(id),
  criado_em timestamptz not null default now()
);

create table campanha_clientes (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references campanhas(id),
  cliente_omie_codigo text,
  cliente_nome text not null,
  cliente_cnpj text,
  status text not null default 'enviado'
    check (status in ('enviado', 'convertido', 'nao_convertido')),
  convertido_em timestamptz,
  pedido_id uuid references pedidos(id)
);
```

**Salvar campanha:** botão "Salvar como campanha", ao lado de "Exportar CSV" — mesma base de clientes (selecionados na tabela, ou todos os filtrados se nada estiver selecionado). Pede um nome (obrigatório) e uma descrição (opcional) num modal curto. Ao confirmar:
- Insere em `campanhas`: `empresa_id` = empresa ativa, `filtros_aplicados` = snapshot serializado do estado atual de todos os filtros da fase 35/36.1 (inclusive o novo filtro de score), `total_clientes` = tamanho da base salva, `criado_por` = usuário logado
- Insere em `campanha_clientes`, uma linha por cliente da base, com `status` no valor padrão `'enviado'`: `cliente_omie_codigo` (o `omie_cliente_id` do cliente, convertido pra texto — vem do cadastro em `clientes`/fase 34 quando existe, senão do `cliente_omie_id` mais recente entre os pedidos do cliente), `cliente_nome`, `cliente_cnpj`

**Sub-aba "Campanhas"** dentro de `/inteligencia` (junto da aba "Segmentação", que é a tela atual da fase 35/36.1/36.2): lista as campanhas da empresa ativa — nome, data de criação, total de clientes, e um resumo legível dos filtros usados (só os campos que estavam preenchidos no momento do salvamento).

**"Ver resultado" por campanha:** recalcula e **persiste** o resultado em `campanha_clientes.status` (é pra isso que os 3 valores do `check` existem — `'enviado'` é o estado pendente de avaliação, a ação resolve pra `'convertido'` ou `'nao_convertido'`, idempotente: pode ser clicado de novo depois pra reavaliar com pedidos mais recentes). Pra cada cliente da campanha, busca entre os pedidos da mesma empresa criados **depois de `campanhas.criado_em`** (qualquer status — diferente da métrica RFM da fase 35, aqui não exige `PEDIDO_EFETUADO`: qualquer pedido novo já é sinal de reengajamento) um que bata com o cliente, na mesma prioridade de identificador usada no resto da fase 35 (`cliente_omie_codigo` > CNPJ > nome normalizado). Se achar, marca `status = 'convertido'`, `convertido_em` = data do pedido encontrado (o mais antigo depois da campanha) e `pedido_id`; se não achar nenhum, marca `status = 'nao_convertido'`. Exibe o resultado agregado: "X de Y clientes fizeram pelo menos 1 pedido depois desta campanha (Z%)".

**RLS:** o schema enviado pelo usuário não incluía `enable row level security`/policies — testado ao vivo (insert anônimo contra a API), confirmou-se que RLS já estava ativo sem nenhuma policy permissiva (bloqueava até usuário autenticado). Migração `0011_campanhas_rls.sql` libera leitura/escrita pra qualquer autenticado, mesmo padrão já usado em `oportunidades`/`tarefas`/`interacoes` — precisa rodar no SQL Editor do Supabase antes de usar 36.3 em produção.
