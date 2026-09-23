# Plano: Issue 467 — normalização canônica de estado civil

## Objetivo

Corrigir o salvamento da aba Identificação para que opções controladas exibam rótulos em português, trafeguem valores canônicos de `MaritalStatus` e sejam persistidas pela fronteira existente de `upsertStudentIdentity`, sem perder valores legados realmente desconhecidos.

## Contexto

A issue 467 identifica que `AlunoForm` usa rótulos localizados como valores do select e que a projeção legada `Profile.maritalStatus` pode receber `"Casado(a)"`, causando `PrismaClientValidationError`. A fonte canônica é `StudentProfile.identificationData.maritalStatus`; `Profile.maritalStatus` permanece apenas projeção de compatibilidade. O mapeamento normativo é: `Solteiro(a) -> single`, `Casado(a) -> married`, `União estável -> stable_union`, `Divorciado(a) -> divorced`, `Separado(a) -> separated`, `Viúvo(a) -> widowed`; vazio representa não informado.

Referências: `docs/architecture/student-lifecycle-data-ownership.md`, `apps/api/src/modules/alunos/student-identity.service.ts` e `apps/api/prisma/schema.prisma`.

## Fora de escopo

- Alterar o enum Prisma ou fazer backfill em massa.
- Alterar textos existentes da interface.
- Alterar regras financeiras da issue 463.
- Criar writer paralelo, cast inseguro ou captura genérica de erro Prisma.

## Arquivos e módulos principais

- `packages/types/student-lifecycle.ts` e `packages/types/index.ts`: catálogo compartilhado de valores/rótulos canônicos.
- `apps/web/src/utils/studentPersonalInfo.ts`: opções do select e normalização de leitura.
- `apps/web/src/utils/studentPersonalInfo.test.ts`: matriz de rótulos, valores canônicos, vazio e legado desconhecido.
- `apps/api/src/modules/alunos/student-administrative-form-responses.service.ts`: normalização na fronteira administrativa.
- `apps/api/src/modules/alunos/student-identity.service.ts`: preservação canônica e projeção Prisma segura.
- `apps/api/tests/student-administrative-form-responses.service.test.ts`: patch administrativo e regressão da projeção.
- `apps/web/src/pages/AlunoForm.marital-status-legacy.test.tsx`: regressão de leitura/persistência do formulário.

## Regras e restrições

- `StudentProfile.identificationData.maritalStatus` permanece a fonte canônica.
- Toda escrita administrativa continua passando por `upsertStudentIdentity`.
- Valores canônicos válidos devem ser preservados; rótulos conhecidos devem ser normalizados; valores desconhecidos devem continuar visíveis e não podem ser enviados ao enum Prisma como projeção.
- Valor vazio deve ser convertido para ausência/null, nunca para string vazia no enum.
- A mudança deve respeitar o escopo de tenant e a transação existente.

## Passos de implementação

- [x] Centralizar o catálogo canônico de estado civil e reutilizá-lo na UI e na API.
- [x] Alterar opções/normalização do frontend para enviar valores canônicos e manter legados desconhecidos visíveis.
- [x] Normalizar a entrada administrativa e proteger a projeção legada contra valores não pertencentes ao enum.
- [x] Adicionar testes positivos, controles negativos discriminantes e regressão de integração da fronteira.
- [x] Executar checks focados, validações de web/API e `pnpm validate`.
- [x] Executar auditoria somente leitura em contexto separado e corrigir qualquer finding antes da PR.

## Critérios de aceite

- [x] Casado(a) é enviado/persistido como `married` sem erro Prisma.
- [x] Todas as opções controladas usam valores canônicos e rótulos atuais.
- [x] Canônicos carregados continuam exibidos com rótulo português.
- [x] Legado desconhecido permanece visível e intacto em edição não relacionada.
- [x] Não informado não envia string vazia ao enum.
- [x] Não há writer paralelo ou tratamento que esconda erros Prisma.
- [x] Testes focados, type-check, lint e `pnpm validate` passam.

## Validação manual

1. Carregar um aluno com `identification.maritalStatus = "Casado(a)"`, alterar endereço e salvar; verificar payload `married` e ausência de erro.
2. Carregar cada valor canônico; verificar rótulo em português e payload sem degradação.
3. Carregar um legado desconhecido como `"Viúvo"`, alterar nome e salvar; verificar preservação.
4. Selecionar `Não informado`; verificar ausência/null no writer e nunca `''` no Prisma.

## Decisões e pendências

- O catálogo compartilhado será a única lista de valores/rótulos controlados; o read model continuará aceitando e exibindo valores históricos fora do catálogo.
- A projeção `Profile` somente recebe valores pertencentes ao enum; valores históricos desconhecidos permanecem na fonte canônica JSON até alteração explícita.
- Nenhuma pendência conhecida antes da validação e auditoria.
