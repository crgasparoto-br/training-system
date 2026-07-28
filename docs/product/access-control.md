# Produto: controle de acesso

O controle de acesso define o que cada função de colaborador pode ver e quais dados pode consultar.

## Objetivos

- Controlar telas visíveis no menu e nas rotas.
- Controlar abas, blocos e ações sensíveis dentro das telas.
- Controlar quais registros o usuário pode consultar.
- Permitir configuração por função sem perder defaults seguros.

## Regras de produto

### Professor

- Pode acessar telas operacionais necessárias para sua rotina.
- Em colaboradores, o padrão é `self`: somente o próprio cadastro.
- Não deve visualizar dados financeiros ou administrativos sem permissão explícita.

### Gestor

- Pode ter acesso ampliado conforme a configuração da função.
- Para colaboradores, pode usar `managed` ou `contract` conforme decisão operacional.

### Administrativo

- Pode acessar dados financeiros e contratos quando configurado.
- Não deve receber automaticamente permissões técnicas de treino ou avaliação física.

### Master

- Tem acesso total dentro do contrato.

## Quando criar `screenKey`

Crie uma nova `screenKey` quando a funcionalidade for uma tela, item de menu ou capacidade principal que precise ser ligada/desligada para uma função.

## Quando criar `blockKey`

Crie uma nova `blockKey` quando a permissão for para:

- aba interna;
- seção sensível;
- botão de ação;
- operação destrutiva;
- bloco de dados financeiro, saúde, contrato ou auditoria.

Um `blockKey` registrado no catálogo compartilhado também pode proteger diretamente rota ou item de menu. `canAccessScreen` reconhece a chave e delega para `canAccessBlock`, preservando a exigência da tela pai e da permissão específica.

## Quando aplicar `dataScope`

Aplique escopo de dados quando uma tela pode ser acessada por várias funções, mas cada função deve enxergar subconjuntos diferentes de registros.

Exemplo: a função professor pode abrir Consulta de Colaboradores, mas deve ver somente o próprio cadastro.

## Contratos de colaboradores

O controle contratual aparece na página individual do colaborador. Na consulta, protegida por `collaborators.consultation`, o bloco é estritamente somente leitura. Na edição, protegida por `collaborators.registration`, as ações administrativas são liberadas conforme permissão.

As APIs de leitura aceitam `collaborators.consultation` ou `collaborators.registration` e usam o escopo mais permissivo disponível entre essas telas. A leitura de vigente, candidatos, histórico e legado respeita o `dataScope` calculado:

- `self`: somente o próprio colaborador;
- `managed`: colaboradores sob gestão do usuário;
- `contract`: todos os colaboradores do tenant autenticado.

As ações de prévia, geração, PDF, envio, cancelamento e vigência exigem `collaborators.registration` e o bloco `collaborators.actions.uploadSignedContract`. A chave foi mantida para compatibilidade com configurações existentes, mas seu significado funcional passa a ser **gerenciar contrato do colaborador**, e não apenas enviar um PDF legado.

Regras obrigatórias:

- a API valida tela, bloco, escopo e `contractId` antes de qualquer escrita;
- a consulta individual não apresenta ações de mutação;
- a interface de edição oculta as ações quando o bloco não está liberado;
- registros legados continuam visíveis somente para leitura;
- permissão de contrato não amplia o escopo de dados da tela;
- nenhum usuário pode consultar ou alterar contrato de outro tenant.

## PRNT

O PRNT usa a tela `physicalAssessment.protocol` e blocos específicos para liberar partes do prontuário:

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

Os perfis `professor` e `manager` recebem acesso padrão ao PRNT. A API deve validar a tela e o bloco antes de ler ou alterar qualquer dado do prontuário.

O endpoint de resumo não amplia permissões clínicas. Ele consulta e devolve objetivos, acompanhamentos, histórico de atividade, medicações/procedimentos, casos de dor e desconfortos somente quando o bloco correspondente está vigente. Relações negadas são projetadas como listas vazias, inclusive para consumidores indiretos como a prescrição por capacidades.

## Prescrição por capacidades

A prescrição por capacidades reutiliza a tela operacional `plans` e separa leitura de escrita:

- `plans.capacityPrescriptions.view`: visualizar o item no menu, abrir a rota, consultar capacidades, versões, fontes, planejamento, catálogo e parâmetros atuais;
- `plans.capacityPrescriptions.manage`: classificar objetivos e criar novas versões de capacidade e planejamento;
- `settings.parameters.capacityPrescriptions`: criar nova versão de parâmetros técnicos e itens do catálogo do contrato.

Os perfis `professor` e `manager` recebem leitura e escrita de prescrição por padrão. Somente `manager` recebe administração de parâmetros por padrão; `master` mantém acesso total dentro do contrato.

Regras obrigatórias:

- o item `Prescrição por capacidades` não aparece sem `plans.capacityPrescriptions.view`;
- a rota `/protocolo-avaliacao-fisica/prescricao-capacidades` exige `plans.capacityPrescriptions.view`, ainda que o usuário possua `physicalAssessment.protocol`;
- controles de mutação são ocultados ou desabilitados sem `plans.capacityPrescriptions.manage`;
- o backend deriva `contractId` e professor ator da autenticação;
- o body não pode selecionar tenant nem publicar treino;
- aluno, responsável, objetivo, avaliação, preferência, parâmetro e demais origens são revalidados no mesmo contrato antes da escrita;
- `plans.capacityPrescriptions.manage` não amplia o acesso às fontes: avaliações e antropometria exigem também `students.details.assessments`, preferências exigem `students.details.profile`, e cada origem do PRNT exige seu bloco específico;
- a descoberta inicial de fontes do PRNT também respeita os blocos específicos; o bloco de resumo nunca autoriza sozinho dores, medicações, acompanhamentos, desconfortos, histórico de atividade ou objetivos;
- uma fonte negada é rejeitada antes da reconstrução de metadados e da persistência da versão;
- as consultas de capacidade atual e histórico revalidam as permissões específicas vigentes; fontes negadas, seus alertas derivados e vínculos de objetivos não são devolvidos mesmo quando existem em versões antigas;
- a leitura de classificações de objetivos exige simultaneamente `plans.capacityPrescriptions.view` e `physicalAssessment.prnt.goals`;
- a alteração de classificações de objetivos exige simultaneamente `plans.capacityPrescriptions.manage` e `physicalAssessment.prnt.goals`;
- revogar um bloco de avaliação, perfil ou PRNT interrompe também a exposição dos respectivos snapshots pela prescrição, sem apagar o histórico persistido;
- uma negação de outro tenant usa resposta genérica equivalente a recurso inexistente;
- toda alteração cria versão nova; não existe sobrescrita silenciosa do histórico.

## Critérios de aceite para mudanças de acesso

- Catálogo compartilhado atualizado.
- Defaults por perfil revisados.
- Backend bloqueia acesso indevido.
- Frontend oculta menu, tela, aba ou ação sem permissão.
- Testes cobrem pelo menos um caso permitido e um negado.
- `pnpm access:check` passa.
