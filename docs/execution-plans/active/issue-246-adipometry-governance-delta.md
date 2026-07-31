# Issue #246 — governança clínica por contrato

## Objetivo

Incorporar as decisões clínicas registradas depois da fundação inicial da ADPT: protocolo `GUEDES_1991_ADULT_YOUNG`, sexo próprio do protocolo, três dobras fixas por sexo e aprovação clínica pelo responsável técnico configurado no contrato.

## Módulos afetados

- Prisma e migrations da ADPT;
- serviço e rotas de contratos para responsabilidade/aprovação;
- catálogo de acesso compartilhado;
- tela `/settings/contract`;
- contratos compartilhados de adipometria;
- documentação e verificações de banco.

## Critérios de aceite

- no máximo uma responsabilidade ativa por contrato e domínio;
- substituição encerra a designação anterior com ator, data e motivo;
- elegibilidade revalidada no backend e no banco;
- somente o responsável vigente autenticado aprova;
- designação não aprova automaticamente;
- aprovação preserva declaração, nome/CREF, hash e snapshot;
- protocolo sem aprovação do contrato não conclui avaliação;
- sexo cadastral e sexo do protocolo permanecem distintos e auditáveis;
- masculino usa TR + SI + AB; feminino usa SB + SI + CX;
- dobras não usadas podem faltar sem bloqueio;
- vetores masculino, feminino e de arredondamento são reproduzidos;
- histórico concluído não muda após troca de responsável ou nova versão.

## Validação

- `pnpm prisma:generate` ou comando equivalente do workspace;
- teste unitário do hash da especificação;
- `scripts/verify-adipometry-clinical-governance.sh`;
- `pnpm validate`;
- revisão manual desktop e mobile da seção Responsabilidade técnica.

## Pendência operacional

A versão permanece `DRAFT` em cada contrato até um profissional real, com CREF pessoal válido, ser designado e aprovar explicitamente a especificação. Nenhum nome ou CREF é inventado por seed ou migration.
