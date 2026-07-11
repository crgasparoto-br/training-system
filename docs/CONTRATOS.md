# Módulo de contratos

O módulo permite cadastrar modelos de contrato com cabeçalho, rodapé, cláusulas HTML ordenadas e variáveis Handlebars no formato `{{aluno.nome}}`.

## Fluxo básico

1. Acesse `Configurações > Contratos`.
2. Crie ou edite um modelo, mantendo o status `ACTIVE` para permitir geração.
3. Use a aba **Financeiro** da edição do aluno ou `Contratos do aluno` em `/alunos/:id/contracts` para selecionar o modelo aplicável.
4. Antes de salvar ou gerar, use **Abrir prévia** para conferir o documento preenchido.
5. O backend salva `renderedHtml` e `dataSnapshot` somente quando o contrato real é gerado, preservando a versão utilizada.
6. Gere o PDF e envie para assinatura interna.
7. O link público `/assinatura/contrato/:token` permite ao aluno aceitar e assinar ou recusar o documento.

## Organização da aba Financeiro

A leitura operacional segue a ordem natural do processo comercial:

1. **Oferta e vínculo comercial**: Serviço Vigente, Condição Especial e Plano de agenda do aluno.
2. **Cobrança**: valores, desconto, vigência, vencimento, dia de pagamento e professor responsável.
3. **Contrato do aluno**: seleção, contrato vigente, candidato à substituição, envio, status de aprovação e prévia.
4. **Origem e observações**: indicação e contexto administrativo.

As informações de contrato são apresentadas somente depois que serviço, agenda e cobrança estiverem visíveis. O seletor original permanece conectado ao formulário, mas sua apresentação é concentrada no bloco **Contrato do aluno** para evitar duplicidade.

## Contrato vigente e substituição

O bloco **Contrato do aluno** separa claramente:

- **Contrato vigente**: vínculo atualmente válido para o aluno;
- **Novo contrato em substituição**: documento em negociação, geração, envio, assinatura ou espera pela data de início.

O cartão do contrato vigente apresenta título, situação, data de assinatura, início e término da vigência. A ação **Consultar contrato vigente** abre o documento persistido em modo somente leitura.

Quando outro documento é selecionado, a ação **Confirmar preparação da substituição** autoriza o cadastro do candidato, mas não encerra o vínculo atual.

Regras:

1. O contrato atual permanece vigente enquanto o candidato estiver em rascunho, gerado, enviado, visualizado ou aguardando assinatura.
2. Recusa, expiração ou cancelamento do candidato não alteram o contrato vigente.
3. O salvamento apenas cria ou atualiza o vínculo candidato.
4. O contrato vigente só é encerrado quando o novo documento estiver assinado e atingir a data efetiva de início.
5. A confirmação é vinculada ao contrato selecionado; mudar a seleção exige nova confirmação.
6. O envio do candidato fica bloqueado enquanto a preparação da substituição não estiver confirmada.

## Controle de datas de vigência

A data efetiva do novo contrato é a maior entre:

- a data/hora da assinatura eletrônica;
- a **Data de Início do Contrato** informada na aba Financeiro.

Consequências:

- uma data anterior à assinatura não produz vigência retroativa;
- sem data futura, o novo contrato entra em vigor na assinatura;
- com data futura, o documento fica assinado e o vínculo permanece em `pending_signature` até o início planejado;
- um agendador verifica contratos assinados aguardando início a cada 15 minutos por padrão;
- na data efetiva, o vínculo anterior passa para `terminated`, recebe `endDate` igual à entrada em vigor do novo, e o novo vínculo passa para `active` na mesma transação;
- `Aluno.currentStudentContractId` é atualizado na mesma transação, evitando período sem contrato ou dois vigentes simultaneamente.

O agendador pode ser desativado com `CONTRACT_LIFECYCLE_SCHEDULER_ENABLED=false`. O intervalo pode ser ajustado por `CONTRACT_LIFECYCLE_SCHEDULER_INTERVAL_MINUTES`.

## Prévia na aba Financeiro

Na edição de um aluno, a aba **Financeiro** oferece a ação **Abrir prévia** depois que um contrato é selecionado.

- Quando a seleção representa um modelo `ACTIVE`, a tela chama `POST /api/v1/contracts/preview` com o aluno e os valores financeiros atualmente preenchidos.
- Quando a seleção representa um contrato já gerado, a tela abre o `renderedHtml` persistido por `GET /api/v1/contracts/documents/:contractDocumentId`.
- A prévia é somente leitura e não cria contrato, vínculo, PDF, token público ou assinatura.
- Fechar a prévia não altera os dados do formulário.
- A assinatura ou recusa não é disponibilizada dentro do modal administrativo; essas ações continuam restritas ao link público criado pelo envio do contrato.

