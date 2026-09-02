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
- qualquer alteração de Adipometria/ADPT;
- novos protocolos físicos;
- alteração automática de prescrição ou treino.

## Arquivos e módulos principais

- `apps/api/src/modules/anthropometry/*`
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
- Adipometria/ADPT mantém o comportamento anterior, por estar fora do escopo da issue #382.

## Passos de implementação

- [x] Criar persistência de lifecycle, requisitos e correções auditadas.
- [x] Preservar avaliações legadas como histórico concluído sem fabricar requisito antigo.
- [x] Implementar conclusão com snapshot da configuração e evento de linha do tempo.
- [x] Bloquear edição comum de avaliação concluída.
- [x] Implementar correção auditada e revalidação de acesso dentro da transação.
- [x] Calcular variações absolutas/percentuais a partir do histórico persistido.
- [x] Manter tabela como representação principal e adicionar gráfico complementar.
- [x] Remover do candidato alterações acidentais em ADPT após o CI demonstrar o acoplamento fora de escopo.
- [x] Atualizar documentação do domínio.
- [x] Confirmar `pnpm validate` no candidato final via workflow `Validate PR` do GitHub Actions.
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
- [x] ADPT não é alterada por esta entrega.
- [x] Documentação foi atualizada.
- [x] `pnpm validate` passa no SHA validado pelo workflow da PR.

## Validação manual

1. Configure pelo menos um segmento como obrigatório e confirme incremento de versão quando a regra mudar.
2. Crie nova ANTR e confirme estado `Rascunho`.
3. Tente concluir com medida obrigatória vazia e confirme bloqueio.
4. Preencha a medida, conclua e confirme estado `Concluída` e bloqueio da edição comum.
5. Sem permissão de gerenciar avaliações, confirme que a ação de correção não aparece e que a API retorna 403.
6. Com permissão, corrija valor com motivo e confirme trilha antes/depois e evento de linha do tempo.
7. Altere a configuração obrigatória depois da conclusão e confirme que o histórico concluído permanece válido pelo snapshot anterior.
8. Compare avaliações com valor ausente, valor anterior zero e unidade diferente; confirme ausência de percentual inválido.
9. Tente IDs de aluno/segmento/avaliação de outro contrato e confirme que nenhum dado é alterado ou exposto.

## Decisões e pendências

- Decisão: a migration não escolhe uma lista inicial de obrigatoriedade. A ativação de conclusão depende de configuração explícita pelo contrato.
- Decisão: avaliações legadas são preservadas como concluídas com snapshot `legacy=true` e sem requisitos inventados.
- Decisão: `physicalAssessment.protocol` não recebe `dataScope`, pois a tela não pertence ao catálogo de telas data-scoped; isolamento permanece por `contractId` e aluno.
- Decisão: a correção usa a capacidade existente `students.actions.manageAssessments`; não foi criado novo `blockKey`.
- Decisão: alterações de ADPT foram retiradas do candidato para preservar o fora de escopo explícito da issue #382.
- Pendência operacional: confirmar quais segmentos o contrato deseja marcar como obrigatórios antes da primeira conclusão nova.
- Validação automatizada: o workflow `Validate PR` ficou verde no candidato anterior; após qualquer escrita material, o SHA corrente deve voltar a ser observado até estado terminal.
- Pendência de entrega: verificação visual executável e auditoria independente permanecem fora da evidência automatizada atual.
