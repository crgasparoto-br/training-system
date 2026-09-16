# Plano: Issue #447 - regressão P2028 em transações

## Objetivo

Eliminar a regressão P2028 observada em produção no cadastro administrativo de aluno e na instalação de padrões do contrato, reduzindo trabalho redundante dentro das transações sem enfraquecer atomicidade, isolamento multi-tenant, idempotência ou preservação de customizações.

## Contexto

- Base de implementação: `develop`.
- O cadastro de aluno deve continuar usando `upsertStudentIdentity` e o mesmo `Prisma.TransactionClient` para toda conclusão atômica.
- `docs/architecture/student-lifecycle-data-ownership.md` continua sendo a fonte canônica de ownership do ciclo de vida do aluno.
- `docs/architecture/contract-defaults.md` define convergência, idempotência e preservação de customizações como invariantes; o mecanismo de lock é detalhe interno.
- O incidente em produção cruzou o limite padrão de 5s da transação interativa do Prisma.

## Fora de escopo

- Reverter as issues #425/#426.
- Reativar escrita em `AlunoIntakeForm.formResponses`.
- Introduzir um segundo `PrismaClient` dentro de transações.
- Alterar regras de negócio de serviço, contrato, avaliação ou biblioteca.
- Substituir a correção por simples aumento de timeout.

## Arquivos e módulos principais

- `apps/api/src/modules/alunos/aluno.service.ts`
- `apps/api/src/modules/alunos/student-administrative-form-responses.service.ts`
- `apps/api/src/modules/alunos/aluno-create.routes.ts`
- `apps/api/src/modules/alunos/student-create-error-boundary.ts`
- `apps/api/src/modules/contracts/contract-defaults.service.ts`
- `apps/api/src/modules/contracts/contract-defaults.routes.ts`
- testes focados dos dois fluxos e integrações com banco já existentes.

## Regras e restrições

- `contractId` deve permanecer tenant-scoped em todas as leituras e escritas.
- Writers canônicos que fazem parte da criação do aluno permanecem dentro da mesma transação.
- A criação não pode abrir conexão Prisma paralela para resolver serviço/identidade/formulário.
- Defaults existentes só recebem valores canônicos em campos vazios; customizações preenchidas não são sobrescritas.
- Chamadas concorrentes ao mesmo contrato devem convergir para um único conjunto lógico de defaults.
- Erros internos não podem expor mensagem Prisma/SQL ao cliente.
- Timeouts explícitos são apenas margem de segurança complementar após redução do trabalho crítico.

## Passos de implementação

- [x] Consolidar identificação básica e administrativa em uma única passagem pelo writer canônico no cadastro de aluno.
- [x] Reutilizar `contractId` já conhecido na criação para evitar consulta redundante no adapter administrativo.
- [x] Tornar reparo/backfill de exercícios set-based no PostgreSQL, mantendo fallback unitário apenas para doubles de teste sem `$executeRaw`.
- [x] Manter o lock concorrente por contrato e explicitar margem de timeout da transação após redução do número de round-trips.
- [x] Tornar a resposta de erro de `/contracts/install-defaults` segura e correlacionável.
- [x] Registrar operação, etapa, duração e correlation id em falhas/slow paths dos dois fluxos.
- [x] Atualizar testes estruturais, funcionais e de rota.
- [ ] Executar `pnpm validate`, `pnpm build` e integrações condicionais em ambiente com checkout/DB disponíveis.

## Criterios de aceite

- [x] Teste do cadastro cobre serviço, identificação, endereço, contato de emergência, preferências e financeiro no mesmo tx.
- [x] A criação atravessa `upsertStudentIdentity` uma única vez para o payload consolidável.
- [x] O teste de rollback real já existente continua fazendo parte da suíte de integração.
- [x] Backfill de múltiplos exercícios usa uma operação set-based em produção, sem `updateMany` por exercício.
- [x] Testes existentes continuam cobrindo idempotência, isolamento, preservação de customizações e concorrência entre duas conexões.
- [x] Erro P2028 da instalação não é devolvido ao cliente e mantém correlation id no envelope seguro.
- [ ] `pnpm validate` passa no SHA candidato.
- [ ] `pnpm build` passa no SHA candidato.
- [ ] Integrações com `RUN_DATABASE_INTEGRATION_TESTS=true` passam no SHA candidato.
- [ ] Riscos conhecidos foram registrados no PR.

## Validacao manual

1. Em `/alunos/new`, cadastrar aluno com serviço válido e formulário completo; confirmar criação integral sem P2028.
2. Induzir falha de identidade após criação de `User`/`Aluno` e confirmar rollback integral.
3. Em `/settings/contract`, instalar defaults em contrato vazio e reinstalar; confirmar mesma contagem lógica e ausência de duplicatas.
4. Em contrato com exercício customizado e campos canônicos vazios, reinstalar; confirmar preenchimento apenas dos vazios.
5. Disparar duas instalações simultâneas no mesmo contrato; confirmar convergência sem duplicação.
6. Simular erro interno da instalação; confirmar resposta pública genérica e correlation id, sem SQL/Prisma.

## Decisoes e pendencias

- Mantido `pg_advisory_xact_lock` por contrato porque a tabela de exercícios não possui unicidade `(contractId, name)` e removê-lo exigiria migration/deduplicação fora do escopo.
- O backfill produtivo passa a usar SQL set-based; os loops individuais permanecem apenas no caminho de doubles unitários que não expõem `$executeRaw`.
- Margem transacional de 15s foi adotada após o incidente ultrapassar o limite padrão de 5s; ela não substitui a redução de trabalho.
- Validações completas ficam a cargo da CI/remoto porque este runtime não possui checkout Git com acesso de rede.
