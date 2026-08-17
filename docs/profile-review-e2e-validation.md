# Revisão cadastral: matriz de validação ponta a ponta

## Objetivo

Registrar a evidência executável da issue #345 para o fluxo integrado de revisão cadastral entre professor/gestor e aluno no web responsivo, sem transformar integrações externas em pré-requisito do produto.

A validação é composta por camadas porque cada risco precisa ser provado na fronteira adequada:

- navegador real com API real e PostgreSQL real para o contrato interno web -> HTTP/API -> domínio -> persistência;
- navegador com fixture isolada somente para ampliar a matriz de UX, responsividade, teclado e estados visuais determinísticos;
- PostgreSQL real para regressões focadas de persistência e transições de domínio;
- HTTP/rotas reais para autenticação, isolamento e autorização;
- adapters de SendGrid/Twilio com `fetch` simulado apenas na fronteira externa;
- suíte agregada do repositório para regressão de Central do Aluno, arquitetura, acesso e documentação.

Nenhum cenário desta matriz exige credenciais ou chamadas reais a SendGrid/Twilio.

## Fluxo integrado validado

1. Professor/gestor solicita uma revisão pela Central do Aluno.
2. O backend cria ou reutiliza uma única revisão `pending`, registra notificação in-app e tenta entrega externa conforme preferências/configuração.
3. O aluno autenticado acessa a pendência no contexto contratual ativo e abre `/student/profile-review`.
4. O aluno conclui sem alterações, com alteração direta ou com alteração sensível.
5. Alterações não sensíveis são aplicadas imediatamente na fonte canônica do cadastro.
6. Alterações sensíveis permanecem pendentes até aprovação ou rejeição do professor/gestor.
7. Repetição concorrente, falha de provider, contexto contratual inválido ou acesso indevido não criam uma segunda autoridade de estado nem sucesso falso.

## Matriz de cenários e evidências

| Cenário | Evidência executável | O que prova |
| --- | --- | --- |
| Solicitação manual + notificação in-app + repetição enquanto pendente | `apps/api/tests/profile-review-fullstack-http-browser.integration.test.ts`, `apps/api/tests/profile-review-flow.integration.test.ts` e `apps/api/src/modules/alunos/profile-review-request.service.test.ts` | criação/reuso pelas rotas autenticadas reais, persistência em PostgreSQL real, uma pendência por aluno e recuperação de conflito serializável |
| Pendência e abertura no web responsivo | `apps/api/tests/profile-review-fullstack-http-browser.integration.test.ts`, `apps/web/src/pages/StudentProfileReview.test.tsx` e `scripts/verify-issue-343-browser-evidence.cjs` | navegador real chegando à API real e ao banco, mais cobertura determinística de renderização, formulário e contexto `x-contract-id` |
| Concluir sem alterações | `apps/api/tests/profile-review-fullstack-http-browser.integration.test.ts`, `apps/api/tests/profile-review-flow.integration.test.ts` + evidência visual da #343 | transição `completed_no_changes`, remoção da pendência e UX mobile |
| Alteração não sensível | `apps/api/tests/profile-review-fullstack-http-browser.integration.test.ts`, `apps/api/tests/profile-review-flow.integration.test.ts` + evidência visual da #343 | payload produzido pelo web atravessa HTTP real e é aplicado em `StudentProfile.identificationData` |
| Alteração sensível + aprovação | `apps/api/tests/profile-review-fullstack-http-browser.integration.test.ts` e `apps/api/tests/profile-review-flow.integration.test.ts` | dado enviado pelo web não é aplicado antes da aprovação; a rota profissional real aplica somente depois |
| Alteração sensível + rejeição | `apps/api/tests/profile-review-fullstack-http-browser.integration.test.ts` e `apps/api/tests/profile-review-flow.integration.test.ts` | rejeição pela rota profissional real mantém dado canônico intacto e registra motivo/status |
| Sem provider externo configurado | fluxo full-stack + `apps/api/src/modules/notifications/notification-delivery.service.test.ts` | revisão e contrato interno permanecem funcionais sem outbound obrigatório; adapters retornam `not_configured` quando confirmação segura não está configurada |
| Provider configurado | `apps/api/src/modules/notifications/notification-delivery.service.test.ts` | SendGrid/Twilio recebem payload correlacionado; WhatsApp usa template aprovado |
| Falha simulada de provider | `apps/api/src/modules/notifications/notification-delivery.service.test.ts` e testes de feedback em `AlunoRevisoesCadastraisTab` | falha parcial permanece explícita e não desfaz a revisão persistida |
| Mesmo usuário em dois contratos | `apps/api/tests/profile-review-fullstack-http-browser.integration.test.ts`, `apps/api/tests/profile-review-flow.integration.test.ts` e `apps/api/tests/student-profile-review-boundary.routes.test.ts` | o `contractId` emitido pelo web chega à rota real e revisão do contrato A não aparece nem pode ser concluída no contrato B |
| Contrato revogado/ambíguo | `apps/api/tests/student-profile-review-boundary.routes.test.ts` | rejeição antes de consultar/aplicar revisão e exigência de seleção explícita |
| Professor fora do escopo/permissão | testes de rotas/segurança do módulo de alunos e `pnpm access:check` | API continua autoridade; ocultação do frontend não é usada como segurança |
| Erro de submissão | `scripts/verify-issue-343-browser-evidence.cjs` | erro recuperável sem mensagem de conclusão falsa |
| Mobile, desktop e teclado | `scripts/verify-issue-343-browser-evidence.cjs` | viewports 390x844 e 1366x768, ausência de overflow e acionamento por teclado |

