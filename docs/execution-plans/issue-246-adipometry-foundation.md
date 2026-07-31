# Plano de execução — issue 246

## Estado

**Fundação estrutural validada internamente. Gate clínico pendente.**

A entrega não fecha a issue enquanto fórmula, população, limites, arredondamento, vetores e aprovador clínico do primeiro protocolo não estiverem formalmente definidos. A aprovação operacional final também exige auditoria independente do SHA congelado.

## Entrega estrutural

- fonte canônica de protocolos e bloqueios clínicos;
- contratos compartilhados sem resultados derivados em comandos do frontend;
- modelos Prisma e persistência histórica de protocolo, sequência, avaliação e auditoria;
- sequência transacional por contrato/aluno aplicada a todo `INSERT`;
- conclusão canonicalizada no banco a partir da definição aprovada;
- isolamento composto por contrato, aluno e professor;
- imutabilidade e não exclusão de concluídos;
- correção versionada, vinculada e auditada;
- auditoria append-only emitida apenas por trigger privilegiado;
- contrato demográfico executável e reproduzível pelo resolvedor canônico;
- documentação de produto, banco e arquitetura;
- gates PostgreSQL para concorrência, rollback, dados existentes e controles negativos.

## Decisões vigentes

1. Guedes permanece `DRAFT` e Slaughter `DISABLED`.
2. Nenhum cálculo clínico é habilitado sem aprovação formal.
3. As cinco dobras são colunas tipadas.
4. Medidas usam `Decimal(8,2)` e resultados `Decimal(8,4)`; arredondamento pertence ao protocolo.
5. Correção cria novo registro e preserva a versão anterior.
6. A largura do código é mínima de três dígitos e cresce após 999.
7. Eventos ADPT são append-only.
8. Definições aprovadas são imutáveis e `DISABLED` é terminal.
9. Equações usam AST JSON restrita e vetores executáveis.
10. Autoria de auditoria vem do usuário autenticado.
11. Instantes de aprovação exigem fuso explícito.
12. Identidade sequencial é alocada por trigger em qualquer criação.
13. Resultados e regras enviados pelo chamador são substituídos pela execução canônica.
14. `sexCriteria` usa exclusivamente `MALE`, `FEMALE` e `OTHER`.
15. `maturationRule` é estruturada como `NOT_REQUIRED` ou `REQUIRED` com `allowedValues`.
16. `ifEquals` consulta somente sexo ou maturação canônicos; idade usa `ageAtAssessment`.

## Remediações da auditoria

Além das remediações estruturais já incorporadas, o ciclo atual fecha três famílias de escape:

- **maturação apenas presente:** passa a existir comparação obrigatória com `allowedValues`;
- **sexo divergente entre vetor e produção:** critérios e snapshot usam a mesma normalização canônica;
- **AST dependente de campo inexistente:** condicionais ficam restritas aos campos produzidos pelo resolvedor.

Os controles discriminantes rejeitam protocolo sem regra estruturada, sexo minúsculo, vetor com maturação incompatível, AST com `profileCriteria.magic` e conclusão com maturação canônica fora da população aprovada.

## Gates executáveis

```bash
bash scripts/verify-adipometry-migration-existing-data.sh
bash scripts/verify-adipometry-migration-full-chain.sh
bash scripts/verify-adipometry-foundation-v2.sh
bash scripts/verify-adipometry-protocol-validator.sh
bash scripts/verify-adipometry-persistence-boundaries.sh
bash scripts/verify-adipometry-canonical-profile-contract.sh
pnpm type-check
pnpm lint
pnpm test
pnpm build
pnpm arch:check
pnpm access:check
pnpm docs:check
```

`verify-adipometry-audit-remediation.sh` executa o novo gate demográfico mesmo quando o gate v2 pode ser reutilizado para o mesmo SHA.

## Gate clínico pendente

A habilitação do primeiro protocolo e o encerramento da issue dependem de:

- fórmula e referência completas;
- população e aplicabilidade aprovadas;
- unidades, limites, alertas, bloqueios, precisão e arredondamento;
- tratamento clínico aprovado para sexo, idade e maturação;
- no mínimo dois vetores independentes;
- nome, data, identificador e artefato hasheado da aprovação clínica.

## Continuação prevista

Endpoints, autorização, serviço de cálculo, tela, comparação visual e laudo permanecem nas issues filhas do épico #245. Esses trabalhos devem consumir os contratos desta fundação, injetar o ator autenticado e nunca aceitar resultados ou demografia calculada pelo cliente como autoridade.
