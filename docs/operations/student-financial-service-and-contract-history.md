# Serviço vigente e histórico contratual do aluno

## Serviço vigente na edição

Na rota `/alunos/:id/edit`, a aba **Financeiro** preserva o serviço vigente usando a seguinte prioridade:

1. serviço associado ao contrato ativo do aluno;
2. valor persistido em `intakeForm.formResponses.financial.currentService`.

Quando o serviço vigente não está mais entre as ofertas comerciais ativas, ele continua visível no seletor com a indicação **vínculo atual**. Essa apresentação existe somente para preservar o cadastro do aluno editado e não reativa a oferta no catálogo nem a disponibiliza para novos vínculos.

Quando não existe nenhuma oferta financeira ativa, a edição ainda apresenta um seletor de preservação contendo somente **Sem serviço vigente** e o vínculo atual legado. O valor mostrado nesse controle é incluído no payload do cadastro mesmo que o formulário legado não tenha renderizado seu seletor original.

A restauração ocorre após os carregamentos assíncronos do aluno, dos vínculos e das opções do seletor. Depois que o usuário altera manualmente o serviço, a sincronização automática deixa de sobrescrever o campo durante a sessão atual. Salvar outras informações do aluno não remove o serviço resolvido automaticamente.

Uma resposta parcial não é interpretada como ausência de serviço. O sistema somente aplica um valor vazio automaticamente quando as fontes do perfil e do contrato ativo foram carregadas com sucesso. Se uma consulta falhar, o adaptador preserva o valor que já integra o payload do formulário em vez de substituí-lo por vazio.

A sincronização visual do campo é centralizada em um único componente. Isso evita que uma rotina antiga restaure o vínculo anterior enquanto outra rotina aplica a escolha atual. O acompanhamento das alterações permanece ativo mesmo quando o aluno começa sem serviço vigente, permitindo selecionar uma oferta ou contrato e persistir o novo valor corretamente.

Ao selecionar outro contrato, o serviço financeiro do próprio contrato passa a ser a nova referência da sessão e não é substituído pelo vínculo anterior. O nome é obtido também para contratos ligados a ofertas inativas; antes de selecionar o valor, a tela adiciona uma opção de preservação ao controle real. Isso impede que o navegador converta a escolha em valor vazio apenas porque a oferta não pertence mais ao catálogo ativo.

Quando a aba Financeiro é desmontada e aberta novamente, o seletor legado é reconstruído inclusive quando o usuário escolheu **Sem serviço vigente**, preservando a alteração manual.

Quando o aluno já possui contrato ativo, a confirmação da substituição pertence ao componente que bloqueia o envio do formulário. No navegador, a escolha de outro contrato abre a confirmação antes de o formulário aplicar a troca. Se o usuário cancelar, o seletor volta ao contrato vigente e o evento original não prossegue. Se aceitar, a confirmação fica vinculada ao contrato selecionado e o salvamento não apresenta uma segunda caixa de confirmação.

A implementação não procura, identifica ou aciona botões por texto ou posição no DOM. O painel visível e o bloqueio de submissão compartilham o mesmo estado controlado.

## Autoridade, escopo e transação no backend

`intakeForm.formResponses.financial.currentService` é uma representação desnormalizada para leitura e exibição. Na operação composta de cadastro ou edição, o cliente pode atualizar os demais campos financeiros, mas não é o escritor autoritativo do serviço vigente.

A fonte de verdade do vínculo é:

1. `GeneratedContract.serviceId`, quando o documento possui serviço próprio;
2. `Aluno.serviceId` persistido, somente quando o documento não possui serviço próprio.

O fallback do aluno não é materializado como serviço próprio do documento. Assim, `GeneratedContract.serviceId` permanece nulo quando o modelo não define serviço, enquanto `StudentContract.serviceId` recebe o serviço efetivo do aluno e continua acompanhando alterações posteriores de `Aluno.serviceId`.

Gatilhos PostgreSQL impedem que inserções ou atualizações gravem um serviço diferente daquele associado ao documento ou ao fallback persistido. Quando o vínculo efetivo muda, o gatilho sincroniza o nome do serviço em `financial.currentService`, preservando os demais campos do JSON financeiro.

