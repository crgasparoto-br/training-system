# Issue 299 — endereço do lead após matrícula

## Problema

O pré-cadastro grava o endereço em `StudentProfile.identificationData`, fonte canônica da identidade. Ao confirmar a matrícula, algumas telas do cadastro do aluno ainda consultam a projeção legada em `Profile`, que não era atualizada pela transição para `ACTIVE_STUDENT`.

## Decisão

- `StudentProfile.identificationData` continua sendo a única fonte canônica editável.
- A ativação atualiza somente a projeção legada do `Profile` vinculado.
- A projeção ocorre apenas quando a conta pertence a exatamente um registro `Aluno`.
- Vínculos ambíguos não recebem dados tenant-scoped no perfil global.
- Uma migration idempotente repara matrículas já confirmadas antes desta correção.

## Campos projetados

- logradouro;
- número;
- complemento;
- bairro;
- cidade;
- estado;
- CEP.

A mesma fronteira também mantém as demais projeções pessoais já previstas pelo serviço de identidade, sem criar um segundo registro de aluno, usuário ou perfil.

## Arquivos

- `apps/api/src/modules/alunos/student-lifecycle-enrollment.service.ts`
- `apps/api/src/modules/alunos/student-lifecycle-enrollment.service.test.ts`
- `apps/api/prisma/migrations/20260806165000_issue_299_project_lead_address/migration.sql`
- `apps/api/tests/issue-299-lead-address-projection.contract.test.ts`

## Validação esperada

1. Executar os testes focados do serviço de matrícula e do contrato da migration.
2. Executar type-check, lint, testes da API, migrations e `pnpm validate` pelo workflow oficial.
3. Em uma base de teste, preencher endereço completo no pré-cadastro, confirmar a matrícula e abrir o cadastro do mesmo aluno.
4. Confirmar que o `Aluno.id` não mudou e que todos os campos de endereço estão visíveis.
5. Confirmar que uma conta vinculada a mais de um aluno não recebe projeção automática.

## Rollback

A alteração de aplicação pode ser revertida sem apagar a identidade canônica. A migration apenas atualiza a projeção legada e não remove nem modifica `StudentProfile.identificationData`.
