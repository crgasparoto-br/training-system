# PAR-Q canônico da pré-matrícula

## Finalidade e limites

O PAR-Q é um próximo passo recomendado e opcional depois da conclusão dos dados básicos da pré-matrícula. Ele identifica respostas que exigem análise de um profissional autorizado, mas não produz diagnóstico, prescrição, liberação médica ou autorização automática para treinar.

O estado do PAR-Q nunca altera automaticamente o estado comercial do aluno. A matrícula pode continuar enquanto o questionário está pendente ou aguardando análise, sem que isso seja interpretado como liberação clínica.

## Fonte de verdade

`StudentParqSubmission` é a única fonte canônica para novas submissões concluídas. Cada conclusão cria um registro histórico imutável. Uma nova resposta deliberada cria outra submissão; não sobrescreve a anterior.

`StudentParqDraft` guarda exclusivamente o rascunho em andamento, com versão otimista e consentimento. O rascunho não aparece como histórico concluído no PRNT.

`StudentOnboardingProcess` mantém somente o estado resumido e a referência `parqSubmissionId`. Respostas clínicas não são copiadas para o onboarding.

Os campos `AlunoIntakeForm.parqResponses` e `StudentHealthIntake.questionnaireParq` são fontes legadas somente leitura. Qualquer tentativa de nova gravação por fluxos antigos é recusada com `LEGACY_WRITE_DISABLED`.

A antiga aba PAR-Q do cadastro administrativo foi removida junto com o bloco de acesso `students.registration.parq`. Cadastro, edição e revisão cadastral não podem mais produzir respostas ou submissões clínicas. Profissionais consultam o histórico canônico e registram a análise exclusivamente pelo PRNT, usando a permissão específica de saúde.

## Catálogo versionado

O contrato compartilhado fica em `packages/types/pre-registration-parq.ts`.

A versão atual é `parq-2026-01`, com sete chaves estáveis, de `q1` a `q7`. Novas gravações com `q8`, chaves desconhecidas ou outra versão são recusadas. O backend valida a completude e calcula `positiveItems`, `positiveCount` e o estado final; o cliente não envia valores confiáveis para esses campos.

A versão histórica `parq-legacy-8-declaration-v1` existe apenas para preservar importações sustentáveis do formulário antigo, no qual `q8=true` representava a declaração. Uma mudança futura de perguntas deve criar nova versão; o histórico anterior nunca é reinterpretado.

## Estados

- `NOT_STARTED`: sem rascunho e sem submissão válida;
- `IN_PROGRESS`: rascunho persistido no servidor;
- `COMPLETED_NO_ALERT`: última submissão válida sem resposta positiva;
- `COMPLETED_REVIEW_REQUIRED`: última submissão válida com ao menos uma resposta positiva;
- `NEEDS_REPEAT`: somente legado incompatível, incompleto, divergente ou sem evidência suficiente para formar submissão válida.

## Fluxo autenticado

A rota pública do convite não lê nem grava PAR-Q. Depois da reivindicação, todas as operações usam sessão autenticada, o vínculo canônico do aluno, o mesmo `contractId` e, para responsável, autorização ativa validada conforme o fluxo de pré-matrícula.

Antes da primeira gravação, o aluno ou responsável aceita a versão vigente do aviso de privacidade para dados de saúde. Aceite e revogação ficam versionados e auditáveis no processo. A revogação ou ausência de consentimento bloqueia novas gravações, sem apagar automaticamente o histórico; um novo aceite vigente cria uma nova geração de consentimento.

O rascunho é salvo no servidor e pode ser retomado em outro dispositivo. O `expectedVersion` representa uma geração persistente do fluxo e impede sobrescrita ou conclusão silenciosa por outra aba. A geração continua existindo após a conclusão; somente a operação explícita de responder novamente pode avançá-la. Em conflito, o cliente recarrega o estado confirmado antes de tentar novamente.

A conclusão exige todas as respostas, declaração explícita e `idempotencyKey`. Retry da mesma conclusão devolve o registro já criado. A criação da submissão, a atualização do onboarding e a pendência profissional positiva ocorrem na mesma transação.

## Análise profissional

Submissões positivas criam `StudentParqProfessionalReview` pendente. Somente perfis com `physicalAssessment.prnt.actions.reviewParq`, no tenant correto, podem analisar a pendência.

A análise registra profissional, data e observação. Ela não altera respostas, contagem positiva ou histórico. Nova submissão positiva cria uma nova pendência vinculada à nova submissão. O indicador administrativo `parqRequiresProfessionalReview` é uma projeção derivada da existência de pendências e não uma segunda fonte editável.

Listagens comerciais exibem somente estado resumido e indicador de análise. Respostas detalhadas permanecem restritas aos fluxos de saúde autorizados.

