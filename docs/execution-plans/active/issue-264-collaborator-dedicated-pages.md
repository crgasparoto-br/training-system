# Plano: separar consulta e edição de colaboradores

## Objetivo

Separar a consulta, a visualização individual e a edição de colaboradores em rotas dedicadas, preservando os dados, permissões e ações administrativas existentes.

## Contexto

- Issue #264.
- A página `apps/web/src/pages/Professores.tsx` concentra cadastro, consulta e edição em um único componente.
- A API possui listagem e atualização com escopo por `contractId` e `dataScope`, mas não possui leitura individual dedicada.
- A alteração deve preparar a evolução do contrato do colaborador da issue #263 sem implementá-la.

## Fora de escopo

- Criar uma nova entidade de colaborador.
- Implementar o ciclo contratual previsto na issue #263.
- Alterar remuneração, disponibilidade, agenda ou modelo de permissões.
- Excluir colaboradores.

## Arquivos e módulos principais

- `apps/api/src/modules/professores/professor.routes.ts`
- `apps/api/src/modules/professores/professor.service.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/services/professor.service.ts`
- `apps/web/src/features/collaborators/*`
- `apps/web/src/pages/CollaboratorsList.tsx`
- `apps/web/src/pages/CollaboratorDetails.tsx`
- `apps/web/src/pages/CollaboratorFormPage.tsx`

## Regras e restrições

- `contractId` deve ser respeitado em consultas multi-tenant.
- Permissões devem usar `screenKey`, `blockKey` e `dataScope` já existentes.
- A consulta não pode renderizar formulário nem executar upload/salvamento.
- A edição deve ser acessível por URL direta e proteger alterações não salvas.
- O contrato legado permanece visível e editável até a issue #263.

## Passos de implementação

- [ ] Adicionar leitura individual com escopo na API.
- [ ] Criar modelo, schema, mapeamentos e seções compartilhadas de colaborador.
- [ ] Criar páginas separadas de listagem, visualização e formulário.
- [ ] Atualizar rotas e navegação.
- [ ] Remover a página legada após validar ausência de consumidores.
- [ ] Adicionar testes de rotas, mapeamentos, modo somente leitura, dirty guard e autorização.
- [ ] Atualizar documentação e executar validações.

## Critérios de aceite

- [ ] Testes relevantes foram adicionados ou atualizados.
- [ ] Documentação foi atualizada.
- [ ] `pnpm validate` passa no CI.
- [ ] Riscos conhecidos foram registrados no PR.

## Validação manual

1. Abrir a listagem e confirmar pesquisa/filtros sem formulário embutido.
2. Abrir um colaborador por URL direta e recarregar a página.
3. Abrir a edição por URL direta, salvar e permanecer no contexto do colaborador.
4. Alterar dados, cancelar ou navegar e confirmar o aviso de alterações não salvas.
5. Validar que um usuário somente leitura não vê nem acessa a edição.
6. Validar resposta equivalente para id inexistente e id de outro contrato.

## Decisões e pendências

- As rotas usarão `/consultas/colaboradores/:id` e `/consultas/colaboradores/:id/edit`.
- O endpoint individual retornará `404` tanto para registro inexistente quanto para registro fora do escopo.
- A página legada será removida após a troca de todos os consumidores.
