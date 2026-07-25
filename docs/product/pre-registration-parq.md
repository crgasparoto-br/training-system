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

Antes da primeira gravação, o aluno ou responsável aceita a versão vigente do aviso de privacidade para dados de saúde. A revogação ou ausência de consentimento bloqueia novas gravações, sem apagar automaticamente o histórico.

O rascunho é salvo no servidor e pode ser retomado em outro dispositivo. O `expectedVersion` impede sobrescrita silenciosa. Em conflito, o cliente recarrega o estado confirmado antes de tentar novamente.

A conclusão exige todas as respostas, declaração explícita e `idempotencyKey`. Retry da mesma conclusão devolve o registro já criado. A criação da submissão, a atualização do onboarding e a pendência profissional positiva ocorrem na mesma transação.

## Análise profissional

Submissões positivas criam `StudentParqProfessionalReview` pendente. Somente perfis com `physicalAssessment.prnt.actions.reviewParq`, no tenant correto, podem analisar a pendência.

A análise registra profissional, data e observação. Ela não altera respostas, contagem positiva ou histórico. Nova submissão positiva cria uma nova pendência vinculada à nova submissão. O indicador administrativo `parqRequiresProfessionalReview` é uma projeção derivada da existência de pendências e não uma segunda fonte editável.

Listagens comerciais exibem somente estado resumido e indicador de análise. Respostas detalhadas permanecem restritas aos fluxos de saúde autorizados.

## Falhas e segurança

- sessão expirada preserva o último rascunho confirmado;
- versão desconhecida é recusada sem converter o rascunho compatível;
- resposta incompleta não cria submissão;
- acesso cross-tenant responde como recurso inexistente;
- schemas estritos recusam IDs, versão arbitrária, estado, positivos e flags profissionais enviados pelo cliente;
- logs comuns não incluem respostas clínicas;
- falha na pendência profissional aborta a conclusão pela transação.