## Fronteiras de leitura

As rotas administrativas usam `studentParqBoundaryService` como adaptador obrigatório entre os serviços legados de aluno e o serviço canônico do PAR-Q:

- `GET /api/v1/alunos/:id` e `GET /api/v1/alunos/:id/summary` recebem somente `ParqAdministrativeSummaryDTO` e removem recursivamente `parqResponses`, `questionnaireParq` e `questionnaires.parq` antes da serialização;
- `GET /api/v1/alunos/:id/intake` exige `students.details.health` e substitui qualquer representação legada pela última submissão retornada por `preRegistrationParqService.overview`;
- `GET /api/v1/prontuario/alunos/:alunoId`, protegido por `physicalAssessment.prnt.summary`, serializa apenas registros PRNT e um `ParqAdministrativeSummaryDTO`; nunca inclui `responses`, `positiveItems`, `reviewNotes` ou o histórico de submissões;
- `GET /api/v1/prontuario/alunos/:alunoId/parq-submissions` é a única fronteira do PRNT que retorna o histórico completo e exige `physicalAssessment.prnt.parqSubmissions`;
- o cliente combina o resumo e o histórico somente depois de a rota dedicada autorizar a leitura; um `403` mantém o resumo disponível sem conteúdo clínico detalhado.

A sanitização ocorre no backend e é testada na resposta HTTP. Ocultar campos apenas na interface não satisfaz o contrato de privacidade.

## Corte das escritas legadas

Os contratos exportados por `@corrida/utils` para criação e edição de aluno não expõem mais `intakeForm.parqResponses`. A fronteira HTTP anterior aos schemas antigos também inspeciona o corpo bruto para bloquear formas diretas ou escondidas em `formResponses.parqResponses`.

Qualquer tentativa recebe HTTP `410` e detalhes `{ code: "LEGACY_WRITE_DISABLED" }`. Campos não relacionados ao PAR-Q continuam seguindo para os handlers existentes.

## Falhas e segurança

- sessão expirada preserva o último rascunho confirmado;
- versão desconhecida é recusada sem converter o rascunho compatível; o cliente oferece uma ação explícita para carregar o catálogo atual e recuperar o estado confirmado no servidor;
- resposta incompleta não cria submissão;
- acesso cross-tenant responde como recurso inexistente;
- schemas estritos recusam IDs, versão arbitrária, estado, positivos e flags profissionais enviados pelo cliente;
- logs comuns não incluem respostas clínicas;
- falha na pendência profissional aborta a conclusão pela transação;
- falha temporária ao carregar o histórico protegido é propagada; somente a negação autoritativa `403` degrada para resumo sem detalhes.

## Evidências de validação

O workflow `Issue 273 Regression Evidence` executa `scripts/verify-issue-273-parq-migration.sh` sobre fixtures pré-cutover com fonte canônica, fontes legadas isoladas, equivalência, divergência, conjunto incompleto, ausência de data e rerun idempotente. O mesmo workflow aplica as migrations em banco limpo, executa contratos HTTP, o verificador PostgreSQL do serviço, o rerun corretivo, testes web e type-check, publicando os logs no mesmo artefato do merge preview.

O workflow também executa contratos discriminantes da fronteira do PRNT: perfil com apenas `physicalAssessment.prnt.summary`, negação do endpoint de histórico sem `physicalAssessment.prnt.parqSubmissions`, autorização explícita do endpoint dedicado e composição do frontend sem mascarar falhas temporárias.

O workflow `Issue 273 Visual Evidence` compila a aplicação web e executa `apps/api/scripts/visual-audit-issue-273.mjs` para a rota `/pre-cadastro/par-q`. A matriz cobre 1440×900, 1366×768 e 390×844, os estados de retomada, `NEEDS_REPEAT`, conclusão positiva e conclusão sem alerta, além de fluxo por teclado, inventário de controles, árvore de acessibilidade, screenshots e diagnósticos JSON. Esse harness isola estados visuais; autenticação, autorização, persistência e tenant continuam comprovados separadamente pelo workflow de regressão.

`Issue 273 Runtime Diagnostic` é somente leitura: faz checkout do merge preview, compila `@corrida/types` e `@corrida/utils`, executa o verificador PostgreSQL com falha propagada e publica apenas um artefato de diagnóstico.

O workflow geral `Validate PR` continua responsável por migrations, type-check, lint, suítes completas, build, arquitetura, catálogo de acessos e documentação.

Todos os workflows específicos da issue usam `contents: read`, não fazem commit ou push e devem propagar qualquer falha. Essas evidências constituem verificação interna do ciclo de implementação; a aprovação final exige auditoria independente em nova conversa, com o SHA congelado e sem alterações posteriores.
