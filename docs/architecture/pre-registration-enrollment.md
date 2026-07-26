# Arquitetura da revisão e conversão de pré-matrícula

## Fronteiras

- `packages/types/pre-registration-enrollment.ts`: contrato compartilhado da revisão, evidências mascaradas, decisões e ativação.
- `apps/api/src/modules/pre-registration-enrollment`: detector canônico, guardas de entrypoint, projeção por escopo, resolução, revisão e confirmação transacional.
- `apps/api/src/modules/pre-registration-public/pre-registration-public-atomic.service.ts`: aplica o detector dentro da transação de identificação/contato público, antes da persistência.
- `apps/web/src/pages/PreRegistrationAdmin/PreRegistrationEnrollmentDetail.tsx`: experiência administrativa; não contém regra de segurança.
- `StudentLifecycleEvent`: trilha imutável de decisões, fingerprint, versão revisada, ator e consolidação.
- `StudentOnboardingProcess.version`: token otimista que invalida revisão quando a identidade muda.

## Invariantes

1. Toda consulta e mutação filtra `contractId`.
2. Candidatos de outro tenant nunca são consultados ou revelados.
3. Candidatos fora do escopo `own`, `managed` ou `contract` do ator não são identificados na resposta; somente uma contagem restrita pode ser exibida.
4. A resposta pública não inclui pessoa, contato, CPF, candidato ou fingerprint.
5. O backend revalida permissão, escopo de dados, versão, estado e deduplicação no commit.
6. A criação com falso positivo exige fingerprint e motivo atuais e registra a decisão na mesma transação da criação.
7. Consolidação não exclui registros e não move dados clínicos sem serviço transacional específico.
8. Ativação altera somente ciclo, timestamps, convite e auditoria; domínios posteriores permanecem independentes.
9. As rotas autoritativas são montadas antes das rotas legadas para impedir bypass.

## Concorrência

Criação revisada, revisão, consolidação e confirmação usam isolamento `SERIALIZABLE`. As transições de ciclo e a edição pública bloqueiam o processo antes da verificação. A deduplicação pública ocorre após autorização e bloqueio do onboarding e antes de `upsertStudentIdentity`, eliminando a janela entre checagem e gravação.

A transição usa condição no estado atual. Em conflito, a transação é revertida e o frontend recarrega versão e fingerprint.

## Invalidação de revisão

A migration `20260726180000_issue_274_invalidate_stale_review` instala trigger para mudanças de identificadores em registros concluídos ou prontos. O trigger usa bloqueio `NOWAIT`, incrementa `version` e limpa `reviewedAt/reviewedByProfessorId` na mesma transação. Inversão de ordem de locks aborta a operação inteira em vez de aguardar indefinidamente ou invalidar parcialmente a revisão.
