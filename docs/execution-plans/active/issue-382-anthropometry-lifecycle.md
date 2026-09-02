# Plano: issue #382 — ciclo de vida da Antropometria

## Objetivo

Transformar a Antropometria em histórico confiável: rascunhos editáveis, avaliações concluídas imutáveis, correções auditadas, obrigatoriedade explícita/versionada, comparação determinística e evolução visual complementar.

## Contexto

- Issue: #382.
- Base de implementação: `develop`.
- Branch: `feat/382-anthropometry-lifecycle`.
- Fonte funcional canônica: `docs/AVALIACAO_ANTROPOMETRICA.md`.
- A issue não define a lista inicial autoritativa de medidas obrigatórias; nenhuma regra é inferida de planilha, tipo do segmento ou flags de importação.

## Fora de escopo

- gerar relatório clínico/gerencial;
- criar um novo `dataScope` para `physicalAssessment.protocol`;
- escolher automaticamente a lista inicial de medidas obrigatórias;
- alterar os protocolos clínicos da ADPT.

## Arquivos e módulos principais

- `apps/api/src/modules/anthropometry/*`
- `apps/api/src/modules/adipometry/adipometry-anthropometry-support.service.ts`
- `apps/api/src/modules/adipometry/adipometry-runtime-db.ts`
- `apps/api/prisma/migrations/20260902010000_issue_382_anthropometry_lifecycle/migration.sql`
- `apps/web/src/pages/PhysicalAssessment/Anthropometry*`
- `apps/web/src/hooks/useAnthropometry.ts`
- `apps/web/src/services/anthropometry.service.ts`
- `apps/web/src/types/anthropometry.ts`
- `docs/AVALIACAO_ANTROPOMETRICA.md`

## Regras e restrições

- `contractId` limita todas as consultas e escritas multi-tenant.
- Rascunho e concluída são estados persistidos; concluída não aceita edição comum.
- Obrigatoriedade de conclusão depende somente de configuração explícita e versionada.
- Configuração futura não retroage sobre avaliações concluídas; a conclusão preserva snapshot dos requisitos aplicados.
- Correção de concluída exige motivo, antes/depois, ator, horário e permissão revalidada na transação.
- Valor ausente não é zero e gráfico nunca substitui a tabela acessível.
- A ADPT consome somente Antropometrias concluídas.

## Passos de implementação

- [x] Criar persistência de lifecycle, requisitos e correções auditadas.
- [x] Preservar avaliações legadas como histórico concluído sem fabricar requisito antigo.
- [x] Implementar conclusão com snapshot da configuração e evento de linha do tempo.
- [x] Bloquear edição comum de avaliação concluída.
- [x] Implementar correção auditada e revalidação de acesso dentro da transação.
- [x] Calcular variações absolutas/percentuais a partir do histórico persistido.
- [x] Manter tabela como representação principal e adicionar gráfico complementar.
- [x] Impedir ADPT de selecionar rascunhos como fonte de apoio.
- [x] Atualizar documentação do domínio.
- [ ] Confirmar `pnpm validate` no candidato final via CI/ambiente executável.
- [ ] Auditoria independente após freeze do candidato, sem merge automático.

## Critérios de aceite

- [x] Estado `DRAFT`/`COMPLETED` é persistido e exposto pela API/UI.
- [x] Avaliação concluída rejeita edição pelas rotas comuns.
- [x] Conclusão falha sem configuração explícita de obrigatoriedade.
- [x] Conclusão falha se medida obrigatória estiver ausente.
- [x] Snapshot da regra de conclusão preserva versões aplicadas.
- [x] Correção registra motivo, antes/depois, ator e horário.
- [x] Correção exige `students.actions.manageAssessments` no middleware e na transação.
- [x] Comparação não converte ausência em zero.
- [x] Gráfico é complementar à tabela acessível.
- [x] Rascunho não é elegível como apoio ADPT.
- [x] Documentação foi atualizada.
- [ ] `pnpm validate` passa no SHA final.

## Validação manual

1. Configure pelo menos um segmento como obrigatório e confirme incremento de versão quando a regra mudar.
2. Crie nova ANTR e confirme estado `Rascunho`.
3. Tente concluir com medida obrigatória vazia e confirme bloqueio.
4. Preencha a medida, conclua e confirme estado `Concluída` e bloqueio da edição comum.
5. Sem permissão de gerenciar avaliações, confirme que a ação de correção não aparece e que a API retorna 403.
6. Com permissão, corrija valor com motivo e confirme trilha antes/depois e evento de linha do tempo.
7. Altere a configuração obrigatória depois da conclusão e confirme que o histórico concluído permanece válido pelo snapshot anterior.
8. Compare avaliações com valor ausente, valor anterior zero e unidade diferente; confirme ausência de percentual inválido.
9. Abra ADPT e confirme que um rascunho ANTR não aparece como apoio elegível.
10. Tente IDs de aluno/segmento/avaliação de outro contrato e confirme que nenhum dado é alterado ou exposto.

## Decisões e pendências

- Decisão: a migration não escolhe uma lista inicial de obrigatoriedade. A ativação de conclusão depende de configuração explícita pelo contrato.
- Decisão: avaliações legadas são preservadas como concluídas com snapshot `legacy=true` e sem requisitos inventados.
- Decisão: `physicalAssessment.protocol` não recebe `dataScope`, pois a tela não pertence ao catálogo de telas data-scoped; isolamento permanece por `contractId` e aluno.
- Decisão: a correção usa a capacidade existente `students.actions.manageAssessments`; não foi criado novo `blockKey`.
- Pendência operacional: confirmar quais segmentos o contrato deseja marcar como obrigatórios antes da primeira conclusão nova.
- Pendência de entrega: CI/`pnpm validate` e auditoria independente ainda precisam ser observados no SHA congelado.
