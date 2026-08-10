# Issue #269 — correções da auditoria adversarial

## Objetivo

Eliminar as pendências de segurança, idempotência e auditoria encontradas na
segunda auditoria da implementação de convites de pré-cadastro.

## Escopo corrigido

- redação de token e URL de convite em User-Agent e motivo de revogação;
- revogação vinculada ao `inviteId` alvo, preservando idempotência entre versões;
- serialização explícita da auditoria de acessos posteriores por bloqueio de linha;
- propagação do ator autenticado nas leituras administrativas que consolidam expiração;
- documentação do novo contrato de revogação e das garantias de auditoria.

## Evidências automatizadas

- teste unitário de redação do token em User-Agent e motivo;
- teste de integração que confirma ausência do token em convite e eventos persistidos;
- teste de repetição da revogação da versão antiga após criação de nova versão;
- teste concorrente de dois acessos posteriores fora da janela de throttle;
- teste de expiração administrativa com ator autenticado;
- teste de rota comprovando envio de `inviteId`, motivo e ator.

## Decisões

- a rota administrativa exige `{ inviteId, reason }`;
- a assinatura legada do serviço permanece apenas para históricos com uma única
  versão e recusa cenários ambíguos;
- o motivo é armazenado somente em `revocationReason`, evitando duplicidade em
  metadados de evento;
- não houve impacto visual ou alteração de frontend.

## Validação

Executar `pnpm validate` e o workflow `Validate PR`. Não realizar merge sem
autorização explícita.
