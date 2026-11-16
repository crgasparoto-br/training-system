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

## Limites
- Orientação futura não substitui revisão de prescrição e liberação operacional.
- Ativação de regras clínicas combinadas segue fluxo de homologação separado.
