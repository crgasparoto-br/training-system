# Rollout do catálogo comercial de serviços

## Objetivo

Aplicar o catálogo estruturado da épica #210 por contrato sem interromper o cadastro de aluno, contratos ou consumidores ainda dependentes de `GET /services`.

## Ordem obrigatória

1. Publicar e aplicar a migration `20260710230000_services_commercial_catalog`.
2. Publicar a API e a interface na mesma janela de rollout.
3. Executar a carga em simulação para cada contrato alvo.
4. Revisar conflitos e a quantidade de registros projetados.
5. Executar a carga real somente após a revisão.
6. Validar o catálogo, o Serviço de Interesse e os vínculos contratuais.

A API nova depende das tabelas e colunas da migration. O comando de produção da API executa `prisma migrate deploy` antes de iniciar o servidor, evitando que uma versão nova consulte um schema antigo.

## Recuperação quando a API foi iniciada antes da migration

O erro PostgreSQL `42703` com mensagem semelhante a `column "category" does not exist` indica que a aplicação nova está conectada a um banco que ainda não recebeu a migration do catálogo.

A partir da raiz do repositório, execute:

```bash
pnpm --filter @corrida/api db:migrate:prod
```

Em seguida, reinicie a API. Não use `prisma db push` para essa correção, pois o histórico de migrations precisa permanecer consistente entre os ambientes.

## Comando de simulação

A partir da raiz do repositório:

```bash
pnpm --filter @corrida/api db:bootstrap-services-catalog -- --contract-id <id-do-contrato> --dry-run
```

A simulação informa:

- serviços que seriam criados;
- opções comerciais que seriam criadas;
- quantidade de itens de apresentação e componentes;
- serviços preservados;
- conflitos que exigem revisão manual.

## Comando com gravação

```bash
pnpm --filter @corrida/api db:bootstrap-services-catalog -- --contract-id <id-do-contrato>
```

A carga é incremental e idempotente por códigos estáveis:

- não remove registros legados;
- não sobrescreve serviço já existente;
- não duplica serviço, opção, item textual ou componente reconhecido;
- registra divergências de nome como conflito em vez de corrigi-las silenciosamente.

## Matriz inicial

A carga cadastra os nove serviços confirmados no material "Serviços ACESSO 2026":

1. Consultas de Avaliação Física;
2. Plano Essencial | Personal Trainer;
3. Acesso Run;
4. Consultoria On-line;
5. Plano Vida Saudável;
6. Plano Performance e Saúde;
7. Plano Longevidade e Saúde;
8. Plano Vida sem Dor;
9. Plano Tratamento da Obesidade.

Os preços são cadastrados como `fixed`, `free` ou `on_request`. Componentes externos que ainda não possuem serviço próprio no catálogo permanecem nos itens de apresentação; os vínculos relacionais iniciais usam as opções confirmadas do Plano Essencial.

## Compatibilidade e rollback

Durante o rollout:

- `ServiceOption` continua sendo o agregado principal e preserva IDs já usados por alunos e contratos;
- `GET /services` projeta serviços e opções estruturadas no formato legado;
- as antigas ofertas com `parentServiceId` permanecem armazenadas, mas deixam de ser a fonte da nova tela;
- rollback da aplicação pode usar a interface/API anterior porque os registros legados não são apagados.

A reversão da migration não deve ser feita enquanto houver dados nas novas tabelas. Em caso de falha, reverta primeiro a aplicação e preserve a migration até planejar uma migração reversa de dados.

## Checklist pós-carga

- conferir nove serviços e ordem comercial;
- conferir preços do Plano Essencial de 1x a 5x;
- conferir estados Gratuito e Sob consulta das avaliações;
- conferir os cinco planos combinados e seus componentes do Plano Essencial;
- abrir e salvar cada categoria de serviço;
- validar busca, filtros, inativos e visão Combinações e valores;
- cadastrar/editar aluno e confirmar Serviço de Interesse;
- validar contratos gerados e vínculos existentes;
- executar novamente em `--dry-run` e confirmar ausência de novas criações inesperadas;
- registrar contrato, ambiente, operador e resultado na issue/PR.
