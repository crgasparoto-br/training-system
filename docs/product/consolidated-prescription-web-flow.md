# Fluxo web da Montagem Consolidada da Prescrição

Este documento define a experiência do professor para a Montagem Consolidada implementada pela issue #318. O domínio persistente, as transições e os contratos HTTP permanecem definidos em `docs/product/consolidated-prescription-model.md`.

## Objetivo

Permitir que o professor autorizado consolide as prescrições de Resistido, Flexibilidade, Cíclico e Equilíbrio sem perder o contexto do aluno e sem reproduzir no navegador regras que pertencem à API.

Rota protegida:

```text
/central-do-aluno/:alunoId/montagem-consolidada
```

A Central do Aluno oferece um ponto de entrada contextual quando o usuário possui `plans.consolidatedPrescriptions.view`. O `alunoId` permanece na URL durante todo o fluxo e o retorno aponta para a ficha do mesmo aluno.

## Read-model autoritativo do workspace

A tela não usa `GET /alunos/:id` para decidir se o professor pode trabalhar com o aluno. Esse endpoint possui regras próprias do domínio de alunos e não é a autoridade de escopo da montagem.

O frontend usa:

```text
GET /api/v1/consolidated-prescriptions/alunos/:alunoId/workspace
```

Esse read-model é protegido por `plans.consolidatedPrescriptions.view`, aplica o mesmo `dataScope` de `plans` usado pelas demais operações da montagem e devolve somente o contexto necessário ao fluxo:

- aluno;
- professor ator;
- professor atribuído ao aluno;
- professor responsável pela versão corrente, quando houver;
- candidatos das quatro capacidades com decisão de elegibilidade, motivo e origens técnicas.

Assim, um gestor com `plans=contract` pode consultar e aprovar uma montagem de aluno atribuído a outro professor quando sua função tiver os blocos correspondentes. Usuário `self`, `managed` ou de outro tenant continua limitado pelo mesmo escopo usado na API autoritativa.

A carga dos candidatos é parcial: uma falha ao montar a lista de elegibilidade não apaga a montagem já carregada. O workspace devolve `capacityCandidatesError` e a UI mantém consulta, histórico e estado corrente disponíveis, mas não oferece novas versões de capacidade até a recarga bem-sucedida.

## Autoridade e permissões

A interface usa os blocos do backend:

- `plans.consolidatedPrescriptions.view`: consultar montagem, workspace, conflitos e histórico;
- `plans.consolidatedPrescriptions.manage`: criar/editar rascunho, enviar para revisão, recalcular conflitos, desbloquear explicitamente uma montagem remediada e iniciar nova revisão;
- `plans.consolidatedPrescriptions.approve`: aprovar uma montagem pronta para revisão.

Ocultar controles no frontend melhora a experiência, mas não é barreira de segurança. A API continua revalidando autenticação, `contractId`, `dataScope`, aluno acessível, estado, versão e bloco da operação.

A tela também trata a autorização como condição mutável durante a sessão. Se uma chamada da própria Montagem Consolidada passar a responder `401`, `403` ou `404`, o frontend não mantém o conteúdo protegido anteriormente renderizado: invalida o contexto local da montagem, oculta os dados carregados e apresenta um estado de recurso indisponível com retorno para a Central do mesmo aluno. Erros de APIs não pertencentes ao fluxo consolidado não invalidam essa tela.

## Organização da tela

A tela usa oito seções colapsáveis:

1. Dados gerais;
2. Capacidades recebidas;
3. Dados-base e origem;
4. Alertas e conflitos;
5. Composição e ordem técnica;
6. Mensagem prática ao aluno;
7. Revisão e validação final;
8. Histórico de versões.

O contexto superior mantém visíveis aluno, professor responsável, versão corrente, estado, origem do acesso, situação das origens e datas de criação/atualização. Além disso, expõe explicitamente as capacidades selecionadas com seus números de versão, usando a versão persistida da montagem quando ela existe e, antes do primeiro rascunho, os candidatos que a API marcou como elegíveis.

A situação das origens apenas resume sinais já retornados pela API; o navegador não cria uma classificação técnica paralela. Os rótulos de apresentação discriminam os contratos autoritativos já existentes:

