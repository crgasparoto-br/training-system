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
- Migration PostgreSQL em teste, prisma generate, type-check, lint, build, pnpm validate.
- Auditoria independente do diff, controles negativos e ausência de regressões.
- PR para develop sem merge.

## Limites
- Orientação futura não substitui revisão de prescrição e liberação operacional.
- Ativação de regras clínicas combinadas segue fluxo de homologação separado.