## Envio para assinatura na aba Financeiro

O bloco **Contrato do aluno** apresenta a ação **Enviar para assinatura** somente quando a seleção representa um documento já gerado e elegível.

1. A tela chama `POST /api/v1/contracts/documents/:contractDocumentId/send`.
2. O backend altera o documento para `SENT`, cria um token aleatório e armazena somente o hash desse token.
3. O token expira em 30 dias.
4. A tela monta `/assinatura/contrato/:token`, tenta copiar o endereço e mantém o link visível durante a sessão atual.
5. O usuário compartilha manualmente o link com o aluno por WhatsApp, e-mail ou outro canal.

O sistema não dispara mensagem automaticamente. A ação “enviar” significa preparar o documento e gerar o endereço seguro de assinatura.

- Um modelo `ACTIVE` ainda não gerado não pode ser enviado; primeiro é necessário salvar o cadastro para gerar o documento.
- `SIGNED`, `REJECTED`, `CANCELLED` e `EXPIRED` não apresentam envio disponível na interface.
- Para `SENT` ou `VIEWED`, a ação passa a ser **Gerar novo link**. A tela solicita confirmação porque o novo token substitui e invalida o endereço anterior.
- Como o banco armazena somente o hash, um link antigo não pode ser recuperado depois. Caso ele tenha sido perdido, deve-se gerar um novo link.

## Aceite e recusa no link público

O aluno possui duas ações mutuamente exclusivas no endereço público:

### Aceitar e assinar

1. O aluno informa nome completo, CPF e e-mail opcional.
2. Confirma **Aceitar e assinar**.
3. O sistema registra nome, CPF normalizado, e-mail, IP, User Agent, data/hora e hash do documento.
4. O documento passa para `SIGNED`.
5. Se a data efetiva já chegou, o candidato entra em vigor e o contrato anterior é encerrado na mesma transação.
6. Se a data efetiva for futura, o contrato anterior continua vigente e o candidato assinado aguarda o agendador.

### Não aceitar contrato

1. O aluno seleciona **Não aceitar contrato**.
2. Pode informar um motivo opcional de até 1.000 caracteres.
3. Confirma que deseja recusar o documento.
4. `POST /api/v1/contracts/public/:token/reject` invalida imediatamente o token público.
5. A auditoria registra a recusa, data/hora, motivo, IP e User Agent.
6. O vínculo candidato é encerrado com a justificativa **Recusado pelo aluno**.
7. A apresentação administrativa passa a usar o status derivado `REJECTED`.
8. Qualquer contrato vigente anterior permanece inalterado.

A recusa não é tratada como cancelamento administrativo. O documento não pode mais ser assinado nem reenviado. Após revisar valores, vigência ou cláusulas, a equipe deve gerar um novo contrato.

O status `REJECTED` é derivado do registro de auditoria `STUDENT_REJECTION`. Dessa forma, a recusa é distinguida de `CANCELLED` sem alterar contratos históricos ou exigir conversão do enum existente no banco.

## Status e aprovação na aba Financeiro

O seletor **Contrato** é a origem funcional da escolha. O antigo campo textual de contrato permanece apenas nos dados do formulário para compatibilidade com cadastros anteriores e não é apresentado como um segundo campo editável.

A tela exibe **Status do contrato** com o estado do documento eletrônico:

- modelo `ACTIVE` selecionado: ainda não gerado e não enviado;
- `GENERATED`: documento gerado, aguardando envio;
- `SENT`: enviado, aguardando assinatura;
- `VIEWED`: aberto pelo aluno, mas ainda não assinado;
- `SIGNED`: aprovado e assinado pelo aluno;
- `REJECTED`: recusado pelo aluno, com data e motivo quando informados;
- `CANCELLED`: cancelado administrativamente;
- `EXPIRED`: prazo encerrado sem assinatura.

O status eletrônico e a vigência são conceitos distintos. Um documento `SIGNED` pode estar aguardando uma data futura para se tornar o contrato vigente.

Somente `SIGNED` confirma **Aluno aprovou: Sim**. Quando o aluno recusa, o painel apresenta **Aluno aprovou: Não — recusado**. Um vínculo financeiro ativo, o texto legado, o envio ou a visualização do documento não comprovam aceite.

