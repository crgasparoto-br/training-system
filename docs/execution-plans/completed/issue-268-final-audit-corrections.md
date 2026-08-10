# Plano concluído: correções finais da auditoria da issue 268

## Objetivo

Corrigir as divergências encontradas na auditoria independente da PR #278 para que o ciclo único de lead até aluno use `Aluno.contractId` como barreira tenant em todos os consumidores, preserve a máquina de estados durante rollback e comprove o backfill sobre uma base legada populada.

## Contexto

- Repositório: `crgasparoto-br/training-system`.
- Issue: #268, subissue da épica #267.
- Branch-base: `develop`.
- Branch reutilizada: `feature/268-student-lifecycle-domain`.
- PR reutilizada: #278.
- Commit inicial desta rodada: `e91a87bad59297e6099a04f28cc7abd72889a46c`.
- Nenhum merge foi realizado.

## Fora de escopo

- UI administrativa de leads.
- Convites e tokens públicos completos.
- Deduplicação administrativa completa da #274.
- Merge da PR ou fechamento da issue.

## Regras preservadas

- `Aluno.contractId` é a barreira tenant canônica, inclusive quando `professorId` é nulo.
- Relações com professor podem restringir uma operação funcional, mas não substituem o filtro tenant do aluno.
- Atualizações de `Aluno.status` da aplicação nova passam por `student-lifecycle.service.ts`.
- A compatibilidade da aplicação antiga atua somente em inserts legados.
- Backfill preserva IDs e relacionamentos existentes sem inventar fatos históricos.

## Implementação concluída

- [x] Substituídos filtros tenant indiretos por `Aluno.contractId` nos consumidores auditados.
- [x] Propagado `companyContractId` aos endpoints segmentados e aplicada defesa em profundidade no service.
- [x] Trigger legado restringido a `BEFORE INSERT`.
- [x] Adicionada regressão para aluno ativo sem professor em consulta, agenda, horário fixo e progresso.
- [x] Adicionada regressão de reabertura com conta, professor e idade preenchidos.
- [x] Adicionada validação de backfill sobre banco legado isolado e populado.
- [x] Atualizadas documentação e descrição técnica.
- [x] Executadas validações, auditoria independente e higienização.

## Critérios de aceite

- [x] Aluno ativo sem professor é localizado pelo contrato e não retorna 404 por falsa ausência.
- [x] Busca, agenda, horários fixos e progresso usam `Aluno.contractId` como escopo.
- [x] Serviço segmentado não retorna aluno de contrato diferente quando chamado diretamente.
- [x] Reabrir um descartado completo persiste `LEAD` e auditoria coerente.
- [x] Insert da aplicação antiga continua derivando contrato e criando aluno ativo.
- [x] Update da aplicação nova não é reclassificado pelo trigger.
- [x] Backfill de base pré-#268 preserva IDs e relações representativas.
- [x] Migration pode ser reaplicada no mesmo banco.
- [x] Type-check, lint, testes, build, arquitetura, acessos e documentação passam.
- [x] Auditoria funcional final não encontrou ressalvas.

## Evidência de validação

Workflow `Validate PR` da PR #278, execução `29884930923`, commit `6ef6d75811f3c5993ddafd243b4b0001c3595a15`:

- backfill legado populado: aprovado;
- reexecução da migration: aprovada;
- type-check e lint: aprovados;
- web: 57 arquivos de teste aprovados;
- API: 86 suítes e 401 testes aprovados;
- build, arquitetura, catálogo de acessos e documentação: aprovados.

## Decisão residual

O trigger temporário permanece somente para inserts da aplicação anterior e deverá ser removido pela #275 após o encerramento da janela de rollback.
