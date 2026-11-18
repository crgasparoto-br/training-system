# Plano técnico — issue #406

## Contexto
- Repositório training-system, branch base develop; diretrizes obrigatórias em crgasparoto-br/skill/develop.
- Origem: feedback canônico #390; evidência combinada #403 não homologada; substituições #404 e indicadores #405 não são alterados.

## Implementação
1. Persistência de evidências congeladas, revisão, chave idempotente e operações.
2. Permissões de consulta, sugestão, aprovação e aplicação distinta; escopo aluno/contrato.
3. Aplicação versionada no domínio de planejamento futuro, sem mutação de treino liberado.
4. Eventos de timeline e mensagem prática do aluno com exposição explícita.
5. UI profissional no workspace da montagem e visão simplificada no Treino de hoje.

## Validação
- Testes de matriz de estados, dados clínicos privados, concorrência, rollback e idempotência.
- Regressões da auditoria PR #548: INSERT direto aprovado/rejeitado/aplicado, início fora da vigência após bloqueio, revogação concorrente e fontes paginadas sem starvation por revisões repetidas.
- Remediação A-001/A-002: serialização transacional por aluno/contrato antes da autorização, retry limitado de deadlock `40P01`/serialização `40001` e mapeamento para HTTP 409 quando esgotado, preservando efeitos idempotentes.
- Remediacao da auditoria de 16/11 (A-001 visual): estado de justificativa, data e instrucao separado por `decisionId`, com chaves de retry invalidas apenas para o registro editado. Os testes do painel exercitam duas decisoes simultaneas, aprovacao, rejeicao e aplicacao, sem reutilizar os campos de outra decisao.
- Remediação A-003 da auditoria independente PR #548 (16/11): estado `rejected` exige `rejectionReason IS NOT NULL` e texto não vazio no CHECK PostgreSQL e no trigger de transição; teste de integração tenta UPDATE SQL com NULL, vazio e só espaços, atesta ausência de mutação, operação, efeito e evento, e confirma a rejeição autorizada pela API com uma única trilha de auditoria.
- Testes negativos: SQLSTATE não transitório não recebe retry nem 409 indevido; concorrência PostgreSQL com duas conexões; carregamento paginado de decisões e fontes e ocultação após revogação da concessão no painel profissional.
- Migration PostgreSQL em teste, prisma generate, type-check, lint, build, pnpm validate.
- Auditoria independente do diff, controles negativos e ausência de regressões.
- PR para develop sem merge.

## Ressalvas operacionais — PR #548 (16/11/2026)
- **RISK-001:** roteiro de homologação física em `docs/quality/issue-406-post-workout-decision-homologation.md`, com 14 cenários por dispositivo, dados fictícios, evidências obrigatórias e critério de aceite fail-closed. Os testes do painel incluem troca rápida de aluno/contrato, revogação com requisição pendente, recuperação após falha de rede e retry com a mesma chave idempotente. A execução física e seu registro ainda são externos, não homologados por CI.
- **LIM-001:** contrato GitHub-native confiável em `docs/audit/github-native-contract.json` e roteiro de auditoria independente exact-SHA no documento operacional. CI, automação e esta implementação não emitem nem substituem o parecer de contexto separado.
- **Fechamento:** não retirar Draft/merge nem fechar a issue antes de 28 PASS em dispositivos físicos, CI exato verde e recibo de reauditoria independente no HEAD corrente.

## Limites
- Orientação futura não substitui revisão de prescrição e liberação operacional.
- Ativação de regras clínicas combinadas segue fluxo de homologação separado.

## Pendências da auditoria de 17/11/2026 — PR #548

- **A-004 (bloqueador de integridade):** restringir a constraint SQL por estado e versão; validar no commit evento/operacão de cada transição, com índices únicos. Controles: SQL direto para sugestão sem evento, aprovação/rejeição sem operação e timeline, estados com atores incompatíveis; fluxo autorizado positivo. Arquivos: migration, integração PostgreSQL e documentação funcional. Fechamento exige CI verde do novo SHA.
- **R-001 (recomendação acionável):** limpar rascunho de nova sugestão ao trocar aluno/contrato/permissão e descartar conclusão de POST tardio; regressões Vitest/jsdom.
- **A-005 (aceite operacional externo):** executar os cenários H406-01 a H406-14 em desktop e telefone físicos, totalizando 28 PASS com evidência por SHA em ambiente isolado. **PENDENTE — execução física não realizada por este contexto, sem PASS presumido.**
- **LIM-001 (limitação do parecer):** a auditoria anterior não reproduziu SQL adversarial em banco próprio; os testes PostgreSQL da implementação não substituem nova auditoria independente.

Preservar a PR em Draft, não realizar merge e não fechar #406 antes dos gates obrigatórios.

## Tentativa de fechamento dos bloqueios da auditoria — 17/11/2026

- **A-005 (bloqueio externo):** implementado um **validador estrutural**
  reutilizável do pacote de evidências H406 (28 cenários, 2 dispositivos,
  2 deploys, SHA, aprovação e não duplicação), coberto por testes negativos.
  Isso não executa os cenários físicos, não autentica assinatura nem prova
  identidade de dispositivo. A-005 **continua bloqueado** enquanto não existirem
  28 resultados reais PASS auditáveis em ambiente isolado, obtidos por
  responsável designado com acesso aos aparelhos.
- **A-006 (dependências):** #390 encerrada. As issues #403, #404 e #405
  continuam abertas; trabalhos de implementação já mesclados em develop **não**
  equivalem a encerramento nem a homologação. #403 depende da validação clínica
  #534, ainda aberta; nenhum limiar clínico pode ser ativado por esta PR.
  Manter o bloqueio sem remover o `Depends on` da #406 nem forçar fechamento.
- **CI e auditoria:** o novo material HEAD requer pnpm validate/CI CRITICAL
  exact-SHA; eventual teste verde não fecha A-005/A-006 nem substitui auditoria
  independente posterior. PR #548 permanece Draft, sem merge.

## Apoio à coleta operacional — 18/11/2026

- O gerador `scripts/create-issue-406-homologation-template.mjs` oferece 28 posições vazias para homologação privada no SHA informado, com `NOT_RUN` e `physical_device_confirmed=false` em todas; o validador **deve** rejeitar o arquivo inicial. Os testes do gerador são executados pelo `pnpm test`.
- A-005 permanece **BLOQUEADA EXTERNAMENTE**: executar 28 cenários reais em desktop/telefone físicos e confirmar autenticidade dos dispositivos, deploys e aprovação do responsável. O gerador não transforma ausência de observação em PASS.
- A-006 permanece **BLOQUEADA POR ACEITE DAS DEPENDÊNCIAS**: #403/#404/#405 abertas. #534 exige sete decisões clínicas assinadas por profissional habilitado. Não alterar regras clínicas nem fechar issues apenas por CI ou merge anterior.
- A entrega permanece Draft e a issue #406 aberta. Exigir CI exato verde no novo HEAD e reauditoria independente após a coleta final de evidências.
