# Plano concluído: separar consulta e edição de colaboradores

## Objetivo entregue

A issue #264 foi implementada com separação entre consulta, visualização individual, edição e cadastro de colaboradores, preservando dados, permissões, ações administrativas e o contrato legado.

## Escopo concluído

- [x] Listagem dedicada em `/consultas/colaboradores`, sem formulário embutido.
- [x] Detalhe somente leitura em `/consultas/colaboradores/:id`.
- [x] Edição dedicada em `/consultas/colaboradores/:id/edit`.
- [x] Cadastro preservado em `/professores/new`.
- [x] Leitura individual protegida no backend por autenticação, `contractId`, permissão de tela e `dataScope`.
- [x] Resposta `404` uniforme para registro inexistente ou inacessível.
- [x] Escopo de escrita por registro aplicado a botões e à rota de edição.
- [x] Blocos `collaborators.registration.collaborator` e `collaborators.registration.manager` preservados.
- [x] Schema, mapeamentos, máscaras, formatação monetária e componentes compartilhados.
- [x] CEP, foto, perfil profissional, dados jurídicos/financeiros, remuneração, função, gestor, funções operacionais e contrato legado preservados.
- [x] Confirmação para alterações não salvas em cancelamento, links, retorno e recarga.
- [x] Confirmações administrativas de redefinição de senha e desativação preservadas.
- [x] Componente monolítico `Professores.tsx` removido após troca dos consumidores.
- [x] Documentação do fluxo e da autorização adicionada.

## Auditoria e correções

A auditoria independente identificou e corrigiu antes da aprovação:

- escopo de escrita aplicado apenas no backend, mas não inicialmente nos botões da interface;
- blocos de acesso do cadastro ainda não transportados para a nova estrutura;
- máscaras, busca de CEP, validação de senha e formatação monetária que precisavam ser preservadas;
- cobertura insuficiente para edição direta, salvamento, cancelamento, perfil somente leitura e acesso negado;
- necessidade de resposta uniforme para id inexistente e registro fora do escopo;
- confirmação administrativa ausente na redefinição de senha e desativação.

## Higienização

- O arquivo monolítico com cadastro, consulta e edição foi substituído por páginas de responsabilidade única.
- Regras de acesso, formatadores, modelo do formulário, seções visuais e dirty guard foram isolados em módulos compartilhados.
- Não houve alteração de banco de dados nem introdução de uma entidade paralela de colaborador.
- O contrato legado permanece isolado para futura substituição pela issue #263.

## Testes adicionados

- endpoint individual com escopo, tenant, 404 uniforme e acesso negado;
- mapeamentos de criação, edição e autoatendimento;
- máscaras e valores monetários;
- escopo de escrita `self`, `managed` e `contract`;
- listagem somente leitura e visibilidade de ações;
- detalhe individual sem controles editáveis;
- edição direta, salvamento, cancelamento e descarte recusado;
- proteção contra recarga e navegação com alterações não salvas.

## Validação

Workflow `Validate PR`, execução `1897`, concluído com sucesso em 20 de julho de 2026:

- [x] Type check
- [x] Lint
- [x] Testes
- [x] Architecture checks
- [x] Access catalog checks
- [x] Documentation checks

## Entrega

- Branch: `feat/264-collaborator-dedicated-pages`
- Pull request: #266 contra `develop`
- A PR contém `Closes #264` e não foi mergeada.