- `Dado ausente`: `missing_prescription` ou `missing_current_version` do workspace;
- `Dado desatualizado`: conflito `capacity-version-ineligible:*`, cuja mensagem backend informa que a versão selecionada deixou de ser vigente e ativa;
- `Origem incompatível`: `prescription_not_active` ou `version_not_active` do workspace;
- warning e `critical`: severidade retornada pelo motor de conflitos;
- conflito de versão/concorrência: HTTP `409`, tratado separadamente.

Essas categorias são de apresentação e recuperação. Elas não substituem `eligible`, `reasonCode`, `reason`, `severity` ou qualquer regra clínica do backend.

## Capacidades e composição

O navegador não interpreta `status` para decidir elegibilidade. Para cada capacidade, o workspace retorna:

- prescrição e status persistido;
- ID e número da versão corrente;
- status persistido da versão;
- `eligible`;
- `reasonCode`;
- `reason` já redigido pelo backend;
- resumo profissional e origens técnicas.

Somente candidato com `eligible=true` pode ser apresentado como opção de substituição. Quando `eligible=false`, a UI mostra o motivo recebido sem criar uma explicação técnica própria. Os rótulos `Dado ausente` e `Origem incompatível` apenas agrupam `reasonCode` documentado; a decisão de elegibilidade continua sendo `eligible` do backend.

Nesta fase a Montagem Consolidada recebe blocos de capacidade e não possui contrato de edição de exercícios individuais. Por isso:

- a tela permite trocar uma capacidade pela versão que o workspace autorizou;
- a ordem dos quatro blocos pode ser alterada com controles nomeados para teclado e leitor de tela;
- exercícios, séries, repetições e métodos permanecem dentro das prescrições de capacidade;
- a interface não cria um editor paralelo do Workout Builder;
- a montagem exige uma versão para cada capacidade canônica antes de salvar.

## Preservação de responsabilidade e rastreabilidade

Uma edição comum não pode trocar silenciosamente o professor responsável nem apagar dados-base já persistidos.

Ao salvar uma versão existente, o frontend envia novamente:

- `responsibleProfessorId` da versão corrente;
- referências adicionais persistidas cujo `role` não seja `capacity_source`;
- composição, observação, justificativa e orientação atuais.

Referências `capacity_source` não são reenviadas pelo cliente porque continuam derivadas pelo backend a partir das versões de capacidade. O ator autenticado permanece uma identidade separada do responsável técnico e é registrado pela API/auditoria.

## Alertas e conflitos

A interface representa a severidade retornada pelo backend sem reclassificação local:

- `info`: informativo;
- `warning`: atenção profissional, não bloqueante por si só;
- `critical`: impedimento para aprovação.

Checagens ainda indisponíveis aparecem em `unavailableChecks`. Texto livre de observação, justificativa ou mensagem ao aluno não cria nem remove conflitos.

Quando o motor retorna `capacity-version-ineligible:<capacidade>`, a UI pode apresentar o rótulo `Dado desatualizado` porque a própria mensagem canônica do conflito declara que a versão selecionada não é mais a versão vigente e ativa. O rótulo não altera severidade, não muda automaticamente a composição e não substitui a reavaliação no servidor.

## Workflow

### Sem montagem

O professor revisa os quatro candidatos autorizados, informa a justificativa e cria o primeiro rascunho. Se alguma capacidade estiver inelegível, a tela mostra o motivo recebido do workspace e orienta correção na origem.

### Rascunho

Com `manage`, o professor pode atualizar a composição e salvar. Toda edição material usa o contrato versionado do backend. O envio para revisão fica indisponível enquanto existirem alterações locais não persistidas.

### Pronta para revisão

A composição fica somente leitura. O usuário com `approve` pode aprovar quando não há conflito crítico carregado. A UI nunca muda o estado para `approved` de forma otimista: o estado só muda após a resposta da API.

### Bloqueada

Com `manage`, a composição pode receber correções, mas o salvamento permanece em `blocked`. Depois da correção, o professor executa a reavaliação explícita de conflitos. O desbloqueio só aparece quando o relatório corresponde à versão corrente, informa `canUnblock=true`, não contém `critical` e não existe edição local pendente.

### Aprovada

A versão aprovada é somente leitura. Com `manage`, o professor pode iniciar uma nova revisão explícita, criada pelo backend como novo rascunho na mesma cadeia.

