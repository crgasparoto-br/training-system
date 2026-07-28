# Issue 136 - prescrição completa por capacidades

## Estado

Implementação em correção no modo `issue-loop-single-invocation`. O ciclo atual resolve o achado bloqueante `AUD-136-016`, identificado após as remediações anteriores `AUD-136-005` a `AUD-136-015`, reutilizando a PR #285 e a branch `fix/136-capacity-prescription-persistence`. O plano permanece ativo até o novo SHA concluir CI, evidência visual, freeze e auditoria controller-adversarial.

## Objetivo

Completar a Fase 3 da issue #136 com persistência, API autenticada, isolamento por contrato, planejamento macro/meso/micro, catálogo técnico, objetivos classificados, alertas derivados, interface do professor e testes discriminantes, sem implementar Montagem Consolidada ou `Treino de hoje`.

## Achados tratados nos ciclos anteriores

### AUD-136-005 — integridade do conjunto versionado

- aceitar no máximo um conjunto por capacidade e versão;
- rejeitar conjunto junto de parâmetros manuais;
- derivar `methodologyVersion` no backend;
- garantir snapshot técnico quando um conjunto é usado;
- testar controle negativo com dois conjuntos válidos.

### AUD-136-006 — fórmulas backend da planilha

- extrair a fórmula de adipometria da aba `Avaliação` do `Modelo Avaliação Física v.4.10.12`;
- versionar o algoritmo;
- calcular densidade, percentual de gordura, gordura absoluta e massa magra;
- testar protocolos masculino e feminino com entradas divergentes;
- documentar fórmula, campos e versão.

### AUD-136-007 — fontes restauradas por capacidade

- manter seleção independente para Resistido, Cíclico, Flexibilidade e Equilíbrio;
- hidratar a seleção pelos `sourceRefs` da última versão;
- preservar fonte histórica ausente da lista atual;
- não marcar automaticamente fonte nova;
- manter troca de aluno sem transporte de contexto.

### AUD-136-008 — parâmetros funcionais completos

- permitir zonas cíclicas com percentuais, volume, pace e FC;
- registrar restrições resistidas;
- registrar notas de progressão de equilíbrio;
- preservar campos na hidratação e no payload manual;
- manter conjunto versionado somente leitura.

### AUD-136-009 — autoria e dados-base de ANTR/ADPT

- criar projeção canônica de fontes de avaliação;
- incluir medições, unidades, data, origem, versão e professor responsável;
- exigir `students.details.assessments` além da permissão de prescrição;
- recalcular autoria no backend e ignorar responsável forjado pelo cliente;
- incluir antropometria e avaliações segmentadas do mesmo aluno e contrato.

### AUD-136-010 a AUD-136-015

- preservar resposta pública para conjunto inexistente, externo ou de capacidade divergente;
- reconstruir avaliações, antropometria e histórico de atividade no backend;
- diferenciar falta de permissão de ausência de avaliações;
- sincronizar schema Prisma e migrations;
- levar cardinalidade, exclusividade e metodologia canônica à fronteira de domínio;
- normalizar notas técnicas livres e preservar conjuntos históricos.

## Achado tratado neste ciclo

### AUD-136-016 — proveniência canônica de PRNT e preferências

- reconstruir no backend `label`, `assessedAt`, `origin`, `version` e `responsibleProfessorId` de `prontuario_goal`;
- identificar o subtipo real de `prontuario_alert` — dor, acompanhamento de anamnese, medicamento/procedimento ou mapa corporal — e reconstruir seus metadados;
- reconstruir os metadados de `student_preference` a partir de `StudentProfile`;
- executar essa reconstrução antes da derivação de alertas;
- manter a validação final de existência e isolamento no serviço de domínio;
- ignorar metadados forjados pelo cliente;
- testar resposta HTTP, alertas derivados e persistência em `CapacityPrescriptionSource`.

## Impacto documental

Fontes consultadas:

- `AGENTS.md`;
- `ARCHITECTURE.md`;
- `docs/product/capacity-prescription-model.md`;
- `docs/product/integrated-prescription-control.md`;
- issue #136 e comentários;
- auditoria do SHA `22fee1fcac1e09af33739bd22038902f9542be27`;
- `ModeloTreinamento Combinado v. 3.12.8`;
- `Ideias e estruturação - Professor`;
- `Sistema ACESSO - comunicação Claudinei/Leandro`;
- `Modelo Avaliação Física v.4.10.12`, aba `Avaliação`.

Documentação mantida na mesma PR:

- este plano de execução;
- `docs/product/capacity-prescription-model.md` como contrato canônico vigente;
- `docs/product/capacity-prescription-source-provenance.md` como detalhamento verificável da fronteira de fontes;
- descrição da PR com identidade, validações e limitações do SHA final.

## Fora de escopo

- Montagem Consolidada;
- publicação ou geração de `Treino de hoje`;
- progressão automática completa;
- aplicação automática de alertas sem validação do professor;
- exportação ou importação de smartwatch;
- feedback pós-treino e decisões sugeridas da fase posterior.

## Validação esperada

```bash
pnpm validate
RUN_DATABASE_INTEGRATION_TESTS=true pnpm --filter @corrida/api test -- capacity-prescription-source-canonicalization.integration.test.ts capacity-prescription-remediation.integration.test.ts capacity-prescription-http.integration.test.ts --runInBand
pnpm --filter @corrida/api test -- capacity-prescription-formulas.test.ts --runInBand
pnpm --filter @corrida/web test -- capacityPrescriptionScreen.model.test.ts CapacityPrescriptionScreen.test.tsx PhysicalAssessmentProtocol.permission.test.tsx
```

Além da suíte existente, validar:

- conjunto de outro tenant mantém a resposta pública de parâmetro inválido;
- dois conjuntos válidos não criam versão;
- conjunto válido e parâmetros manuais são mutuamente exclusivos;
- metodologia forjada não é persistida;
- rótulo, data, origem, versão e autoria forjados de avaliação não são persistidos;
- objetivo, alerta do PRNT e preferência ignoram metadados forjados;
- alertas são derivados somente de rótulos canônicos;
- persistência em `CapacityPrescriptionSource` contém metadados canônicos;
- histórico de atividade usa o registro canônico do PRNT;
- endpoint de fontes retorna dados-base e unidades;
- falta da permissão de avaliações aparece como estado explícito na interface;
- seleção de fontes diverge deliberadamente entre Resistido e Cíclico;
- fonte nova permanece desmarcada;
- zona cíclica completa chega ao payload;
- fórmula de adipometria coincide com as células da planilha;
- desktop, mobile, teclado e conteúdo longo permanecem utilizáveis.

## Pendência para encerramento do loop

- CI oficial verde no SHA final;
- evidência visual dedicada da rota;
- freeze de head, base e merge preview;
- auditoria controller-adversarial em somente leitura;
- parecer operacional `Aprovado` sem achados bloqueantes;
- não fazer merge nesta execução.