## Uso de mocks e fixtures

`apps/api/tests/profile-review-fullstack-http-browser.integration.test.ts` é a prova discriminante dos contratos internos. Ele inicia o web Vite real e um servidor Express que monta as mesmas rotas de autenticação, professor e aluno usadas pela aplicação; o navegador não intercepta `/api/v1/**`. JWT, middlewares, schemas, serviços e clientes Prisma são reais, e as transições são verificadas no PostgreSQL efêmero do CI.

A evidência de navegador herdada da #343 continua interceptando a API para tornar cenários estritamente visuais determinísticos. Ela comprova UX, responsividade e estados do componente, mas não é usada como prova do contrato web -> API ou da persistência.

Nos testes de notificação, o único mock de integração é o transporte HTTP de SendGrid/Twilio. O código dos adapters, validação de configuração, correlação, template, status e tratamento de erro permanece real. O fluxo full-stack roda com configuração externa ausente para provar que provider não é pré-requisito da revisão.

Essa separação evita três falsos positivos: um teste de UI que “prova” backend por fixture, um teste direto de serviço que não atravessa a rota usada pelo cliente e um teste de provider que depende de serviço externo instável.

## Estados de interface que devem permanecer cobertos

A experiência do aluno deve manter comportamento explícito para:

- carregamento da revisão e do perfil;
- ausência de revisão pendente;
- erro ao carregar ou concluir;
- sessão inválida/expirada, tratada pelo fluxo global de autenticação;
- contexto contratual ausente, ambíguo, revogado ou fora do escopo;
- conclusão sem alterações;
- conclusão com aplicação direta;
- conclusão com análise profissional pendente.

A Central do Aluno deve preservar os estados de feedback da solicitação: revisão criada, pendência reutilizada, notificação deduplicada, provider não configurado e falha parcial de entrega.

## Gate automatizado

O gate canônico do repositório continua sendo:

```bash
pnpm validate
```

No workflow `Validate PR`, a suíte de API roda com `RUN_DATABASE_INTEGRATION_TESTS=true` e PostgreSQL efêmero após `prisma migrate deploy`. `apps/api/scripts/run-jest-tests.mjs` executa `profile-review-fullstack-http-browser.integration.test.ts` isoladamente para que o servidor Vite, o navegador e os clientes Prisma não compartilhem processo com outros testes de banco. Assim o caminho navegador -> HTTP real -> PostgreSQL participa do gate remoto.

O workflow também executa build e checks adicionais de arquitetura, acesso e documentação. O resultado do SHA candidato deve ser registrado no handoff de entrega; evidência de um SHA anterior não vale para o candidato final.

## Validação manual complementar

Quando houver preview/staging com login de teste disponível, validar sem provider real:

1. abrir a Central do Aluno no desktop e solicitar revisão;
2. repetir a solicitação enquanto a pendência estiver aberta e confirmar reutilização;
3. entrar como aluno no mesmo contrato e verificar a pendência em `/inicio`;
4. concluir sem alteração em viewport mobile;
5. solicitar nova revisão e alterar um campo não sensível;
6. solicitar nova revisão, alterar um campo sensível e aprovar como professor/gestor;
7. repetir com rejeição e motivo;
8. trocar para outro contrato da mesma conta e confirmar ausência de vazamento da revisão;
9. simular sessão expirada/falha HTTP e confirmar ausência de sucesso falso;
10. navegar por teclado e confirmar foco/acionamento das ações principais.

Credenciais de provider externo não fazem parte deste checklist. Quando um ambiente tiver SendGrid/Twilio configurado, a saúde operacional deve ser verificada pelos callbacks/status descritos em `docs/profile-review-notification-delivery.md`.
