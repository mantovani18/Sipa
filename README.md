# SIPA

## Configuração do PostgreSQL

1. Crie o banco `sipa` (ou configure `PGDATABASE` com outro nome).
2. Execute [`database.sql`](./database.sql) nesse banco.
3. Na Vercel, configure uma destas variáveis com a URL de conexão:
   `DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL` ou
   `POSTGRES_URL_NON_POOLING`.

Para execução local, a API também aceita `PGHOST`, `PGPORT`, `PGDATABASE`,
`PGUSER` e `PGPASSWORD`.