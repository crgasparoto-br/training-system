# Issue #246 — governança clínica por contrato

## Objetivo

Incorporar as decisões clínicas registradas depois da fundação inicial da ADPT: protocolo `GUEDES_1991_ADULT_YOUNG`, sexo próprio do protocolo, três dobras fixas por sexo e aprovação clínica pelo responsável técnico configurado no contrato.

O ciclo adversarial de 31 de julho de 2026 acrescentou três remediações obrigatórias: capacidades clínicas negadas por padrão, revogação auditável por contrato e restauração das seis categorias canônicas de correção.

## Módulos afetados

- Prisma e migrations da ADPT;
- serviço e rotas autoritativas de contratos para responsabilidade, aprovação e revogação;
- catálogo e middleware de acesso compartilhado;
- tela `/settings/contract`;
- contratos compartilhados de adipometria;
- documentação e verificações de banco.

## Critérios de aceite

- no máximo uma responsabilidade ativa por contrato e domínio;
- substituição encerra a designação anterior com ator, data e motivo;
- elegibilidade revalidada no backend e no banco;
- `settings.contract.actions.manageClinicalTechnicalResponsibility` começa negada e protege a gestão da designação;
- `settings.contract.adipometryProtocolApproval` começa negada e protege aprovação e revogação;
- `master`, `professor`, `manager` e administrativo não recebem autoridade clínica por perfil;
- somente o responsável vigente autenticado e com concessão explícita aprova ou revoga;
- designação não aprova automaticamente;
- aprovação preserva declaração, nome/CREF, hash e snapshot;
- revogação preserva motivo, ator e data e bloqueia novas conclusões;
- avaliações concluídas antes da revogação mantêm snapshot e resultado;
- nova aprovação após revogação cria outra linha sem apagar o histórico;
- protocolo sem aprovação ativa do contrato não conclui avaliação;
- sexo cadastral e sexo do protocolo permanecem distintos e auditáveis;
- masculino usa TR + SI + AB; feminino usa SB + SI + CX;
- dobras não usadas podem faltar sem bloqueio;
- vetores masculino, feminino e de arredondamento são reproduzidos;
- histórico concluído não muda após troca de responsável, revogação ou nova versão;
- correções usam exatamente `DATA_ENTRY_ERROR`, `MEASUREMENT_TRANSCRIPTION_ERROR`, `EVALUATION_DATE_ERROR`, `PROTOCOL_SEX_ERROR`, `PROTOCOL_SELECTION_ERROR` ou `OTHER`.

## Validação

- geração do Prisma Client;
- migration sobre banco vazio e banco com dados existentes;
- teste unitário do hash da especificação;
- `scripts/verify-adipometry-clinical-governance.sh`;
- `scripts/verify-adipometry-audit-remediation.sh`;
- `pnpm type-check`;
- `pnpm test`;
- `pnpm build`;
- `pnpm arch:check`;
- `pnpm access:check`;
- `pnpm docs:check`;
- revisão manual desktop e mobile da seção Responsabilidade técnica.

## Pendência operacional

A versão permanece sem aprovação ativa em cada contrato até um profissional real, com CREF pessoal válido, ser designado, receber a concessão clínica explícita e aprovar a especificação. Nenhum nome, CREF ou aprovação operacional é inventado por seed ou migration.

## Fechamento do ciclo de correção

O delta final mantém o lifecycle completo `DRAFT → FINALIZED → SUPERSEDED`, além dos terminais `CANCELLED` e `VOIDED`. A validação obrigatória cobre concorrência de rascunhos, reutilização de código/sequência, numeração monotônica após cancelamento, snapshots e diferenças, seleção da revisão vigente, anulação auditável e rejeição de correção sem mudança material.

## Estado

Implementação em validação na PR #290. A PR permanece em draft e não deve ser mergeada antes do congelamento do SHA, CI verde e passagem adversarial controller-mode. Uma aprovação nesse mesmo ciclo é somente interna e provisória; a decisão operacional final continua exigindo auditoria independente em contexto separado.
