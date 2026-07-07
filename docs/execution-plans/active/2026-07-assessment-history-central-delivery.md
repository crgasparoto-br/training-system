# Entrega incremental - Central do Aluno: avaliações

## Issues relacionadas

- Épica: #172
- Subissue: #183
- Subissue: #184

## Objetivo da PR

Registrar a primeira entrega rastreável da trilha de avaliações dentro da Central do Aluno, preparando o trabalho incremental para transformar avaliações, antropometria e futuras adipometrias em histórico evolutivo consultável pelo professor.

## Escopo planejado da entrega

- Consolidar o card de avaliações na aba de resumo da Central do Aluno.
- Exibir última avaliação, tipo, data e responsável quando disponíveis.
- Exibir próxima reavaliação quando existir regra ou resumo carregado.
- Diferenciar estado vazio, pendente, em dia e vencido quando os dados permitirem.
- Manter ações contextuais para:
  - iniciar nova avaliação/antropometria preservando `alunoId`;
  - abrir histórico de avaliações do aluno;
  - indicar comparação como disponível ou pendente conforme quantidade de registros.
- Preservar a evolução futura para antropometria guiada, adipometria, comparação e laudos.

## Critérios de aceite cobertos nesta trilha

- A Central deve exibir estado claro para aluno sem avaliação.
- A Central deve exibir a última avaliação quando existir.
- O professor deve ter ação clara para iniciar nova antropometria a partir do aluno selecionado.
- O histórico deve preservar data, tipo, responsável, origem e vínculo com o aluno.
- Comparação detalhada e laudos permanecem fora desta primeira entrega.

## Validação esperada

Executar na raiz do repositório:

```bash
pnpm validate
```

Quando necessário, validar também cenários manuais:

- aluno sem avaliações;
- aluno com uma avaliação;
- aluno com múltiplas avaliações;
- início de antropometria via Central do Aluno com `alunoId` preservado;
- usuário sem permissão para dados de avaliação física.

## Observações

Esta entrega usa a issue #172 como direção principal e mantém #183/#184 como recorte inicial de implementação. Alterações de backend, cálculo antropométrico, adipometria completa, gráficos e laudos finais devem seguir em PRs específicas ou em commits complementares desta branch quando houver escopo fechado.
