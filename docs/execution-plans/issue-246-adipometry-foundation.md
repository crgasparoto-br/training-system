# Plano de execução — issue 246

## Estado

**Fundação estrutural concluída; contrato clínico reconciliado pela #383.**

O gate de definição do primeiro protocolo foi fechado posteriormente pela governança clínica da epic #245. `GUEDES_1991_ADULT_YOUNG` possui fórmula, população, limites, precisão, arredondamento, referência e vetores canônicos completos. Seu estado global `DRAFT` é intencional: a habilitação operacional ocorre somente por aprovação clínica ativa em cada contrato. Slaughter continua `DISABLED` e não faz parte do conjunto finalizável.

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

1. `GUEDES_1991_ADULT_YOUNG` permanece `DRAFT` globalmente, mas é um candidato clínico completo; Slaughter permanece `DISABLED` e incompleto.
2. Nenhum cálculo ou finalização é habilitado sem `AdipometryProtocolApproval` ativa no mesmo contrato, código, versão, referência, hash e snapshot.
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

## Gate clínico reconciliado

A #383 confirma que o gate de definição está fechado para `GUEDES_1991_ADULT_YOUNG` e separado do gate operacional por contrato:

- fórmula e referência completas estão versionadas em `docs/product/adipometry-protocol.md` e na migration canônica;
- população de 18 a 30 anos, sexo de protocolo e maturação `NOT_REQUIRED` são explícitos;
- dobras usadas por sexo, unidades, limites, alertas, bloqueios, precisão e `HALF_UP` são parte do snapshot;
- vetores masculino, feminino e de arredondamento são canônicos e exercitados por testes;
- perfil incompatível, dado obrigatório ausente e aprovação ausente/revogada bloqueiam conclusão sem fallback;
- avaliações concluídas são imutáveis e correções criam novas revisões auditadas;
- a migration não concede aprovação automática a nenhum contrato;
- Slaughter permanece `DISABLED` enquanto sua definição clínica estiver incompleta.
## Continuação entregue

As issues #247, #248 e #249 concluíram API/autorização/cálculo, fluxo guiado e integração de histórico/comparação da ADPT. Evoluções futuras devem continuar consumindo esta fundação, preservar a aprovação clínica por contrato, injetar o ator autenticado e nunca aceitar resultados ou demografia calculada pelo cliente como autoridade.
