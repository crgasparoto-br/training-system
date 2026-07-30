# Plano de execução — issue 246

## Estado

**Fundação estrutural em validação. Gate clínico pendente.**

A entrega não fecha a issue enquanto fórmula, população, limites, arredondamento, vetores e aprovador clínico do primeiro protocolo não estiverem formalmente definidos.

## Entrega estrutural

- fonte canônica de protocolos e bloqueios clínicos;
- contratos compartilhados sem resultados derivados em comandos do frontend;
- modelos Prisma e persistência histórica de protocolo, sequência, avaliação e auditoria;
- sequência transacional por contrato/aluno;
- isolamento composto por contrato, aluno e professor;
- imutabilidade e não exclusão de concluídos;
- correção versionada, vinculada e auditada;
- documentação de produto, banco e arquitetura;
- gates PostgreSQL para concorrência, rollback, dados existentes e controles negativos.

## Decisões

1. Guedes permanece `DRAFT` e Slaughter `DISABLED`.
2. Nenhum cálculo clínico é implementado ou habilitado sem aprovação formal.
3. As cinco dobras são colunas tipadas para impedir pontos arbitrários e facilitar comparação.
4. Medidas usam `Decimal(8,2)` e resultados `Decimal(8,4)`; a regra clínica de arredondamento pertence ao protocolo aprovado.
5. Correção cria novo registro, preserva a versão anterior e estabelece vínculo recíproco na mesma transação.
6. A largura mínima do código é três dígitos, sem truncamento após 999.
7. Eventos persistidos de ADPT são append-only; tentativas rejeitadas serão auditadas pela API da #247.
8. Definições aprovadas são imutáveis, mas podem ser desativadas uma única vez sem alteração clínica; `DISABLED` é terminal.
9. `correctedByAssessmentId` é exclusivamente gerenciado pelo trigger de correção recíproca.

## Remediações da auditoria

- substituição de `lpad(..., 3, ...)` por largura mínima dinâmica e constraint código/sequência;
- inclusão dos quatro modelos e relações inversas no Prisma;
- chaves estrangeiras compostas para impedir combinação cross-tenant;
- gate estrutural de protocolo aprovado e imutabilidade de versão;
- conclusão condicionada a protocolo aprovado e snapshot coerente;
- correção atômica com motivo, autor, mesma identidade de aluno e auditoria automática;
- testes específicos de concorrência, rollback, `ADPT-1000`, imutabilidade, correção, snapshot e isolamento;
- teste da migration sobre banco com dados pré-existentes;
- contrato clínico estrito, com cinco dobras exatas, equações por saída, limites, dois vetores e registro de aprovação hasheado;
- bloqueio de placeholders que apenas possuem chaves JSON não vazias;
- transição controlada `APPROVED → DISABLED`, sem reativação;
- rejeição de vínculo `correctedByAssessmentId` escrito diretamente em rascunhos;
- teste da cadeia completa de migrations iniciado no baseline anterior à ADPT e com dados legados inseridos antes da primeira migration.

## Gates executáveis

```bash
bash scripts/verify-adipometry-migration-existing-data.sh
bash scripts/verify-adipometry-migration-full-chain.sh
bash scripts/verify-adipometry-foundation.sh
bash scripts/verify-adipometry-audit-remediation.sh
pnpm type-check
pnpm lint
pnpm test
pnpm build
pnpm arch:check
pnpm access:check
pnpm docs:check
```

Os scripts PostgreSQL são executados no workflow `Validate PR` e publicam artefatos próprios.

## Gate clínico pendente

A habilitação do primeiro protocolo e o encerramento da issue dependem de:

- fórmula e referência completas;
- população e aplicabilidade aprovadas;
- unidades, limites, alertas, bloqueios, precisão e arredondamento;
- tratamento aprovado para sexo, idade e maturação ausentes ou incompatíveis;
- no mínimo dois vetores de teste independentes;
- nome, data, identificador e artefato hasheado da aprovação clínica.

## Continuação prevista

Endpoints, autorização, serviço de cálculo, tela, comparação visual e laudo permanecem nas issues filhas do épico #245. Esses trabalhos devem consumir os contratos e invariantes desta fundação, sem aceitar resultados calculados pelo cliente.
