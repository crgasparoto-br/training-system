# Produto: padrao de acoes contextuais da Central do Aluno

Este documento define quando a Central do Aluno deve usar pop-up, painel lateral ou fluxo guiado para acoes feitas no contexto de um aluno selecionado.

Ele complementa:

- `docs/execution-plans/active/2026-07-student-central-roadmap.md`
- `docs/product/navigation-information-architecture.md`
- `docs/product/access-control.md`
- `docs/architecture/auth-and-access-control.md`

## Objetivo

Toda acao contextual da Central do Aluno deve preservar a pergunta principal do produto:

> Estou trabalhando com este aluno agora.

Ao salvar, cancelar ou encontrar erro, a experiencia deve manter o usuario no mesmo aluno sempre que a acao pertencer diretamente a esse aluno.

## Regra rapida de decisao

Use o menor fluxo que ainda permita revisar a acao com seguranca.

| Padrao | Usar quando | Nao usar quando |
| --- | --- | --- |
| Pop-up | A acao e curta, tem poucos campos, baixo risco e nao exige consulta paralela. | A acao exige leitura de varias secoes, muitos campos ou impacto historico complexo. |
| Painel lateral | O formulario e medio e o usuario deve manter aluno, resumo ou alertas visiveis como contexto. | A acao exige varias etapas, comparacao ou revisao final antes de concluir. |
| Fluxo guiado | A acao tem varias etapas, muitos campos, calculos, comparacoes, anexos relevantes ou impacto historico alto. | A acao pode ser concluida com poucos campos e sem revisao extensa. |

## Pop-up

Use pop-up para acoes rapidas e reversiveis, com baixa complexidade.

Exemplos iniciais:

- adicionar observacao simples;
- registrar acompanhamento curto;
- marcar proxima reavaliacao;
- encerrar alerta simples;
- anexar documento simples sem classificacao complexa.

Regras obrigatorias:

- abrir sem trocar o aluno selecionado;
- validar campos no proprio pop-up;
- permitir cancelar sem alterar dados;
- ao salvar, atualizar card ou historico relacionado quando a fonte existir;
- em erro de API, mostrar mensagem no pop-up e permitir tentar novamente ou fechar.

## Painel lateral

Use painel lateral para formularios medios que precisam manter o contexto visual do aluno.

Exemplos iniciais:

- editar parte do cadastro do aluno;
- atualizar objetivo principal;
- registrar desconforto com detalhes;
- atualizar parte da anamnese;
- revisar dados de contrato ou servico quando a permissao permitir.

Regras obrigatorias:

- manter o aluno selecionado como contexto;
- preservar a rota ou estado da Central para retorno;
- validar campos no painel;
- ao cancelar, voltar ao mesmo aluno sem alterar dados;
- ao salvar, manter o usuario no mesmo aluno e atualizar a area relacionada;
- em erro de API, manter os dados digitados e permitir nova tentativa.

## Fluxo guiado

Use fluxo guiado para registros grandes ou de alto impacto.

Exemplos iniciais:

- nova antropometria;
- nova adipometria;
- avaliacao completa;
- plano de treino;
- emissao de laudo;
- prescricao tecnica por capacidades quando existir.

Regras obrigatorias:

- declarar etapas claras;
- permitir revisar antes de concluir quando houver impacto tecnico ou historico;
- registrar origem, responsavel e data quando a API persistir o evento;
- preservar o aluno selecionado ao concluir, cancelar ou falhar;
- atualizar historico unificado ou indicar que e necessario recarregar quando a fonte ainda nao suportar atualizacao automatica.

## Contrato de contexto

Acoes contextuais da Central devem seguir este contrato:

1. A URL ou estado da tela deve conter o `alunoId` quando a acao pertence a um aluno.
2. O usuario deve voltar para `/central-do-aluno/:id` apos salvar ou cancelar a acao contextual, salvo quando continuar em uma subsecao interna do mesmo aluno for mais claro.
3. A UI pode ocultar a acao sem permissao, mas a API continua sendo a barreira de seguranca.
4. Dados sensiveis devem respeitar `screenKey`, `blockKey`, `dataScope` e `contractId` conforme `docs/product/access-control.md`.
5. Acoes com impacto historico devem atualizar o historico unificado quando houver evento persistido.
6. Estados de carregamento, vazio, erro e dados incompletos devem aparecer no contexto da acao, sem perder o aluno selecionado.

## Implementacao inicial aplicada

A rota `/central-do-aluno/:id/edit`, criada na primeira entrega da Central, e a entrada contextual inicial para editar dados de acompanhamento a partir da ficha centralizada.

Enquanto o painel lateral final nao existir, essa rota usa uma tela contextual enxuta para campos que aparecem no resumo da Central:

- objetivo principal;
- historico de treino;
- observacoes de acompanhamento.

Esse fluxo preserva o contrato de contexto inicial:

- a acao continua vinculada ao `alunoId` da Central;
- a rota deixa claro que a edicao pertence ao aluno selecionado;
- voltar e cancelar retornam para `/central-do-aluno/:id`;
- salvar atualiza a ficha e retorna para `/central-do-aluno/:id`;
- a API permanece responsavel por validar permissao e contrato.

O formulario completo de cadastro continua disponivel no fluxo legado em `/alunos/:id/edit`.

## Como declarar novas acoes

Toda nova acao contextual relevante deve declarar no PR ou na documentacao afetada:

- nome da acao;
- padrao escolhido: pop-up, painel lateral ou fluxo guiado;
- motivo da escolha;
- permissoes envolvidas;
- fonte de dados atualizada;
- efeito esperado em cards e historico;
- comportamento em salvar, cancelar, erro de validacao e erro de API.

## Checklist de aceite para PRs

Antes de concluir uma PR com acao contextual da Central, confirme:

- o usuario permanece no mesmo aluno nos caminhos principais;
- a acao nao depende apenas de ocultacao de UI para seguranca;
- campos sensiveis seguem permissao e escopo;
- salvar atualiza a area relacionada ou explica a necessidade de recarregar;
- cancelar nao altera dados;
- erro de validacao aparece perto do campo ou bloco afetado;
- erro de API permite tentar novamente ou fechar sem perder contexto;
- testes e validacoes relevantes do projeto foram executados.