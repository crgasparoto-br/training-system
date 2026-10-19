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

## Remediação da auditoria — AUD-399-04/05/06

- `AUD-399-04`: exigir autenticação de professor ativo e escopo contratual nos caminhos atuais e legados; bloquear leitura e escrita entre contratos.
- `AUD-399-05`: triggers validam origem e destino ao transferir blocos/séries, inclusive quando origem está liberada ou possui execução.
- `AUD-399-06`: manter blocos ao corrigir a data de uma semana e preservar distinção entre campo omitido e lista explicitamente vazia no cliente.
- Regressões obrigatórias: caminhos anônimos/aluno/outro contrato, atualização de relacionamento via Prisma/SQL, reabrir e salvar uma semana após alteração da data.
- Antes do fechamento: `Validate repository` verde no novo SHA, homologação da migration e evidência visual desktop/mobile, seguidas de auditoria independente.
