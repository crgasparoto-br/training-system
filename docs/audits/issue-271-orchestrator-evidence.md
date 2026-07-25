# Issue 271 — evidências atestadas do Orquestrador

## Objetivo

Registrar o contrato versionado dos artefatos usados para verificar a implementação do pré-cadastro público da issue #271 sem depender apenas da descrição da pull request ou do estado resumido dos workflows.

## Workflows aplicáveis

- `Validate PR`: valida migrations, backfill, type-check, lint, testes, build, arquitetura, catálogo de acessos e documentação.
- `Visual Audit Issue 271`: executa o fluxo integrado em navegador contra API e PostgreSQL e a matriz visual responsiva.

Ambos são acionados por evento `pull_request` contra `develop` quando seus caminhos aplicáveis mudam.

## Attestation obrigatória

Todo artefato publicado por esses workflows deve incluir, dentro do arquivo ZIP, `orquestrador-artifact.json` com:

- `schemaVersion`;
- `kind`;
- `repository`;
- `workflow`;
- `runId`;
- `runAttempt`;
- `eventName`;
- `headSha`;
- `baseSha`;
- `mergePreviewSha`;
- `ref`;
- `refName`.

Nos eventos `pull_request`, os campos de identidade têm significados distintos:

- `headSha`: commit real da branch da PR, obtido de `github.event.pull_request.head.sha`;
- `baseSha`: commit da branch-base observado no evento, obtido de `github.event.pull_request.base.sha`;
- `mergePreviewSha`: commit sintético executado por `refs/pull/<n>/merge`, obtido de `github.sha`.

Em eventos `push` ou `workflow_dispatch`, `headSha` representa `github.sha`; campos que não possuem identidade equivalente no evento podem permanecer vazios. O nome externo do artefato não substitui a attestation interna.

## Artefatos esperados

### Validate PR

Os artefatos de migration, backfill, type-check, testes e documentação incluem o respectivo log e a attestation `validate-pr-evidence`.

### Visual Audit Issue 271

O artefato visual inclui:

- screenshots e diagnósticos do fluxo integrado;
- screenshots da matriz isolada de estados;
- `integrated-visual-audit.log`;
- `visual-audit.log`;
- attestation `visual-audit-evidence`.

## Regras de validade

- a auditoria deve conferir que `headSha` coincide com o SHA congelado da branch da PR;
- `baseSha` e `mergePreviewSha` devem ser registrados e comparados separadamente;
- o run deve ter origem em `pull_request` ou `pull_request_target` para satisfazer o portão da PR;
- jobs e steps precisam estar presentes e concluídos;
- mudança posterior de head, base ou merge preview invalida o dossiê anterior;
- CI verde sem inspeção dos artefatos não constitui aprovação independente.

## Escopo

Este documento descreve somente o contrato das evidências da issue #271. Ele não substitui os requisitos funcionais, de segurança, privacidade, concorrência e interface definidos na issue e no plano `docs/execution-plans/active/issue-271-public-pre-registration.md`.
