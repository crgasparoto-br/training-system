# Produto: controle de acesso

O controle de acesso define o que cada funcao de colaborador pode ver e quais dados pode consultar.

## Objetivos

- Controlar telas visiveis no menu e nas rotas.
- Controlar abas, blocos e acoes sensiveis dentro das telas.
- Controlar quais registros o usuario pode consultar.
- Permitir configuracao por funcao sem perder defaults seguros.

## Regras de produto

### Professor

- Pode acessar telas operacionais necessarias para sua rotina.
- Em colaboradores, o padrao e `self`: somente o proprio cadastro.
- Nao deve visualizar dados financeiros ou administrativos sem permissao explicita.

### Gestor

- Pode ter acesso ampliado conforme a configuracao da funcao.
- Para colaboradores, pode usar `managed` ou `contract` conforme decisao operacional.

### Administrativo

- Pode acessar dados financeiros e contratos quando configurado.
- Nao deve receber automaticamente permissoes tecnicas de treino ou avaliacao fisica.

### Master

- Tem acesso total dentro do contrato.

## Quando criar `screenKey`

Crie uma nova `screenKey` quando a funcionalidade for uma tela, item de menu ou capacidade principal que precise ser ligada/desligada para uma funcao.

## Quando criar `blockKey`

Crie uma nova `blockKey` quando a permissao for para:

- aba interna;
- secao sensivel;
- botao de acao;
- operacao destrutiva;
- bloco de dados financeiro, saude, contrato ou auditoria.

## Quando aplicar `dataScope`

Aplique escopo de dados quando uma tela pode ser acessada por varias funcoes, mas cada funcao deve enxergar subconjuntos diferentes de registros.

Exemplo: a funcao professor pode abrir Consulta de Colaboradores, mas deve ver somente o proprio cadastro.

## Contratos de colaboradores

O controle contratual aparece na edicao individual protegida por `collaborators.registration`.

A leitura de vigente, candidatos, historico e legado respeita o `dataScope` configurado para a tela:

- `self`: somente o proprio colaborador;
- `managed`: colaboradores sob gestao do usuario;
- `contract`: todos os colaboradores do tenant autenticado.

As acoes de previa, geracao, PDF, envio, cancelamento e vigencia exigem o bloco `collaborators.actions.uploadSignedContract`. A chave foi mantida para compatibilidade com configuracoes existentes, mas seu significado funcional passa a ser **gerenciar contrato do colaborador**, e nao apenas enviar um PDF legado.

Regras obrigatorias:

- a API valida tela, bloco, escopo e `contractId` antes de qualquer escrita;
- a interface oculta as acoes quando o bloco nao esta liberado;
- registros legados continuam visiveis somente para leitura;
- permissao de contrato nao amplia o escopo de dados da tela;
- nenhum usuario pode consultar ou alterar contrato de outro tenant.

## PRNT

O PRNT usa a tela `physicalAssessment.protocol` e blocos especificos para liberar partes do prontuario:

- `physicalAssessment.prnt.summary`
- `physicalAssessment.prnt.goals`
- `physicalAssessment.prnt.anamnesisFollowUp`
- `physicalAssessment.prnt.activityHistory`
- `physicalAssessment.prnt.medicationsProcedures`
- `physicalAssessment.prnt.painCases`
- `physicalAssessment.prnt.discomforts`
- `physicalAssessment.prnt.actions.createRecord`
- `physicalAssessment.prnt.actions.editRecord`
- `physicalAssessment.prnt.actions.closeFollowUp`

Os perfis `professor` e `manager` recebem acesso padrao ao PRNT. A API deve validar a tela e o bloco antes de ler ou alterar qualquer dado do prontuario.

## Criterios de aceite para mudancas de acesso

- Catalogo compartilhado atualizado.
- Defaults por perfil revisados.
- Backend bloqueia acesso indevido.
- Frontend oculta menu, tela, aba ou acao sem permissao.
- Testes cobrem pelo menos um caso permitido e um negado.
- `pnpm access:check` passa.
