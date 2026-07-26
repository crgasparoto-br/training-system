# Issue 274 — deduplicação, revisão e conversão

## Objetivo

Entregar a conversão do lead/pré-matrícula no mesmo registro canônico, com deduplicação em todos os pontos críticos, decisões auditáveis e confirmação transacional/idempotente.

## Escopo implementado

- contrato compartilhado de evidências, decisões e resultado;
- detector único, normalização de nomes e mascaramento administrativo;
- guardas antes de criação, registro/claim, edição administrativa, edição pública, revisão e ativação;
- projeção dos candidatos conforme `self`, `managed` ou `contract`, sem identificar registros restritos;
- decisões versionadas, com motivo, ator, fingerprint e expiração;
- criação com falso positivo auditada na mesma transação e permitida somente com escopo sobre todos os candidatos;
- consolidação sem exclusão e bloqueio de reassociação clínica insegura;
- revisão vinculada ao `onboarding.version`;
- trigger de invalidação após mudança de identidade, com bloqueio `NOWAIT`;
- transições de descarte, prontidão e ativação centralizadas no domínio de ciclo do aluno;
- ativação serializável do mesmo ID, com revogação de convite;
- tela administrativa específica para os estados concluído e pronto;
- documentação e testes de classificação, autorização, entrypoints, persistência pública e limites downstream.

## Critérios de aceite

- [x] nome isolado não bloqueia;
- [x] CPF/conta incompatível bloqueiam;
- [x] resposta pública não revela candidatos;
- [x] decisão registra ator, motivo, versão, fingerprint e validade;
- [x] decisão exige escopo sobre os cadastros relacionados;
- [x] consolidação não apaga e não sobrescreve campo existente automaticamente;
- [x] histórico clínico bloqueia consolidação não assistida;
- [x] alteração de identidade invalida revisão;
- [x] confirmação revalida no commit e é idempotente;
- [x] nenhum domínio posterior é criado automaticamente;
- [x] `pnpm validate` e workflow remoto aprovados no SHA de implementação.

## Validação manual

1. Criar dois leads com CPF igual e confirmar bloqueio.
2. Criar semelhança de telefone/e-mail, registrar “pessoas diferentes” e concluir revisão.
3. Repetir o cenário com candidato fora do escopo e confirmar que nenhum dado é exibido e a decisão é recusada.
4. Alterar identificação ou contato pelo pré-cadastro público e confirmar verificação antes da gravação.
5. Alterar contato após revisão e confirmar invalidação.
6. Consolidar duplicado sem dados clínicos e confirmar preservação do registro descartado.
7. Tentar consolidar duplicado com Anamnese/PAR-Q e confirmar pendência sem alteração.
8. Confirmar matrícula duas vezes e observar mesmo ID sem novo evento de conversão.
9. Verificar ausência de contrato, plano, cobrança, professor e agenda.

## Riscos e pendências

- A reassociação clínica automática permanece bloqueada até existir serviço de domínio específico por prontuário.
- Este plano permanece ativo até auditoria independente do SHA final.
