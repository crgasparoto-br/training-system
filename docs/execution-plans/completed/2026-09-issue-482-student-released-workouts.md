# Plano: Issue 482 - treinos liberados na experiência do aluno

## Objetivo

Permitir que o aluno autenticado consulte, em modo somente leitura, os treinos liberados pelo professor sem expor templates em elaboração ou dados de outro aluno/contrato.

## Contexto

- Issue #482.
- Base de implementação: `develop`.
- `WorkoutTemplate.released` permanece a única fonte de verdade de visibilidade.
- O contexto do aluno reutiliza a resolução existente de `/api/v1/student/me`.
- `TrainingPlan` não possui `contractId`; o tenant é validado pelo `Aluno` relacionado ao plano.

## Fora de escopo

- edição ou criação de treino pelo aluno;
- novas ações de execução, conclusão, PSR/PSE ou feedback;
- alteração do fluxo de liberação usado pelo professor;
- reutilização de endpoints administrativos como fronteira de autorização do aluno.

## Arquivos e modulos principais

- `apps/api/src/routes/student.routes.ts`
- `apps/api/src/modules/workout/student-workout.service.ts`
- `apps/web/src/pages/StudentWorkouts.tsx`
- `apps/web/src/services/student-workout.service.ts`
- `apps/web/src/pages/Home.tsx`
- `apps/web/src/App.tsx`
- `docs/student-app-data-contract.md`

## Regras e restricoes

- `released=true` deve ser aplicado no backend na lista e no detalhe.
- `releasedAt` é metadado e nunca substitui `released`.
- O cliente não fornece `alunoId` como autoridade.
- A consulta exige simultaneamente `plan.alunoId` e `plan.aluno.contractId`.
- IDs inexistentes, não liberados ou fora do contexto retornam o mesmo 404 público.
- A interface é somente leitura e preserva histórico, loading, vazio e erro recuperável.

## Passos de implementacao

- [x] Implementar consultas tenant-scoped de lista e detalhe.
- [x] Expor endpoints no namespace `student/me`.
- [x] Criar serviço web com propagação de `x-contract-id`.
- [x] Criar tela responsiva de lista/detalhe e acesso pela home.
- [x] Adicionar testes focados para autorização, fonte de verdade e contexto contratual.
- [x] Atualizar o contrato de dados do aluno.

## Criterios de aceite

- [x] Filtros de liberação, aluno e tenant ficam no backend.
- [x] Listagem determinística preserva treinos históricos.
- [x] Detalhe somente leitura não expõe campos internos do professor.
- [x] Home e rota próprias de Meus Treinos existem.
- [x] UI contempla loading, vazio, erro recuperável, atual/próximo e histórico.
- [x] Documentação canônica foi atualizada.
- [ ] `pnpm validate` passa no candidato publicado.

## Validacao manual

1. Entrar como aluno com um único vínculo e consultar `/student/workouts`.
2. Confirmar que treino `released=false` não aparece mesmo se possuir `releasedAt`.
3. Liberar um template pelo fluxo do professor e confirmar aparecimento sem intervenção adicional.
4. Abrir detalhe próprio e validar dias/exercícios.
5. Tentar ID de outro aluno, de outro contrato e não liberado; todos devem retornar resposta pública equivalente.
6. Repetir com conta que exige `x-contract-id`.
7. Validar lista, vazio e erro em 1440x900, 1366x768 e 390x844.

## Decisoes e pendencias

- A API mantém ordenação cronológica crescente; a UI coloca atual/próximo antes do histórico e mostra o histórico do mais recente para o mais antigo.
- A validação completa é executada pelo CI porque o ambiente connector-only desta entrega não possui checkout local utilizável.
