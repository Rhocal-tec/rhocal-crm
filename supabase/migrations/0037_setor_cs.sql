-- Novo perfil CS (pós-venda / Customer Success) no enum setor_tipo.
-- Precisa ficar SOZINHO e rodar ANTES da 0038: o Postgres não permite usar um
-- valor novo de enum na mesma transação em que ele foi adicionado.
alter type setor_tipo add value if not exists 'cs';
