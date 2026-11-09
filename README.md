# SIPA

## Configuração do PostgreSQL

1. Crie o banco `sipa` (ou configure `PGDATABASE` com outro nome).
2. Execute [`database.sql`](./database.sql) nesse banco.
3. Na Vercel, configure uma destas variáveis com a URL de conexão:
   `DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL` ou
   `POSTGRES_URL_NON_POOLING`.

O arquivo `database.sql` também cria a tabela `raffles`, que registra vários
ganhadores por dia, com um novo `id`, data e nome em cada sorteio. Essa etapa
é uma migração manual: a Vercel não executa o arquivo automaticamente. Depois
de alterar o schema, faça um novo deploy da aplicação.

Se o banco já existia antes da versão atual, execute esta migração no banco
remoto para remover a coluna antiga:

```sql
ALTER TABLE participants DROP COLUMN IF EXISTS registration;
```

Para execução local, a API também aceita `PGHOST`, `PGPORT`, `PGDATABASE`,
`PGUSER` e `PGPASSWORD`.