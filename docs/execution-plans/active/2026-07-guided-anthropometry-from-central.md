# Fluxo guiado de antropometria a partir da Central do Aluno

## Issue relacionada

- #184
- Épica: #172

## Entrega

Esta entrega prepara o fluxo de nova antropometria iniciado pela Central do Aluno.

## Comportamento esperado

- Quando a URL contém `alunoId`, o aluno é carregado como contexto principal do fluxo.
- O aluno fica bloqueado contra troca acidental durante a coleta.
- O fluxo exibe etapas guiadas para aluno, cabeçalho obrigatório, coleta e salvamento.
- Data e professor responsável são tratados como dados obrigatórios para rastreabilidade.
- O usuário tem ação de retorno para a Central do aluno selecionado.

## Fora de escopo

- Adipometria completa.
- Laudos finais.
- Gráficos avançados de evolução.
- Publicação automática de prescrição a partir da avaliação.
