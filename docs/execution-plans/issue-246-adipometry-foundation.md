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
10. Equações aprovadas usam uma AST JSON executável e todos os vetores são executados pelo banco antes da aprovação.
11. A autoria de auditoria vem do usuário autenticado em contexto transacional; o professor responsável não é usado como substituto pelo papel de aplicação.
12. Instantes de aprovação exigem `Z` ou offset explícito e são normalizados para UTC.
13. O contrato clínico atual exige `schemaVersion >= 2`, validação recursiva de todas as ramificações e tolerâncias limitadas à precisão declarada.
14. A identidade sequencial é alocada por trigger em qualquer criação, e valores enviados pelo chamador são substituídos.
15. A transição para `COMPLETED` executa a AST aprovada, aplica arredondamento e reconstrói resultados e regras do snapshot.
16. Eventos de auditoria são inseridos por função `SECURITY DEFINER`; concessão acidental de `INSERT` ao papel de aplicação não permite forjar eventos.

## Remediações da auditoria

- substituição de `lpad(..., 3, ...)` por largura mínima dinâmica e constraint código/sequência;
- inclusão dos quatro modelos e relações inversas no Prisma;
- chaves estrangeiras compostas para impedir combinação cross-tenant;
- gate estrutural de protocolo aprovado e imutabilidade de versão;
- conclusão condicionada a protocolo aprovado e snapshot coerente;
- correção atômica com motivo, autor, mesma identidade de aluno e auditoria automática;
- testes específicos de concorrência, rollback, `ADPT-1000`, imutabilidade, correção, snapshot e isolamento;
- teste da migration sobre banco com dados pré-existentes;
- contrato clínico estrito, com cinco dobras exatas, limites, vetores e registro de aprovação hasheado;
- transição controlada `APPROVED → DISABLED`, sem reativação;
- rejeição de vínculo `correctedByAssessmentId` escrito diretamente em rascunhos;
- teste da cadeia completa de migrations iniciado no baseline anterior à ADPT e com dados legados inseridos antes da primeira migration;
- substituição de strings de fórmula por AST restrita com avaliação determinística;
- validação recursiva de todas as ramificações da AST e execução dos vetores contra as equações antes de aceitar `APPROVED`;
- rejeição de vetores duplicados, perfis fora da população, medidas fora dos limites, tolerâncias excessivas ou negativas e resultados incompatíveis;
- ator explícito de criação, atualização, conclusão e correção, com vínculo ao mesmo contrato;
- remoção de `EXECUTE` de `PUBLIC` e do papel proprietário nas sobrecargas legadas sem ator;
- normalização UTC da aprovação clínica e rejeição de timestamps sem fuso;
- cenário discriminante em que o ator real difere do professor responsável;
- alocação universal de sequência por trigger, fechando criação SQL direta fora do contador;
- canonicalização de conclusão com validação de perfil e limites, execução da AST e descarte de resultados ou regras fornecidos pelo chamador;
- função de auditoria `SECURITY DEFINER` e bloqueio explícito de inserção forjada por papel de aplicação.

## Gates executáveis

```bash
bash scripts/verify-adipometry-migration-existing-data.sh
bash scripts/verify-adipometry-migration-full-chain.sh
bash scripts/verify-adipometry-foundation-v2.sh
bash scripts/verify-adipometry-protocol-validator.sh
bash scripts/verify-adipometry-persistence-boundaries.sh
pnpm type-check
pnpm lint
pnpm test
pnpm build
pnpm arch:check
pnpm access:check
pnpm docs:check
```

Os aliases legados `verify-adipometry-foundation.sh` e `verify-adipometry-audit-remediation.sh` reutilizam o gate v2 quando a identidade do workflow é a mesma, evitando executar a mesma suíte duas vezes.

Os controles negativos rejeitam fórmula textual, ramificação inválida não selecionada, vetor incompatível, perfil fora da população, medida fora dos limites, tolerância excessiva, vetor duplicado, timestamp sem fuso, ator ausente ou de outro contrato, mutação e reativação de protocolo, conclusão com protocolo desabilitado, vínculo de correção forjado e evento de auditoria inserido diretamente. Controles adicionais demonstram que `INSERT` direto não escolhe sequência/código e que resultados e regras enviados na conclusão são substituídos pela execução canônica do protocolo. O teste de migration completa parte do baseline anterior à ADPT, insere dados legados e aplica toda a cadeia na ordem real.

A identidade exata da validação — head, base, merge preview, execução e hashes dos artefatos — é registrada na descrição da PR e nos artefatos publicados pelo workflow. Ela não é duplicada neste documento para evitar referência circular ao próprio commit.

## Gate clínico pendente

A habilitação do primeiro protocolo e o encerramento da issue dependem de:

- fórmula e referência completas;
- população e aplicabilidade aprovadas;
- unidades, limites, alertas, bloqueios, precisão e arredondamento;
- tratamento aprovado para sexo, idade e maturação ausentes ou incompatíveis;
- no mínimo dois vetores de teste independentes;
- nome, data, identificador e artefato hasheado da aprovação clínica.

## Continuação prevista

Endpoints, autorização, serviço de cálculo, tela, comparação visual e laudo permanecem nas issues filhas do épico #245. Esses trabalhos devem consumir os contratos e invariantes desta fundação, sem aceitar resultados calculados pelo cliente e sempre injetando o ator autenticado no contexto transacional.