## Assinatura eletrônica interna

O fluxo interno de assinatura funciona da seguinte forma:

1. Um modelo `ACTIVE` é usado para gerar o contrato real por `POST /api/v1/contracts/generate`.
2. A geração grava o HTML renderizado, o snapshot dos dados, a versão do modelo e o hash do documento, além de criar o vínculo contratual do aluno em estado de rascunho.
3. `POST /api/v1/contracts/documents/:contractDocumentId/send` muda o documento para `SENT`, cria um token público aleatório armazenado somente como hash e define validade de 30 dias.
4. O usuário compartilha o endereço `/assinatura/contrato/:token` com o contratante.
5. Ao abrir o link, o contrato pode passar para `VIEWED` e o evento é registrado na auditoria.
6. O contratante escolhe entre aceitar e assinar ou recusar o documento.
7. A assinatura registra o documento como `SIGNED` e resolve a entrada em vigor conforme assinatura e data planejada.
8. A recusa invalida o token, encerra somente o candidato e passa a ser apresentada como `REJECTED`.

Links expirados passam para `EXPIRED`. Contratos cancelados, expirados ou recusados não podem ser assinados. Contratos já assinados não podem ser reenviados, editados ou cancelados pela rotina comum; qualquer alteração deve gerar novo contrato ou aditivo.

## Modelo ACESSO de treinamento físico personalizado

A tela `Configurações > Contratos` oferece a ação **Usar modelo ACESSO**. A ação carrega no editor um rascunho baseado no instrumento particular institucional de treinamento físico personalizado, com:

- qualificação de contratado, professor responsável e contratante;
- sete cláusulas ordenadas sobre objeto, características do serviço, valores, rescisão, atrasos e reposições, férias e disposições gerais;
- rodapé com local, data, assinaturas das partes e testemunhas.

O modelo é carregado com status `DRAFT` e deve ser revisado antes de ser salvo e ativado. Se já existir um modelo com o mesmo nome, a tela seleciona o registro existente em vez de preparar uma nova cópia.

## Variáveis disponíveis

Consulte `GET /api/v1/contracts/variables`. Cada variável retorna:

- chave e token Handlebars;
- grupo e rótulo do grupo;
- nome amigável;
- descrição de uso;
- exemplo de preenchimento.

Na tela de modelos, as variáveis aparecem em grupos expansíveis: **Aluno**, **Responsável**, **Empresa**, **Professor**, **Serviços** e **Contrato**. Ao passar o mouse ou focar uma variável, a interface apresenta sua descrição e um exemplo. O clique continua copiando o token para a área de transferência. Os seletores dos editores usam os mesmos grupos.

Quando a geração não informa explicitamente um professor, o contexto utiliza o professor responsável vinculado ao aluno.

### Variáveis de serviço

Além de `{{servico.nome}}` e `{{servico.valor}}`, o contexto pode utilizar dados do catálogo comercial:

- `{{servico.codigo}}`;
- `{{servico.categoria}}`;
- `{{servico.resumo}}`;
- `{{servico.oQueE}}`;
- `{{servico.publicoAlvo}}`;
- `{{servico.itensInclusos}}`;
- `{{servico.quantidadeItensInclusos}}`;
- `{{servico.plano.componentes}}`.

Os itens inclusos consideram somente registros ativos de “O que o compõe?”. Os componentes do plano consideram somente relações ativas com serviços ou opções comerciais também ativos.

As variáveis `{{servico.duracaoSessao}}` e `{{servico.quantidadeSemanal}}` permanecem disponíveis por compatibilidade, mas continuam vazias enquanto duração e opção comercial não forem selecionadas de forma estruturada. O módulo não escolhe automaticamente uma opção comercial quando um serviço possui várias combinações.

Se a migration do catálogo comercial ainda não estiver aplicada, o contexto mantém compatibilidade com os dados legados de nome, código, descrição e valor, deixando vazias somente as informações estruturadas indisponíveis.

## Segurança e auditoria

Contratos assinados não são editados. Recusas, assinaturas e mudanças de vigência são registradas em `ContractAuditLog`. A troca de contrato vigente e a atualização de `currentStudentContractId` são transacionais. Tokens públicos são removidos após assinatura ou recusa.

## Provedores externos

O model `Contract` já possui `externalProvider` e `externalEnvelopeId` para futura integração com Clicksign, ZapSign, Autentique ou DocuSign.
