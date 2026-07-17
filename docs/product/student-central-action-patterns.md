# Padrao de acoes contextuais da Central do Aluno

Este documento define quando usar pop-up, painel lateral ou fluxo guiado em acoes realizadas no contexto de um aluno selecionado.

Referencias:

- [`roadmap.md`](roadmap.md)
- [`navigation-information-architecture.md`](navigation-information-architecture.md)
- [`access-control.md`](access-control.md)
- [`../architecture/auth-and-access-control.md`](../architecture/auth-and-access-control.md)

## Principio

Toda acao contextual deve preservar a ideia de que o usuario esta trabalhando com o mesmo aluno. Salvar, cancelar ou encontrar erro nao deve trocar o aluno nem levar o usuario para um fluxo administrativo desconectado.

## Regra de escolha

Use o menor fluxo que permita revisar a acao com seguranca.

| Padrao | Usar quando | Exemplos |
| --- | --- | --- |
| Pop-up | Poucos campos, baixo risco e nenhuma consulta paralela. | Observacao curta, acompanhamento simples, encerramento de alerta. |
| Painel lateral | Formulario medio que deve manter resumo e alertas do aluno visiveis. | Atualizar objetivo, parte da anamnese, desconforto ou vinculo. |
| Fluxo guiado | Muitas etapas, calculos, comparacao, anexos ou impacto historico alto. | Antropometria, avaliacao completa, prescricao ou laudo. |

## Regras comuns

Toda acao contextual deve:

- receber ou preservar `alunoId`;
- manter a rota ou o estado necessario para retornar a `/central-do-aluno/:id`;
- permitir cancelar sem alterar dados;
- manter os dados digitados quando ocorrer erro recuperavel;
- atualizar o card, resumo ou historico relacionado depois de salvar;
- exibir estados de carregamento, validacao e erro no proprio contexto;
- ocultar a acao na UI quando nao houver permissao;
- exigir bloqueio equivalente na API;
- respeitar `screenKey`, `blockKey`, `dataScope` e `contractId`;
- registrar origem, responsavel e data quando houver impacto historico.

## Pop-up

Adequado para acoes curtas e reversiveis.

Requisitos:

- poucos campos;
- validacao local;
- confirmacao apenas quando a acao for destrutiva ou irreversivel;
- atualizacao imediata da area relacionada;
- nova tentativa sem perder o conteudo em caso de falha.

## Painel lateral

Adequado para formularios medios que precisam manter o aluno visivel como contexto.

Requisitos:

- cabecalho com identificacao do aluno;
- resumo ou alerta relevante disponivel durante a edicao;
- salvamento sem sair da Central;
- cancelamento retornando ao mesmo ponto;
- tratamento de conflito quando os dados tiverem mudado em paralelo.

## Fluxo guiado

Adequado para registros tecnicos ou historicos complexos.

Requisitos:

- etapas claras;
- validacao por etapa quando aplicavel;
- revisao final antes da conclusao;
- distincao entre rascunho e concluido quando o dominio exigir;
- historico e versao preservados;
- retorno explicito para a Central do Aluno.

## Contrato de navegacao

1. A URL ou o estado da tela deve conter o aluno quando a acao pertencer a um aluno.
2. O retorno padrao e `/central-do-aluno/:id` ou uma subsecao do mesmo aluno.
3. Rotas antigas podem continuar existindo por compatibilidade, mas nao devem perder o contexto recebido pela Central.
4. Acoes historicas devem atualizar a timeline quando houver evento persistido.
5. Quando a atualizacao automatica ainda nao existir, a interface deve informar a necessidade de recarregar.

## Declaracao obrigatoria em PR

Toda nova acao contextual relevante deve informar:

- padrao escolhido;
- motivo da escolha;
- permissoes envolvidas;
- fonte de dados atualizada;
- impacto em cards e historico;
- comportamento ao salvar, cancelar e falhar;
- testes e validacoes executados.

## Criterio de aceite

A acao somente esta concluida quando:

- o aluno permanece selecionado em todos os caminhos principais;
- a API bloqueia acesso indevido;
- campos sensiveis respeitam permissao e escopo;
- salvar atualiza a area relacionada;
- cancelar nao altera dados;
- erros permitem recuperacao sem perda desnecessaria;
- os testes relevantes foram executados ou o bloqueio foi documentado.
