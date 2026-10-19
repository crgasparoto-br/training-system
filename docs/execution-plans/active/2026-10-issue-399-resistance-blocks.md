# Plano — Issue #399, blocos e séries estruturadas

## Objetivo
Introduzir séries estruturadas dentro do WorkoutExercise canônico com versão planejada protegida contra execução.

## Escopo
Schema Prisma, migração aditiva, validação do backend, endpoints, Workout Builder, cópia de semana/dia, testes e documentação.

## Fora de escopo
Agrupamentos entre exercícios (#400), comparação planejado/executado (#401), sugestão de carga.

## Critérios de aceite e validação
- Blocos 1..12 e séries 1..30 em ordem contígua por exercício; tipos predefinidos.
- Intervalos de repetições e parâmetros de carga/esforço/tempo opcionais sem defaults clínicos.
- Exercícios simples anteriores à migração permanecem editáveis no modo legado.
- Salvamento atômico do dia e preservação das séries na cópia de dias/semanas.
- Treinos liberados e iniciados imutáveis (serviço e triggers).
- Referência opcional do executado à série planejada correta sem sobrescrevê-la.
- Testes unitários, verificação `pnpm validate`, migração e evidência visual em três viewports.

## Estado de execução
Implementação no branch `feat/399-resistance-blocks-sets`. Checkout local via GitHub bloqueado por DNS; checagens completas dependem de runner/CI. O plano fica ativo até homologação e auditoria independente.

## Correção de auditoria — AUD-399-01/02/03 e REC-399-01
- Substituição transacional do dia reconcilia identidades em vez de `deleteMany` geral.
- Linhas históricas referenciadas por execução não podem ser removidas ou regravadas silenciosamente.
- O editor transmite o identificador persistido; cópias novas não reutilizam esse vínculo.
- Erros do endpoint recebem status/código públicos conhecidos, sem mensagens SQL/Prisma.
- Controles unitários incluem correspondência estável, identidade duplicada/inválida e sanitização de erros.
- Gate final: exigir CI `Validate repository` verde no HEAD e homologação visual/migration.
