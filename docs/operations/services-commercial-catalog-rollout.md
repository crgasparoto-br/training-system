# Rollout do catálogo comercial de serviços

## Objetivo

Aplicar o catálogo estruturado da épica #210 por contrato sem interromper o cadastro de aluno, contratos ou consumidores ainda dependentes de `GET /services`.

## Ordem obrigatória

1. Confirmar backup recuperável do banco e registrar o identificador do backup.
2. Publicar e aplicar a migration `20260710230000_services_commercial_catalog`.
3. Publicar a API e a interface na mesma janela de rollout.
4. Executar a carga em simulação para cada contrato alvo.
5. Revisar conflitos e a quantidade de registros projetados.
6. Executar a carga real somente após a revisão.
7. Validar o catálogo, o Serviço de Interesse e os vínculos contratuais.
8. Repetir a simulação para comprovar idempotência e registrar a evidência na issue ou PR.

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

Registre a saída completa da simulação. Conflitos não devem ser corrigidos por edição direta no banco; alinhe o código estável e o nome na aplicação antes da carga real.

## Comando com gravação

```bash
pnpm --filter @corrida/api db:bootstrap-services-catalog -- --contract-id <id-do-contrato>
```

A carga é incremental e idempotente por códigos estáveis:

- não remove registros legados;
- não sobrescreve serviço já existente;
- não duplica serviço, opção, item textual ou componente reconhecido;
- registra divergências de nome como conflito em vez de corrigi-las silenciosamente.

Depois da carga, repita o comando com `--dry-run`. O resultado esperado é ausência de novas criações, exceto quando houver alteração intencional no catálogo de referência.

## Auditoria de impacto antes de mudanças sensíveis

A tela **Configurações > Serviços** possui o bloco **Auditoria de impacto do catálogo**. Selecione um serviço para revisar, sempre dentro do contrato autenticado:

- quantidade exata de planos ativos distintos afetados;
- alunos vinculados;
- vínculos contratuais do aluno;
- modelos de contrato;
- documentos contratuais gerados;
- componentes ativos do próprio plano;
- planos ativos que usam o serviço diretamente;
- planos ativos que usam opções comerciais do serviço.

A mesma informação está disponível em:

```http
GET /api/v1/services/catalog/:serviceId/impact
GET /api/v1/services/catalog/options/:optionId/impact
```

Os endpoints exigem autenticação e acesso a `settings.services`. O `contractId` é obtido da sessão; não é aceito como parâmetro do cliente. IDs de outro contrato recebem a mesma resposta de item não encontrado, sem revelar existência ou conteúdo.

### Confirmação de inativação

Ao inativar um serviço ou opção comercial, a interface consulta o impacto no backend e mostra a quantidade exata de planos ativos distintos afetados. A confirmação enviada à API contém:

- `resourceUpdatedAt`: versão observada do serviço ou opção;
- `affectedPlans`: quantidade observada de planos ativos afetados.

A API recalcula o impacto antes de gravar. Se a versão ou a quantidade tiver mudado entre a consulta e a confirmação, a operação retorna HTTP `409` e nenhuma alteração é salva. O usuário deve atualizar a análise e confirmar novamente.

A inativação preserva vínculos, componentes e documentos existentes para consulta histórica. O item deixa de ficar disponível para novos vínculos e composições. Novas composições não podem apontar para serviço ou opção comercial inativos, nem para registros de outro contrato.

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

A reversão da migration não deve ser feita enquanto houver dados nas novas tabelas. Em caso de falha:

1. interrompa novas alterações no catálogo;
2. reverta a aplicação para a versão anterior;
3. preserve a migration e os dados estruturados;
4. compare a carga executada com o backup e a saída da simulação;
5. planeje uma migração reversa explícita somente se a restauração dos dados for realmente necessária.

Não apague serviços, opções, componentes, modelos ou contratos para realizar rollback. A exclusão física fica fora do fluxo de rollout.

## Checklist pós-carga

- conferir nove serviços e ordem comercial;
- conferir preços do Plano Essencial de 1x a 5x;
- conferir estados Gratuito e Sob consulta das avaliações;
- conferir os cinco planos combinados e seus componentes do Plano Essencial;
- abrir e salvar cada categoria de serviço;
- validar busca, filtros, inativos e visão Combinações e valores;
- cadastrar/editar aluno e confirmar Serviço de Interesse;
- validar contratos gerados e vínculos existentes;
- consultar a auditoria de impacto de ao menos um serviço com referências e outro sem referências;
- validar confirmação de inativação com zero, um e múltiplos planos ativos;
- alterar uma composição entre a consulta e a confirmação e validar o conflito HTTP `409`;
- tentar criar composição com alvo inativo ou de outro contrato e confirmar o bloqueio;
- executar novamente em `--dry-run` e confirmar ausência de novas criações inesperadas;
- registrar contrato, ambiente, operador, backup, comandos, resultados e evidências na issue/PR.
