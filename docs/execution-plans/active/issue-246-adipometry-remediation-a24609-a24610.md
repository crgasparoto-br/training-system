# Issue 246 — remediação A-246-09 e A-246-10

## Identidade de entrada

- issue: `#246`;
- PR: `#290`;
- branch: `feat/246-adipometry-foundation`;
- base: `develop`;
- head de entrada: `6d3f0c730edbbe760237d8450e5a26b1c421cf48`.

## A-246-09 — paridade do contrato compartilhado

A definição clínica versionada e a aprovação clínica por contrato são contratos distintos. `AdipometryProtocolDefinitionSnapshot.clinicalApproval` passa a ser opcional para representar tanto fixtures globais legadas quanto a definição canônica `GUEDES_1991_ADULT_YOUNG` schema v3, que não incorpora aprovação contratual.

A proveniência obrigatória da avaliação concluída permanece em `AdipometryCalculationSnapshot.protocolApproval`, incluindo responsabilidade, professor, nome, CREF, hash, referência e a definição aprovada.

Foi adicionado um validador runtime compartilhado para JSON/JSONB. O controle discriminante cria responsabilidade e aprovação reais no PostgreSQL, executa `bindActiveAdipometryApprovalSnapshot()` sobre uma conclusão e grava o `calculationSnapshot` produzido pelo banco. O Jest consome esse JSON efetivamente persistido e valida `protocolApproval.protocolDefinitionSnapshot` no mesmo contrato runtime compartilhado, confirmando schema v3 e ausência de `clinicalApproval` embutido.

## A-246-10 — elegibilidade do alvo da designação

`isEligibleAdipometryClinicalDesignation()` passa a usar a mesma elegibilidade de `isEligibleAdipometryClinicalResponsible()`. Assim, o banco exige para o profissional-alvo:

- mesmo contrato;
- usuário ativo;
- perfil e CREF pessoal válidos;
- ausência de desligamento vigente;
- concessão explícita `settings.contract.adipometryProtocolApproval`.

A migration é um no-op somente nas cadeias reduzidas de compatibilidade que não instalam a governança ADPT. Na cadeia produtiva completa, ela falha de forma fechada caso encontre uma responsabilidade ativa incompatível com essa regra.

O controle PostgreSQL discriminante prova que um gestor autorizado não consegue designar um alvo sem a concessão clínica e que a mesma operação passa após a concessão explícita.

## Gates impactados

- teste runtime do snapshot de conclusão efetivamente persistido;
- type-check dos tipos compartilhados e API;
- migration em banco vazio, dados existentes e cadeia reduzida de compatibilidade;
- controle PostgreSQL de persistência e autorização;
- suite ADPT agregada;
- validações finais do repositório.
