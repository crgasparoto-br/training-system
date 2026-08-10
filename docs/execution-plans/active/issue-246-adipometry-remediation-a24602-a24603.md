# Issue 246 — remediação A-246-02 e A-246-03

## Identidade de origem

- issue: `#246`;
- pull request: `#290`;
- base: `develop`;
- head auditado que originou a remediação: `5a34abfc876a8b932a73c0eebdd2cfd46d2b4ff5`.

## A-246-02 — hash da especificação na fronteira de persistência

A aprovação clínica passa a ser rejeitada pelo PostgreSQL quando `approvedSpecificationHash` não corresponde ao SHA-256 canônico de:

- código do protocolo;
- versão;
- referência bibliográfica preservada;
- snapshot da definição clínica aprovada.

A representação canônica ordena recursivamente as chaves e preserva a ordem dos arrays. O gate compara o resultado do algoritmo de serviço com a função de banco usando o protocolo canônico `GUEDES_1991_ADULT_YOUNG` e inclui controle negativo para um valor hexadecimal de 64 caracteres sem relação com a especificação.

A migration também verifica aprovações existentes e bloqueia o deploy quando um registro histórico não puder ser reproduzido.

## A-246-03 — convergência entre Prisma e migrations

`AdipometryProtocolApproval` passa a representar no `schema.prisma`:

- `protocolReferenceSnapshot`;
- data, professor, usuário e motivo da revogação;
- relações inversas de autoria da revogação.

A unicidade total por contrato/protocolo/versão foi removida do Prisma. A regra válida permanece no índice parcial SQL `AdipometryProtocolApproval_contract_protocol_key`, limitado a registros com `revokedAt IS NULL`, permitindo reaprovação sem apagar o histórico.

O gate de governança extrai o modelo Prisma e falha quando os campos de revogação, relações ou comentário do índice parcial estiverem ausentes, ou quando a unicidade total reaparecer.

## Upgrade e validação

O cenário de banco com dados existentes aplica todas as migrations de governança e a nova proteção de hash somente depois de criar os fixtures preexistentes. Dessa forma, o teste cobre a cadeia real de upgrade e não apenas um estado intermediário.

A conclusão do ciclo exige:

1. validação do Prisma;
2. migration em banco vazio;
3. migration com dados existentes;
4. equivalência de hash entre Node e PostgreSQL;
5. rejeição do hash incorreto por SQL direto;
6. testes, type-check, lint e build do workflow `Validate PR`;
7. passagem adversarial em SHA congelado.
