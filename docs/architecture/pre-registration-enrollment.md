# Arquitetura da revisão e conversão de pré-matrícula

## Fronteiras

- `packages/types/pre-registration-enrollment.ts`: contrato compartilhado da revisão, evidências mascaradas, decisões e ativação.
- `apps/api/src/modules/pre-registration-enrollment`: detector canônico, guardas de entrypoint, resolução, revisão e confirmação transacional.
- `apps/web/src/pages/PreRegistrationAdmin/PreRegistrationEnrollmentDetail.tsx`: experiência administrativa; não contém regra de segurança.
- `StudentLifecycleEvent`: trilha imutável de decisões, fingerprint, versão revisada, ator e consolidação.
- `StudentOnboardingProcess.version`: token otimista que invalida revisão quando a identidade muda.

## Invariantes

1. Toda consulta e mutação filtra `contractId`.
2. Candidatos de outro tenant nunca são consultados ou revelados.
3. A resposta pública não inclui pessoa, contato, CPF, candidato ou fingerprint.
4. O backend revalida permissão, versão, estado e deduplicação no commit.
5. Consolidação não exclui registros e não move dados clínicos sem serviço transacional específico.
6. Ativação altera somente ciclo, timestamps, convite e auditoria; domínios posteriores permanecem independentes.
7. As rotas autoritativas são montadas antes das rotas legadas para impedir bypass.

## Concorrência

Revisão, consolidação e confirmação usam isolamento `SERIALIZABLE` e `SELECT ... FOR UPDATE`. A transição usa condição no estado atual. Em conflito, a transação é revertida e o frontend recarrega versão e fingerprint.

## Invalidação de revisão

A migration `20260726180000_issue_274_invalidate_stale_review` instala trigger para mudanças de identificadores em registros concluídos ou prontos. O trigger incrementa `version` e limpa `reviewedAt/reviewedByProfessorId` na mesma transação.
