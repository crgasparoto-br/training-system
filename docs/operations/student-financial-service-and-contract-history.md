# Serviço vigente e histórico contratual do aluno

## Serviço vigente na edição

Na rota `/alunos/:id/edit`, a aba **Financeiro** preserva o serviço vigente usando a seguinte prioridade:

1. serviço associado ao contrato ativo do aluno;
2. valor persistido em `intakeForm.formResponses.financial.currentService`.

Quando o serviço vigente não está mais entre as ofertas comerciais ativas, ele continua visível no seletor com a indicação **vínculo atual**. Essa apresentação existe somente para preservar o cadastro do aluno editado e não reativa a oferta no catálogo nem a disponibiliza para novos vínculos.

Quando não existe nenhuma oferta financeira ativa, a edição ainda apresenta um seletor de preservação contendo somente **Sem serviço vigente** e o vínculo atual legado. O valor mostrado nesse controle é incluído no payload do cadastro mesmo que o formulário legado não tenha renderizado seu seletor original.

A restauração ocorre após os carregamentos assíncronos do aluno, dos vínculos e das opções do seletor. Depois que o usuário altera manualmente o serviço, a sincronização automática deixa de sobrescrever o campo durante a sessão atual. Salvar outras informações do aluno não remove o serviço resolvido automaticamente.

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

Contratos gerados a partir de modelo ativo recebem uma atualização de confirmação do `endDate` imediatamente depois da geração. Após criar, atualizar ou ativar o vínculo, a tela recarrega documentos e vínculos automaticamente; respostas antigas de carregamentos concorrentes são descartadas.

Quando já existe uma data final, a ação **Remover vencimento** fica disponível abaixo do campo. Ao usá-la, a interface limpa o vencimento e o salvamento envia `endDate: null`. Alterar ou limpar os campos de duração recalcula ou remove a data de forma equivalente.

Datas de início e término são tratadas como **datas civis**, e não como instantes UTC. Um término em `14/07` permanece vigente durante todo o dia 14 no horário local e passa a vencido somente no dia seguinte. As datas retornadas pela API são normalizadas para evitar exibição do dia anterior em fusos negativos, como o Brasil.

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

Esse acesso não modifica as regras de ativação ou substituição. O contrato vigente continua sendo encerrado somente quando o substituto estiver assinado e atingir sua data efetiva de início.