### Liberada

A versão liberada continua somente leitura e não é editada nem republicada por esta tela. Com `manage`, o professor pode iniciar uma nova revisão explícita; o backend cria outra versão `draft`, mantém a versão `released` no histórico e exige novamente revisão/aprovação antes de qualquer liberação operacional futura.

### Arquivada

A tela permanece somente leitura. Não existe ação de nova revisão a partir de `archived` nesta fase.

## Concorrência e recuperação

Todas as mutações posteriores à criação usam `expectedCurrentVersion`.

Quando a API responde `409`:

- a tela não sobrescreve automaticamente a versão do servidor;
- alterações locais permanecem no formulário;
- o professor recebe mensagem explícita de conflito;
- recarregar do servidor é uma ação deliberada;
- se houver edição local, a tela pede confirmação antes de substituí-la.

Quando uma chamada da própria Montagem Consolidada passa a responder `401`, `403` ou `404`, a situação é diferente de uma falha transitória: o contexto protegido é invalidado e ocultado. O usuário recebe uma mensagem de indisponibilidade e um retorno para `/central-do-aluno/:alunoId`. A tela não continua exibindo uma montagem que o backend acabou de negar. Uma resposta `404` de outro domínio não dispara essa invalidação.

## Histórico

As versões persistidas são apresentadas em modo somente leitura com número, estado, data, justificativa, observação e capacidades vinculadas. Nenhuma versão histórica pode ser editada pela tela. Ao criar revisão depois de `released`, a versão liberada anterior permanece visível e imutável no histórico.

## Acessibilidade e responsividade

A implementação reutiliza `Button`, `Card` e `Accordion`. Controles de ordenação possuem nome acessível, estados de erro/sucesso usam regiões de anúncio, warning e blocker possuem rótulos textuais além da cor e a composição reorganiza ações para mobile. Os estados `Dado ausente`, `Dado desatualizado` e `Origem incompatível` também possuem rótulos textuais próprios, portanto não dependem apenas de cor.

O gate automatizado da issue foi definido para cobrir duas camadas complementares. A camada isolada executa cenários determinísticos de UI para `1440x1000`, `1366x768` e `390x844`, teclado nos colapses e histórico, ausência de overflow horizontal, axe-core WCAG A/AA, snapshots ARIA do Chromium, texto ampliado a 200%, contraste de `text-primary` em dark mode, distinção visual de warning/critical, histórico somente leitura e recuperação de conflito HTTP `409` com preservação local.

A camada integrada sobe PostgreSQL efêmero, executa as migrations do repositório e monta os routers reais de autenticação e Montagem Consolidada. Antes dessa etapa, o workflow compila `@corrida/types` e `@corrida/utils`, dependências workspace expostas em runtime por `dist/`. Quando o gate conclui com sucesso, o Chromium acessa a aplicação por um proxy same-origin sem `route.fulfill()` para `/api/v1/**` e executa `workspace -> criar rascunho -> enviar para revisão -> aprovar -> reler estado persistido`, comprovando o fluxo navegador ↔ API real.

O mesmo gate inclui uma sessão nativa de leitor de tela com Orca em Chromium headed sobre AT-SPI. A sessão navega por foco/teclado até a seção de histórico, registra versão do Orca, aplicações conhecidas pelo AT-SPI e debug nativo do leitor de tela, e falha se o Chromium não for enumerado ou se o conteúdo acessível da issue não aparecer no log do Orca.

A cor de fundo de controles preenchidos usa o token `--primary` mais escuro. Texto/ícones `text-primary` em dark mode usam um foreground mais claro separado, e o `--ring` escuro recebe contraste próprio para foco.

**Limite de evidência:** o aceite de leitor de tela da #318 só é considerado comprovado quando o gate nativo Orca/Linux/AT-SPI conclui com sucesso no SHA candidato. A entrega não declara equivalência específica de NVDA/Windows nem VoiceOver/macOS; essas plataformas permanecem verificações adicionais, não substitutas do gate nativo.

## Fora de escopo

Esta interface não implementa cálculo de conflito no frontend, publicação direta do Treino de hoje, feedback pós-treino, decisão automática, editor completo de exercícios, WhatsApp ou aplicação em massa.
