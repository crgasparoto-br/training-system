# Páginas dedicadas de colaboradores

A issue #264 separa a gestão de colaboradores em três responsabilidades de interface:

- `/consultas/colaboradores`: pesquisa e filtros, sem formulário de edição embutido;
- `/consultas/colaboradores/:id`: visão individual somente leitura;
- `/consultas/colaboradores/:id/edit`: edição individual;
- `/professores/new`: cadastro de novo colaborador.

## Autorização

A consulta individual usa `GET /professores/:id` e aplica, no backend:

1. autenticação;
2. permissão de tela para consulta ou cadastro de colaboradores;
3. `contractId` do usuário autenticado;
4. `dataScope` efetivo (`self`, `managed` ou `contract`).

Um identificador inexistente e um identificador que pertença a outro contrato ou esteja fora do escopo retornam a mesma resposta `404`, sem expor a existência do registro.

A tela de consulta não renderiza campos editáveis. O botão e a rota de edição dependem de `collaborators.registration`. Ações administrativas adicionais continuam protegidas por seus `blockKey` e exigem escopo de contrato.

## Comportamento do formulário

Cadastro e edição reutilizam o mesmo schema, mapeamentos e seções visuais. O formulário preserva:

- dados pessoais, contato e endereço;
- consulta de CEP e preenchimento de endereço;
- foto do colaborador;
- perfil profissional, função principal, gestor e funções operacionais;
- dados jurídicos, bancários e sua validação;
- valores por tipo de atuação;
- contrato assinado legado e upload do PDF.

Ao salvar uma edição, a navegação retorna ao detalhe do mesmo colaborador com confirmação de sucesso. Cancelar retorna ao detalhe sem persistir. Alterações não salvas acionam confirmação em cancelamento, links internos, retorno do navegador e recarga da página.

## Compatibilidade e evolução

O bloco de contrato existente permanece disponível nesta entrega. A evolução para ciclo contratual completo pertence à issue #263 e deve substituir esse bloco sem recriar a separação entre consulta e edição.

## Validação

Os testes automatizados cobrem:

- mapeamento de criação, edição e autoatendimento;
- valores monetários nos formatos aceitos;
- avatares legados com caminho relativo;
- obrigatoriedade do PDF quando o contrato é marcado como assinado;
- consulta somente leitura para perfil sem edição;
- resposta uniforme para registro inexistente ou inacessível;
- proteção de alterações não salvas;
- escopo de contrato e `dataScope` no endpoint individual.
