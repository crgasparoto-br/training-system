# Módulo de contratos

O módulo permite cadastrar modelos de contrato com cabeçalho, rodapé, cláusulas HTML ordenadas e variáveis Handlebars no formato `{{aluno.nome}}`.

## Fluxo básico

1. Acesse `Configurações > Contratos`.
2. Crie ou edite um modelo, mantendo o status `ACTIVE` para permitir geração.
3. Use a aba **Financeiro** da edição do aluno ou `Contratos do aluno` em `/alunos/:id/contracts` para selecionar o modelo aplicável.
4. Antes de salvar ou gerar, use **Abrir prévia** para conferir o documento preenchido.
5. O backend salva `renderedHtml` e `dataSnapshot` somente quando o contrato real é gerado, preservando a versão utilizada.
6. Gere o PDF e envie para assinatura interna.
7. O link público `/assinatura/contrato/:token` registra aceite, nome, CPF, IP, User Agent, data/hora e hash SHA-256 do documento.

## Organização da aba Financeiro

A leitura operacional segue a ordem natural do processo comercial:

1. **Oferta e vínculo comercial**: Serviço Vigente, Condição Especial e Plano de agenda do aluno.
2. **Cobrança**: valores, desconto, vigência, vencimento, dia de pagamento e professor responsável.
3. **Contrato do aluno**: seleção do documento, contrato ativo atual, alerta de substituição, status de aprovação/assinatura, prévia e envio.
4. **Origem e observações**: indicação e contexto administrativo.

As informações de contrato são apresentadas somente depois que serviço, agenda e cobrança estiverem visíveis. O seletor original permanece conectado ao formulário, mas sua apresentação é concentrada no bloco **Contrato do aluno** para evitar duplicidade.

## Prévia na aba Financeiro

Na edição de um aluno, a aba **Financeiro** oferece a ação **Abrir prévia** depois que um contrato é selecionado.

- Quando a seleção representa um modelo `ACTIVE`, a tela chama `POST /api/v1/contracts/preview` com o aluno e os valores financeiros atualmente preenchidos.
- Quando a seleção representa um contrato já gerado, a tela abre o `renderedHtml` persistido por `GET /api/v1/contracts/documents/:contractDocumentId`.
- A prévia é somente leitura e não cria contrato, vínculo, PDF, token público ou assinatura.
- Fechar a prévia não altera os dados do formulário.
- A assinatura não é disponibilizada dentro do modal administrativo; ela continua restrita ao link público criado pelo envio do contrato.

## Envio para assinatura na aba Financeiro

O bloco **Contrato do aluno** apresenta a ação **Enviar para assinatura** somente quando a seleção representa um documento já gerado e elegível.

1. A tela chama `POST /api/v1/contracts/documents/:contractDocumentId/send`.
2. O backend altera o documento para `SENT`, cria um token aleatório e armazena somente o hash desse token.
3. O token expira em 30 dias.
4. A tela monta `/assinatura/contrato/:token`, tenta copiar o endereço e mantém o link visível durante a sessão atual.
5. O usuário compartilha manualmente o link com o aluno por WhatsApp, e-mail ou outro canal.

O sistema não dispara mensagem automaticamente. A ação “enviar” significa preparar o documento e gerar o endereço seguro de assinatura.

- Um modelo `ACTIVE` ainda não gerado não pode ser enviado; primeiro é necessário salvar o cadastro para gerar o documento.
- `SIGNED`, `CANCELLED` e `EXPIRED` não apresentam envio disponível na interface.
- Para `SENT` ou `VIEWED`, a ação passa a ser **Gerar novo link**. A tela solicita confirmação porque o novo token substitui e invalida o endereço anterior.
- Como o banco armazena somente o hash, um link antigo não pode ser recuperado depois. Caso ele tenha sido perdido, deve-se gerar um novo link.

## Status e aprovação na aba Financeiro

O seletor **Contrato** é a origem funcional da escolha. O antigo campo textual de contrato permanece apenas nos dados do formulário para compatibilidade com cadastros anteriores e não é apresentado como um segundo campo editável.

No lugar dele, a tela exibe **Status do contrato**, com o estado real do documento eletrônico:

- modelo `ACTIVE` selecionado: ainda não gerado e não enviado;
- `GENERATED`: documento gerado, aguardando envio;
- `SENT`: enviado, aguardando assinatura;
- `VIEWED`: aberto pelo aluno, mas ainda não assinado;
- `SIGNED`: aprovado e assinado pelo aluno;
- `CANCELLED`: cancelado;
- `EXPIRED`: prazo encerrado sem assinatura.

Somente `SIGNED` confirma **Aluno aprovou: Sim**. Um vínculo financeiro ativo, o texto legado, o envio ou a visualização do documento não comprovam aceite. Quando disponível, a tela também apresenta a data e a hora da assinatura.

## Assinatura eletrônica interna

O fluxo interno de assinatura funciona da seguinte forma:

1. Um modelo `ACTIVE` é usado para gerar o contrato real por `POST /api/v1/contracts/generate`.
2. A geração grava o HTML renderizado, o snapshot dos dados, a versão do modelo e o hash do documento, além de criar o vínculo contratual do aluno em estado de rascunho.
3. `POST /api/v1/contracts/documents/:contractDocumentId/send` muda o documento para `SENT`, cria um token público aleatório armazenado somente como hash e define validade de 30 dias.
4. O usuário compartilha o endereço `/assinatura/contrato/:token` com o contratante.
5. Ao abrir o link, o contrato pode passar para `VIEWED` e o evento é registrado na auditoria.
6. O contratante informa nome completo, CPF e, opcionalmente, e-mail, e confirma **Aceitar e assinar**.
7. A assinatura registra nome, CPF normalizado, e-mail, IP, User Agent, data/hora e o hash do documento aceito.
8. O contrato passa para `SIGNED` e o vínculo financeiro do aluno passa para `active`.

Links expirados passam para `EXPIRED`. Contratos cancelados ou expirados não podem ser assinados. Contratos já assinados não podem ser reenviados, editados ou cancelados pela rotina comum; qualquer alteração deve gerar novo contrato ou aditivo.

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

Contratos assinados não são editados. Alterações posteriores devem gerar novo contrato ou aditivo. Eventos relevantes são registrados em `ContractAuditLog`.

## Provedores externos

O model `Contract` já possui `externalProvider` e `externalEnvelopeId` para futura integração com Clicksign, ZapSign, Autentique ou DocuSign.
