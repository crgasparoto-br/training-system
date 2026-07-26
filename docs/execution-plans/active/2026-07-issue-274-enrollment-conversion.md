# Issue 274 — deduplicação, revisão e conversão

## Objetivo

Entregar a conversão do lead/pré-matrícula no mesmo registro canônico, com deduplicação em todos os pontos críticos, decisões auditáveis e confirmação transacional/idempotente.

## Escopo implementado

- contrato compartilhado de evidências, decisões e resultado;
- detector único e mascaramento administrativo;
- guardas antes de criação, claim, alteração, revisão e ativação;
- decisões versionadas e com expiração;
- consolidação sem exclusão e bloqueio de reassociação clínica insegura;
- revisão vinculada ao `onboarding.version`;
- trigger de invalidação após mudança de identidade;
- ativação serializável do mesmo ID, com revogação de convite;
- tela administrativa específica para os estados concluído e pronto;
- documentação e testes de contrato.

## Critérios de aceite

- [x] nome isolado não bloqueia;
- [x] CPF/conta incompatível bloqueiam;
- [x] resposta pública não revela candidatos;
- [x] decisão registra ator, motivo, versão, fingerprint e validade;
- [x] consolidação não apaga e não sobrescreve campo existente automaticamente;
- [x] histórico clínico bloqueia consolidação não assistida;
- [x] alteração de identidade invalida revisão;
- [x] confirmação revalida no commit e é idempotente;
- [x] nenhum domínio posterior é criado automaticamente;
- [ ] `pnpm validate` e workflow remoto aprovados no SHA final.

## Validação manual

1. Criar dois leads com CPF igual e confirmar bloqueio.
2. Criar semelhança de telefone/e-mail, registrar “pessoas diferentes” e concluir revisão.
3. Alterar contato após revisão e confirmar invalidação.
4. Consolidar duplicado sem dados clínicos e confirmar preservação do registro descartado.
5. Tentar consolidar duplicado com Anamnese/PAR-Q e confirmar pendência sem alteração.
6. Confirmar matrícula duas vezes e observar mesmo ID sem novo evento de conversão.
7. Verificar ausência de contrato, plano, cobrança, professor e agenda.

## Riscos e pendências

- A reassociação clínica automática permanece bloqueada até existir serviço de domínio específico por prontuário.
- Este plano permanece ativo até validação remota do SHA final e auditoria independente.
