# Serviço vigente e histórico contratual do aluno

## Serviço vigente na edição

Na rota `/alunos/:id/edit`, a aba **Financeiro** preserva o serviço vigente usando a seguinte prioridade:

1. serviço associado ao contrato ativo do aluno;
2. valor persistido em `intakeForm.formResponses.financial.currentService`.

Quando o serviço vigente não está mais entre as ofertas comerciais ativas, ele continua visível no seletor com a indicação **vínculo atual**. Essa apresentação existe somente para preservar o cadastro do aluno editado e não reativa a oferta no catálogo nem a disponibiliza para novos vínculos.

A restauração ocorre após os carregamentos assíncronos do aluno, dos vínculos e das opções do seletor. Depois que o usuário altera manualmente o serviço, a sincronização automática deixa de sobrescrever o campo durante a sessão atual.

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