A geração por `/contracts/generate` passa pelo serviço autoritativo e exige `students.actions.manageFinancialContract`. O `serviceId` do payload é ignorado. A prévia em `/contracts/preview` usa a mesma resolução autoritativa e pode ser acessada por quem possui `students.actions.manageFinancialContract` ou `settings.contract`.

Além da permissão funcional e do isolamento por contrato empresarial, prévia e geração aplicam o escopo do professor autenticado:

- professor comum acessa somente alunos sob sua responsabilidade;
- professor master pode acessar qualquer aluno do mesmo contrato empresarial;
- professor comum não pode atribuir arbitrariamente outro professor ao documento.

Essa validação ocorre dentro do serviço de domínio antes da renderização do contexto ou da persistência. Portanto, conhecer o identificador de outro aluno do mesmo contrato empresarial não permite obter seus dados pelo HTML ou pelo contexto da prévia.

O caminho `POST /alunos/:id/contracts` com referência `template:<id>` reutiliza a mesma geração autoritativa. Documento, vínculo, auditoria, `startDate`, `endDate` e eventual decisão de ciclo são executados na transação recebida. Falha na criação do vínculo ou da auditoria desfaz também o documento. Para referências de modelo, somente os estados `draft` e `active` são aceitos; estados incompatíveis são rejeitados com erro de validação em vez de serem convertidos silenciosamente para rascunho.

A migration `20260714203000_enforce_student_contract_service_authority` corrige vínculos legados divergentes e atualiza o formulário financeiro do contrato ativo apontado pelo aluno. A migration `20260715213000_recompute_terminal_current_service` recalcula o serviço quando vínculos são inseridos, atualizados ou removidos, inclusive nas transições para cancelado, expirado ou encerrado. Sem vínculo ativo, o vínculo em preparação mais recente é usado; sem vínculo efetivo ou preparado, o valor é limpo.

Quando existe contrato selecionado, perfil, formulário, vínculo e ciclo contratual são persistidos em uma única transação Prisma. Se o contrato não existir, pertencer a outro aluno/contrato empresarial ou falhar durante a mutação, nenhuma atualização parcial do perfil é confirmada.

O ciclo aplicado dentro da transação respeita o estado documental:

- documento ainda não assinado: vínculo em preparação ou aguardando assinatura, sem encerrar o vigente;
- documento assinado com início futuro: vínculo agendado, mantendo o vigente até a data efetiva;
- documento assinado e efetivo: encerramento do vínculo anterior, ativação do substituto e atualização do ponteiro atual na mesma transação.

A mesma função transacional é usada pelo salvamento administrativo, pela rota pública real de assinatura e pelo agendador. A rota pública retorna o resultado de ativação ou agendamento esperado pelo frontend, consome o token uma única vez e preserva `StudentContract.startDate` e `StudentContract.endDate` durante preparação, assinatura, agendamento e ativação.

A consulta pública altera o documento de `SENT` para `VIEWED` somente quando o token e o estado atuais ainda correspondem à leitura. A expiração também reivindica condicionalmente o token, limpa o token e sua validade e atualiza somente vínculos ainda em `draft` ou `pending_signature`. Vínculos já cancelados ou encerrados não são reclassificados como expirados.

Ao cancelar um vínculo cujo documento ainda não foi assinado, vínculo e documento são cancelados na mesma transação e o token público é removido. Um endereço anteriormente emitido deixa de abrir o documento e não pode ser usado para assinar depois do cancelamento.

## Estado e vigência no campo Contrato

As opções do campo **Contrato** mantêm o estado do documento e acrescentam a vigência contratual quando o documento pertence ao aluno e está assinado.

Exemplos:

- `Contrato anual • Assinado • Vigência: Vigente`;
- `Contrato anual • Assinado • Vigência: Vencido`;
- `Contrato anual • Assinado • Vigência: Sem vigência definida`.

Modelos ainda não vinculados e documentos que não estão assinados permanecem apenas com seu estado documental. A vigência é atualizada quando as opções do campo ou os vínculos do aluno são carregados, sem mudar o valor selecionado.

