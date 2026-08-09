# Fluxo web da Montagem Consolidada da Prescrição

Este documento define a experiência do professor para a Montagem Consolidada implementada pela issue #318. O domínio persistente, as transições e os contratos HTTP continuam definidos em `docs/product/consolidated-prescription-model.md`.

## Objetivo

Permitir que o professor autorizado consolide as prescrições de Resistido, Flexibilidade, Cíclico e Equilíbrio sem perder o contexto do aluno e sem reproduzir no navegador regras que pertencem à API.

Rota protegida:

```text
/central-do-aluno/:alunoId/montagem-consolidada
```

A Central do Aluno oferece um ponto de entrada contextual quando o usuário possui `plans.consolidatedPrescriptions.view`. O `alunoId` permanece na URL durante todo o fluxo e o retorno sempre aponta para a ficha do mesmo aluno.

## Autoridade e permissões

A interface usa os mesmos blocos introduzidos no backend:

- `plans.consolidatedPrescriptions.view`: consultar a montagem e seu histórico;
- `plans.consolidatedPrescriptions.manage`: criar/editar rascunho, enviar para revisão, recalcular conflitos e iniciar nova revisão quando permitido pelo estado;
- `plans.consolidatedPrescriptions.approve`: aprovar uma montagem pronta para revisão.

Ocultar controles no frontend melhora a experiência, mas não é barreira de segurança. A API continua revalidando autenticação, `contractId`, `dataScope`, aluno acessível, estado, versão e bloco da operação.

## Organização da tela

A tela é longa e usa seções colapsáveis:

1. Dados gerais;
2. Capacidades recebidas;
3. Dados-base e origem;
4. Alertas e conflitos;
5. Composição e ordem técnica;
6. Mensagem prática ao aluno;
7. Revisão e validação final;
8. Histórico de versões.

O cabeçalho mantém visíveis aluno, professor responsável, versão corrente, estado, origem do acesso e datas de criação/atualização.

## Capacidades e composição

A UI carrega as prescrições públicas por capacidade apenas para apresentar o estado retornado pela API e a versão ativa disponível. A elegibilidade definitiva continua no backend.

Nesta fase a Montagem Consolidada recebe blocos de capacidade e não possui contrato de edição de exercícios individuais. Por isso:

- a tela permite atualizar uma capacidade para sua versão ativa quando o estado atual permite edição;
- a ordem dos quatro blocos pode ser alterada com controles acessíveis por teclado;
- exercícios, séries, repetições, métodos e outros itens permanecem dentro das prescrições de capacidade e do fluxo específico de treino;
- a interface não cria um editor paralelo do Workout Builder;
- a montagem exige uma versão para cada capacidade canônica antes de salvar.

## Alertas e conflitos

A interface representa a severidade retornada pelo backend sem reclassificação local:

- `info`: informativo;
- `warning`: atenção profissional, não bloqueante por si só;
- `critical`: impedimento para aprovação.

Checagens ainda indisponíveis no motor aparecem separadamente a partir de `unavailableChecks`. Texto livre de observação, justificativa ou mensagem ao aluno não cria nem remove conflitos.

## Workflow

### Sem montagem

O professor revisa as quatro capacidades, informa a justificativa e cria o primeiro rascunho. Se alguma capacidade não estiver ativa/disponível, a tela explica o estado retornado e orienta a correção na origem antes de salvar.

### Rascunho

Com `manage`, o professor pode atualizar a composição e salvar. Toda edição material usa o contrato versionado do backend. O envio para revisão fica indisponível enquanto existirem alterações locais não persistidas.

### Pronta para revisão

A composição fica somente leitura. O usuário com `approve` pode aprovar quando não há conflito crítico carregado. A UI nunca muda o estado para `approved` de forma otimista: o estado só muda após a resposta de sucesso da API.

### Bloqueada

A composição pode receber correções quando `manage` permite. A reavaliação dos conflitos é uma ação explícita do servidor. A interface não desbloqueia nem promove estado por inferência local.

### Aprovada

A versão aprovada é somente leitura. Com `manage`, o professor pode iniciar uma nova revisão explícita, que o backend cria como novo rascunho na mesma cadeia.

### Liberada ou arquivada

A tela permanece somente leitura nesta fase. A liberação operacional e a geração do Treino de hoje pertencem às issues posteriores do fluxo integrado.

## Concorrência e recuperação

Todas as mutações posteriores à criação usam `expectedCurrentVersion`.

Quando a API responde `409`:

- a tela não sobrescreve automaticamente a versão do servidor;
- as alterações locais permanecem no formulário;
- o professor recebe uma mensagem explícita de conflito;
- recarregar do servidor é uma ação deliberada;
- se houver edição local, a tela pede confirmação antes de substituí-la.

Falhas parciais no carregamento das prescrições por capacidade não apagam a montagem já carregada. Falhas de salvamento também preservam o conteúdo local quando seguro.

## Histórico

As versões persistidas são apresentadas em modo somente leitura com:

- número e estado;
- data;
- justificativa e observação técnica quando existentes;
- capacidades e versões vinculadas.

Nenhuma versão histórica pode ser editada pela tela.

## Acessibilidade e responsividade

A implementação reutiliza `Button`, `Card`, `Accordion`, tokens Tailwind e utilitários `ts-*` existentes. Os controles de ordenação possuem nome acessível, estados de erro/sucesso usam regiões de anúncio, e a composição reorganiza ações e cartões para mobile sem depender apenas de cor para transmitir severidade.

A validação visual deve cobrir, no mínimo:

- desktop amplo;
- desktop com baixa altura;
- mobile;
- navegação por teclado nos colapses, campos e ações principais.

## Fora de escopo

Esta interface não implementa:

- cálculo de conflito no frontend;
- publicação direta do Treino de hoje;
- feedback pós-treino;
- decisão técnica automática;
- editor completo de exercícios/Workout Builder;
- envio de WhatsApp;
- aplicação em massa para vários alunos.
