# Plano: issue #318 - fluxo web da Montagem Consolidada

## Objetivo

Entregar o fluxo web do professor para montar, revisar e aprovar a Montagem Consolidada da Prescrição, preservando o contexto do aluno e consumindo exclusivamente os contratos autoritativos da API da #317.

## Contexto

- Issue: #318.
- Dependência #317 concluída em `develop` pela PR #322.
- Fonte de verdade do domínio: `docs/product/consolidated-prescription-model.md`.
- Fonte da experiência web: `docs/product/consolidated-prescription-web-flow.md`.
- Branch de trabalho: `feat/318-consolidated-prescription-web-flow`.
- A Montagem Consolidada não publica Treino de hoje nesta fase.

## Fora de escopo

- cálculo de conflito no frontend;
- `approved -> released`;
- geração/publicação do Treino de hoje;
- feedback pós-treino;
- decisão técnica automática;
- reconstrução do Workout Builder;
- envio de WhatsApp;
- operações em massa.

## Contratos e decisões

- `contractId`, `dataScope`, ator, versão e transições são autoridade do backend.
- Permissões usam `plans.consolidatedPrescriptions.view`, `manage` e `approve`.
- O workspace web usa `GET /consolidated-prescriptions/alunos/:alunoId/workspace`; não usa `GET /alunos/:id` como gate de escopo.
- Elegibilidade e motivo das capacidades vêm do workspace backend; a UI não reclassifica status.
- Edição comum preserva `responsibleProfessorId` e referências adicionais persistidas; `capacity_source` continua derivada no backend.
- A UI não promove localmente uma montagem para `approved` antes da resposta da API.
- Toda mutação após a criação usa `expectedCurrentVersion`.
- HTTP `409` preserva edição local e exige reconciliação explícita.
- Telas longas usam oito seções colapsáveis.
- `approved` e `released` permanecem imutáveis; qualquer alteração material começa por nova revisão explícita em `draft`.
- O cabeçalho resume somente sinais autoritativos da API para a situação das origens; o frontend não inventa regra técnica.

## Remediação da auditoria independente

- [x] Remover dependência da tela em `alunoService.getById`, que reduzia indevidamente o `plans=contract` do gestor.
- [x] Adicionar read-model autoritativo de workspace com o mesmo `dataScope` de `plans`.
- [x] Mover decisão/motivo de elegibilidade de capacidade para o backend.
- [x] Preservar responsável técnico e referências adicionais em saves comuns.
- [x] Adicionar controles negativos com ator diferente do responsável e referência adicional persistida.
- [x] Adicionar teste HTTP com usuário `plans=contract` sobre aluno atribuído a outro professor e negações `self`/cross-tenant.
- [x] Separar contraste de `text-primary` em dark mode do token usado como fundo de controles e reforçar `--ring` escuro.
- [x] Ampliar evidência automatizada para `1440x1000`, `1366x768`, `390x844`, texto 200%, dark mode, teclado, axe, ARIA, warning/critical, histórico e `409`.
- [x] Permitir nova revisão explícita após `released`, preservando a versão liberada no histórico e classificando a transição como `revision_created`.
- [x] Expor no cabeçalho a situação das origens usando apenas `capacityCandidatesError`, candidatos inelegíveis e conflitos retornados pela API.
- [x] Adicionar controles discriminantes de backend PostgreSQL e UI para as duas pendências funcionais acima.
- [x] Adicionar fluxo browser integrado sem mocks de `/api/v1/**`, usando PostgreSQL efêmero, migrations e routers reais para `workspace -> draft -> review -> approved`.
- [x] Adicionar sessão nativa de leitor de tela com Orca/AT-SPI em Chromium headed, registrando versão, aplicações conhecidas e debug do conteúdo acessível.
- [ ] Executar os gates do novo SHA em ambiente com checkout/dependências.
- [ ] Realizar nova auditoria independente em contexto separado após congelar o novo candidato.

## Validação esperada

```bash
pnpm --filter @corrida/web test
pnpm --filter @corrida/api test
pnpm type-check
pnpm lint
pnpm access:check
pnpm docs:check
pnpm validate
```

O workflow de evidência existente continua executando `scripts/verify-issue-318-browser-evidence.cjs`; a remediação não altera `.github/workflows/**`. O script preserva a matriz isolada de UI e acrescenta o gate integrado com API/PostgreSQL real e o gate nativo Orca. GitHub Actions permanece apenas como gate de validação do candidato publicado, sem rerun/dispatch/cancelamento pela entrega.

## Evidência adversarial

Os controles discriminantes obrigatórios desta rodada são:

1. ator da edição diferente de `responsibleProfessorId`, verificando que o save não reatribui responsabilidade;
2. referência adicional `assessment` existente, verificando que o save não a remove e não reenvia `capacity_source` derivada;
3. usuário com `plans=contract` acessando aluno de outro professor, enquanto usuário `self` e outro tenant recebem 404;
4. prescrição suspensa com versão persistida ativa, verificando que `eligible=false` e o motivo vêm do backend;
5. dark mode com `text-primary` medido em contraste >= 4.5:1;
6. montagem simulada como `released`, verificando que `/revisions` cria novo `draft`, preserva a versão liberada e gera `revision_created` com `previousStatus=released`;
7. tela em estado `released`, verificando ação de nova revisão e cabeçalho com indisponibilidade de origem exatamente a partir dos sinais da API;
8. navegador sem interceptação de API, verificando create/review/approve pelos routers reais e estado `approved` persistido em PostgreSQL;
9. leitor de tela Orca nativo, verificando que o AT-SPI enumera Chromium e que o debug do Orca observa conteúdo acessível da Montagem Consolidada durante foco/teclado no histórico.

## Estado para freeze

O candidato só pode ser declarado internamente aprovado após os gates executáveis do novo SHA. Com esses gates verdes, a pendência de implementação/evidência da #318 fica encerrada nesta entrega, restando apenas a auditoria independente em contexto separado; a PR não deve ser mergeada pelo controlador de entrega.
