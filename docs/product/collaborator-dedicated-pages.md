# Páginas dedicadas de colaboradores

A issue #264 separa a gestão de colaboradores em três responsabilidades de interface:

- `/consultas/colaboradores`: pesquisa e filtros, sem formulário de edição embutido;
- `/consultas/colaboradores/:id`: visão individual estritamente somente leitura;
- `/consultas/colaboradores/:id/edit`: edição individual e ações administrativas autorizadas;
- `/professores/new`: cadastro de novo colaborador.

## Autorização

A consulta individual usa `GET /professores/:id` e aplica, no backend:

1. autenticação;
2. permissão de tela para consulta ou cadastro de colaboradores;
3. `contractId` do usuário autenticado;
4. `dataScope` efetivo (`self`, `managed` ou `contract`).

A atualização passa por uma pré-validação equivalente antes do `PUT /professores/:id`. Um identificador inexistente, de outro contrato ou fora do escopo retorna `404` tanto na consulta quanto na edição, sem expor a existência do registro. A consulta é feita diretamente pelo identificador combinado ao filtro de acesso, sem carregar a lista inteira de colaboradores.

A tela de consulta não renderiza campos editáveis nem ações que alterem estado. O botão e a rota de edição dependem de `collaborators.registration`. Validação financeira, redefinição de senha, ativação e desativação ficam exclusivamente na rota de edição e continuam protegidas por seus `blockKey` e pelo escopo de contrato.

## Comportamento do formulário

Cadastro e edição reutilizam o mesmo schema, mapeamentos e seções visuais. O formulário preserva:

- dados pessoais, contato e endereço;
- consulta de CEP e preenchimento de endereço;
- foto do colaborador;
- perfil profissional, função principal, gestor e funções operacionais;
- dados jurídicos, banco pesquisável por código ou nome com navegação por teclado e validação financeira;
- valores por tipo de atuação, validação monetária e classificação pelas faixas configuradas;
- contrato assinado legado e upload do PDF.

Valores de remuneração negativos ou em formato inválido são rejeitados antes do envio. Quando o próprio colaborador altera seus dados, o usuário autenticado é recarregado para refletir imediatamente nome e foto no cabeçalho.

Ao salvar uma edição, a navegação retorna ao detalhe do mesmo colaborador com confirmação de sucesso. Cancelar retorna ao detalhe sem persistir. Alterações não salvas acionam confirmação em cancelamento, links internos, retorno do navegador, recarga da página e antes de executar uma ação administrativa que precise recarregar o cadastro.

## Compatibilidade e evolução

O bloco de contrato existente permanece disponível nesta entrega. A evolução para ciclo contratual completo pertence à issue #263 e deve substituir esse bloco sem recriar a separação entre consulta e edição.

## Validação

Os testes automatizados cobrem:

- mapeamento de criação, edição e autoatendimento;
- valores monetários aceitos, inválidos e negativos;
- classificação de remuneração pelas faixas configuradas;
- busca de bancos por nome, seleção pelo teclado e retorno do código selecionado;
- formulário real com CEP, foto, remuneração e contrato legado;
- avatares legados com caminho relativo;
- obrigatoriedade do PDF quando o contrato é marcado como assinado;
- consulta estritamente somente leitura, inclusive para perfil com escopo de contrato e blocos administrativos habilitados;
- ações administrativas disponíveis apenas na edição;
- resposta `404` uniforme em leitura e atualização para registro inexistente ou inacessível;
- atualização do usuário autenticado após autoedição;
- proteção de alterações não salvas em links, histórico, recarga e ações administrativas;
- escopo de contrato e `dataScope` no endpoint individual.

## Auditoria

A entrega deve ser considerada concluída somente após os testes, verificações de tipos, lint, arquitetura, catálogo de acesso e documentação passarem no commit final da pull request.
