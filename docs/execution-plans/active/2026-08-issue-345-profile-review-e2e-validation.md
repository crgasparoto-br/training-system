# Plano: validação integrada da revisão cadastral (#345)

## Objetivo

Fechar a epic de revisão cadastral com evidência integrada e rastreável do fluxo professor/gestor -> aluno -> aprovação/rejeição, incluindo persistência real, segurança multi-tenant, UX responsiva e canais de notificação degradáveis.

## Contexto

- Base: `develop` após a entrega das issues #342, #343 e #344.
- Contrato funcional: issue #345.
- Fontes técnicas: `docs/student-app-data-contract.md`, `docs/profile-review-notification-delivery.md`, `docs/architecture/web.md`, `docs/architecture/api.md`, `docs/architecture/auth-and-access-control.md` e `docs/architecture/deployment.md`.
- O browser evidence da #343 valida UX determinística, mas usa fixture de API; por isso esta entrega adiciona uma regressão de domínio com PostgreSQL real.

## Fora de escopo

- aplicativo mobile nativo;
- chamadas reais a SendGrid ou Twilio em CI;
- nova regra de negócio para revisão cadastral;
- alteração da política de campos sensíveis;
- merge da PR.

## Arquivos e módulos principais

- `apps/api/tests/profile-review-flow.integration.test.ts`
- `apps/api/src/modules/alunos/profile-review.service.ts`
- `apps/api/src/modules/notifications/*`
- `apps/web/src/pages/StudentProfileReview*`
- `apps/web/src/components/alunos/AlunoRevisoesCadastraisTab*`
- `scripts/verify-issue-343-browser-evidence.cjs`
- `docs/profile-review-e2e-validation.md`
- `docs/student-app-data-contract.md`
- `docs/architecture/web.md`
- `docs/architecture/deployment.md`
- `docs/product/roadmap.md`

## Regras e restricoes

- `contractId` deve ser revalidado no backend em toda conclusão sensível.
- A conta do mesmo usuário em mais de um contrato não pode atravessar dados entre vínculos.
- Campos sensíveis não podem ser aplicados antes de aprovação profissional.
- Provider externo é opcional; falha de email/WhatsApp não pode desfazer revisão persistida.
- Mocks de integração ficam restritos ao transporte dos providers; persistência da revisão usa PostgreSQL real.
- A evidência de UI pode usar fixture para determinismo, mas não substitui a prova de domínio/persistência.

## Passos de implementacao

- [x] Confirmar dependências #342, #343 e #344 no `develop`.
- [x] Mapear cobertura existente de browser, rotas, domínio e providers.
- [x] Adicionar regressão integrada com PostgreSQL real para criação/reuso, conclusão, aprovação, rejeição e isolamento contratual.
- [x] Documentar a matriz de evidências e a fronteira exata de mocks.
- [x] Atualizar contrato do aluno, arquitetura web, deploy e roadmap.
- [ ] Confirmar `pnpm validate` no SHA candidato via CI da PR.
- [ ] Congelar o candidato e publicar handoff result-only para auditoria independente.

## Criterios de aceite

- [x] Testes relevantes foram adicionados ou reutilizados com rastreabilidade por cenário.
- [x] Documentação de produto, contrato, web e deploy foi alinhada.
- [x] O fluxo funciona sem integrações externas reais.
- [x] Segurança por usuário e `contractId` possui regressão dedicada.
- [x] Aprovação e rejeição de campos sensíveis possuem prova com persistência real.
- [ ] `pnpm validate` passa no SHA candidato.
- [ ] Riscos e limitações do candidato constam no PR e no handoff.

## Validacao manual

Seguir `docs/profile-review-e2e-validation.md`. O checklist manual usa preview/staging apenas como evidência complementar; providers externos não são requisito para aprovação da entrega.

## Decisoes e pendencias

- Decisão: manter o Playwright da #343 como evidência visual, não como prova de backend.
- Decisão: testar o domínio de revisão com PostgreSQL real sob `RUN_DATABASE_INTEGRATION_TESTS=true`, aproveitando a infraestrutura já canônica do workflow `Validate PR`.
- Pendente: CI do SHA candidato e auditoria independente após o freeze material.