A data final é calculada diretamente a partir de **Data de início**, **Unidade da duração** e **Quantidade** no momento do salvamento. O cálculo não depende do campo visual desabilitado de vencimento. O mesmo valor é gravado em:

- `StudentContract.endDate` no vínculo contratual;
- `intakeForm.formResponses.financial.contractDueDate` para manter o formulário financeiro consistente.

A rota de cadastro `/alunos/new` instala os adaptadores antes da criação do aluno. Assim, o perfil e o vínculo criado logo após o cadastro recebem a mesma data final. Se **Remover vencimento** tiver sido usado, ambos persistem o vencimento vazio e o vínculo recebe `endDate: null`.

Contratos gerados a partir de modelo ativo persistem o `endDate` já na transação de geração. Após criar, atualizar ou ativar o vínculo, a tela recarrega documentos e vínculos automaticamente; respostas antigas de carregamentos concorrentes são descartadas.

Quando já existe uma data final, a ação **Remover vencimento** fica disponível abaixo do campo. Ao usá-la, a interface limpa o vencimento e o salvamento envia `endDate: null`. Alterar ou limpar os campos de duração recalcula ou remove a data de forma equivalente.

Datas de início e término são tratadas como **datas civis**, e não como instantes UTC. Um término em `14/07` permanece vigente durante todo o dia 14 no horário local e passa a vencido somente no dia seguinte. As datas retornadas pela API são normalizadas para evitar exibição do dia anterior em fusos negativos, como o Brasil.

Os testes automatizados reproduzem os controles reais de início e duração, o campo visual desabilitado, a remoção intencional no cadastro e na edição, a persistência no perfil e no vínculo, a prioridade do serviço financeiro do contrato, a confirmação única, a reconstrução do seletor sem ofertas ativas, o serviço inativo ausente das opções e falhas de consulta ou carregamento parcial. A API cobre autorização funcional e escopo por aluno na prévia e geração, assinatura pública pela política transacional, geração autoritativa por endpoint direto e por referência de modelo, persistência de `endDate`, rejeição explícita de estados incompatíveis e invalidação do token no cancelamento. A suíte PostgreSQL valida rollback integral, propagação do fallback, concorrência entre consulta, expiração e assinatura, preservação de estados terminais, gatilhos de autoridade, reparo e recálculo.

## Histórico de contratos

O bloco contratual da aba **Financeiro** apresenta a ação **Visualizar contratos**. A ação abre um modal sobre a própria edição do aluno, sem navegar para outra tela e sem perder os dados ainda não salvos do formulário.

O modal separa duas informações que não devem ser confundidas:

- **Estado do documento:** rascunho, gerado, enviado, visualizado, assinado, recusado, cancelado ou expirado;
- **Vigência contratual:** vigente, vencido, vigência futura, aguardando vigência, encerrado ou sem vigência definida.

Um documento pode continuar com o estado **Assinado** e, ao mesmo tempo, apresentar a vigência **Vencido** quando a data final já passou ou o vínculo do aluno está marcado como expirado. O termo **Vigente** é usado no lugar de “Válido”, pois descreve com maior precisão se o contrato produz efeitos na data atual.

A vigência é calculada a partir do vínculo contratual do aluno:

- vínculo ativo dentro do período: **Vigente**;
- data final anterior à data atual ou status expirado: **Vencido**;
- data inicial futura: **Vigência futura**;
- vínculo em preparação ou aguardando ativação: **Aguardando vigência**;
- vínculo cancelado ou encerrado: **Encerrado**;
- documento assinado sem vínculo de vigência correspondente: **Sem vigência definida**.

Cada item apresenta a ação **Consultar**, que abre o documento persistido em modo somente leitura dentro do mesmo modal. O usuário pode retornar à lista, fechar pelo botão, clicar fora da janela ou usar `Esc`.

O contrato vigente continua sendo encerrado somente quando o substituto estiver assinado e atingir sua data efetiva de início.

## Validação

A mudança deve passar pelo workflow **Validate PR**, incluindo migrations, type-check, lint, testes, arquitetura, catálogo de acessos e documentação. O número e o commit da execução validada são registrados na descrição da PR correspondente.