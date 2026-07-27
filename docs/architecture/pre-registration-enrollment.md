# Arquitetura da revisão e conversão de pré-matrícula

## Fronteiras

- `packages/types/pre-registration-enrollment.ts`: contrato compartilhado da revisão, evidências mascaradas, decisões e ativação.
- `apps/api/src/modules/pre-registration-enrollment`: detector canônico, guardas de entrypoint, projeção por escopo, resolução, revisão e confirmação transacional.
- `apps/api/src/modules/pre-registration-public/pre-registration-public-atomic.service.ts`: aplica o detector dentro da transação de identificação/contato público, antes da persistência.
- `apps/api/src/modules/pre-registration-public/pre-registration-public.service.ts`: aplica o detector no claim, depois do lock do convite e antes de qualquer vínculo; o resultado não cria uma resposta pública diferenciada.
- `apps/web/src/pages/PreRegistrationAdmin/PreRegistrationEnrollmentDetail.tsx`: experiência administrativa; não contém regra de segurança.
- `Aluno.canonicalAlunoId`: vínculo estruturado e não público do registro descartado para o canônico; candidatos já resolvidos deixam de participar de novas detecções.
- `StudentLifecycleEvent`: trilha imutável de decisões, fingerprints específicos da origem e do canônico, versão revisada, ator e consolidação.
- `StudentOnboardingProcess.version`: token otimista que invalida revisão quando a identidade muda.

## Invariantes

1. Toda consulta e mutação filtra `contractId`.
2. Candidatos de outro tenant nunca são consultados ou revelados.
3. Candidatos fora do escopo `self`, `managed` ou `contract` do ator não são identificados na resposta; somente uma contagem restrita pode ser exibida.
4. A resposta pública não inclui pessoa, contato, CPF, candidato ou fingerprint.
5. O backend revalida permissão, escopo de dados, versão, estado e deduplicação no commit.
6. A criação com falso positivo exige fingerprint e motivo atuais e registra a decisão na mesma transação da criação.
7. Consolidação não exclui registros e não move dados clínicos sem serviço transacional específico.
8. O registro descartado aponta para um canônico do mesmo `contractId`; o banco serializa o grafo por tenant e rejeita autorreferência, destino cross-tenant, cadeia, ciclo e transformação posterior de um destino referenciado em origem.
9. A auditoria do canônico é recalculada depois do vínculo e nunca reutiliza fingerprint ou versão da origem.
10. Ativação altera somente ciclo, timestamps, convite e auditoria; domínios posteriores permanecem independentes.
11. As rotas administrativas autoritativas são montadas antes das rotas legadas para impedir bypass.
12. Rate limit, autenticação e validação pública executam antes de qualquer consulta sensível; não existe guard público de deduplicação que responda de forma distinta.
13. Bloco de ação, tela, tenant e escopo de dados são reconsultados na mesma transação, depois do lock e antes da mutação.

## Concorrência

Criação revisada, edição administrativa, revisão, consolidação e confirmação usam isolamento `SERIALIZABLE`. As transições de ciclo e a edição pública bloqueiam o processo antes da verificação. A deduplicação pública ocorre após autorização e bloqueio do onboarding e antes de `upsertStudentIdentity`, eliminando a janela entre checagem e gravação.

A transição usa condição no estado atual. Em conflito, a transação é revertida e o frontend recarrega versão e fingerprint.

## Invalidação de revisão

A migration `20260727170000_issue_274_audit_hardening` amplia a invalidação para origem, responsável comercial, unidade e observações, além dos identificadores. Os triggers incrementam `version` e limpam `reviewedAt/reviewedByProfessorId` na mesma transação. Inversão de ordem de locks aborta a operação inteira em vez de aguardar indefinidamente ou invalidar parcialmente a revisão.

`READY_FOR_ENROLLMENT` compara a versão persistida do aceite à `PRIVACY_NOTICE_VERSION` vigente. Uma versão antiga presente é insuficiente.
