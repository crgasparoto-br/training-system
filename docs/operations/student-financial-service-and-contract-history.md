# Serviço vigente e histórico contratual do aluno

## Serviço vigente na edição

Na rota `/alunos/:id/edit`, a aba **Financeiro** preserva o serviço vigente usando a seguinte prioridade:

1. serviço associado ao contrato ativo do aluno;
2. valor persistido em `intakeForm.formResponses.financial.currentService`.

Quando o serviço vigente não está mais entre as ofertas comerciais ativas, ele continua visível no seletor com a indicação **vínculo atual**. Essa apresentação existe somente para preservar o cadastro do aluno editado e não reativa a oferta no catálogo nem a disponibiliza para novos vínculos.

A restauração ocorre após os carregamentos assíncronos do aluno, dos vínculos e das opções do seletor. Depois que o usuário altera manualmente o serviço, a sincronização automática deixa de sobrescrever o campo durante a sessão atual.

## Histórico de contratos

O bloco contratual da aba **Financeiro** apresenta a ação **Visualizar contratos**, que abre `/alunos/:id/contracts`.

A página permite consultar os documentos do aluno e seus estados:

- rascunho;
- gerado;
- enviado;
- visualizado;
- assinado;
- recusado;
- cancelado;
- expirado.

Esse acesso não modifica as regras de ativação ou substituição. O contrato vigente continua sendo encerrado somente quando o substituto estiver assinado e atingir sua data efetiva de início.
