# Módulo de contratos

O módulo permite cadastrar modelos de contrato com cabeçalho, rodapé, cláusulas HTML ordenadas e variáveis Handlebars no formato `{{aluno.nome}}`.

## Fluxo básico

1. Acesse `Configurações > Contratos`.
2. Crie ou edite um modelo, mantendo o status `ACTIVE` para permitir geração.
3. Use `Contratos do aluno` em `/alunos/:id/contracts` para gerar o contrato a partir de um modelo ativo.
4. O backend salva `renderedHtml` e `dataSnapshot`, preservando a versão gerada.
5. Gere o PDF e envie para assinatura interna.
6. O link público `/assinatura/contrato/:token` registra aceite, nome, CPF, IP, User Agent, data/hora e hash SHA-256 do documento.

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
