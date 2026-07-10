# Plano de execução - catálogo comercial de serviços

## Status

Planejado.

Épica: #210

## Objetivo

Evoluir `/settings/services` para um hub de gestão do catálogo comercial, preservando compatibilidade com os serviços atuais e com o campo Serviço de Interesse do aluno.

## Fonte de verdade de produto

- `docs/product/services-commercial-catalog.md`
- material comercial "Serviços ACESSO 2026"

## Contexto atual

A implementação atual concentra criação/edição e listagem em uma única tela. O domínio compartilhado representa serviço-base e oferta por `parentServiceId`, com descrição única, preço mensal e vigência.

Esse modelo não cobre adequadamente:

- categorias comerciais;
- conteúdo institucional por seção;
- preço gratuito ou sob consulta;
- opções comerciais independentes;
- composição de planos por vários serviços;
- quantidade, periodicidade e ordem dos componentes.

## Estratégia de entrega

A implementação deve ser incremental, mantendo consumidores atuais funcionais durante a transição.

### Fase 1 - domínio e persistência

Issue: #211

- definir entidades, enums, constraints e migrations;
- preservar isolamento por `contractId`;
- mapear registros legados;
- testar aplicação em base vazia e com dados.

### Fase 2 - contratos e API

Issue: #212

- atualizar tipos compartilhados;
- implementar leitura e mutações;
- validar preço, vigência, composição e ordenação;
- garantir autorização e multi-tenant;
- manter compatibilidade durante o rollout.

### Fase 3 - catálogo navegável

Issue: #213

- substituir a tabela como experiência principal;
- implementar cards/lista, busca, filtros, status e ordenação;
- tratar estados de carregamento, erro e vazio.

### Fase 4 - editor estruturado

Issue: #214

- implementar fluxo por categoria;
- separar Visão geral e Apresentação;
- estruturar "O que é?", "A quem se destina?" e "O que o compõe?";
- tratar alterações não salvas e validação.

### Fase 5 - opções, valores e composição

Issue: #215

- implementar opções comerciais;
- implementar tipos de preço e vigência;
- implementar composição de planos;
- criar visão consolidada Combinações e valores.

### Fase 6 - carga inicial

Issue: #216

- cadastrar os nove serviços de referência;
- cadastrar opções, valores e composições;
- garantir idempotência e preservação de alterações manuais.

### Fase 7 - integração e rollout

Issue: #217

- adaptar todos os consumidores;
- preservar Serviço de Interesse do aluno;
- validar serviços legados e inativos;
- executar regressão completa e finalizar documentação.

## Dependências principais

```text
#211 Modelo e persistência
  -> #212 Tipos e API
      -> #213 Catálogo
      -> #214 Editor
          -> #215 Valores e composição
  -> #216 Carga inicial
#211 + #212 + #213 + #214 + #215 + #216
  -> #217 Compatibilidade e rollout
```

## Módulos inicialmente afetados

- `apps/api` - rotas, validação, serviços e persistência;
- `apps/web/src/pages/Settings/Services.tsx` e componentes derivados;
- `apps/web/src/services/service.service.ts`;
- `apps/web/src/pages/AlunoForm.tsx` e consumidores equivalentes;
- `packages/types/service.ts`;
- schema e migrations Prisma;
- catálogo de acesso caso novos `blockKey` sejam necessários;
- documentação e testes relacionados.

Os caminhos exatos devem ser confirmados em cada issue antes da implementação.

## Riscos

### Compatibilidade com dados atuais

Mitigação: migração explícita, códigos estáveis, testes com dados legados e rollout incremental.

### Regressão no cadastro de aluno

Mitigação: manter contrato compatível até a fase final e adicionar testes específicos do campo Serviço de Interesse.

### Vazamento multi-tenant por vínculos

Mitigação: validar `contractId` no backend em toda associação e cobrir tentativas entre contratos nos testes.

### Ciclos em planos combinados

Mitigação: impedir autorreferência e ciclos indiretos antes de persistir.

### Sobrescrita pela carga inicial

Mitigação: carga idempotente por códigos estáveis e política de não sobrescrever alterações manuais.

## Critérios de conclusão da épica

- issues #211 a #217 concluídas;
- catálogo representa os nove serviços de referência;
- opções e composições são estruturadas;
- Serviço de Interesse continua funcional;
- segurança multi-tenant validada;
- `pnpm validate` passa;
- checklist manual concluído;
- documentação atualizada e plano movido para `completed/`.

## Checklist manual final

- [ ] visualizar os nove serviços na ordem definida;
- [ ] buscar e filtrar por categoria e status;
- [ ] criar e editar avaliação/consulta;
- [ ] criar e editar serviço individual;
- [ ] criar e editar plano combinado;
- [ ] editar as três seções de apresentação;
- [ ] cadastrar preço fixo;
- [ ] cadastrar opção gratuita;
- [ ] cadastrar opção sob consulta;
- [ ] configurar e reordenar várias opções;
- [ ] configurar e reordenar vários componentes;
- [ ] impedir composição cíclica;
- [ ] validar vigências;
- [ ] preservar aluno com serviço legado;
- [ ] impedir novo vínculo com serviço inativo;
- [ ] validar isolamento entre contratos;
- [ ] executar carga duas vezes sem duplicação.

## Decisões registradas

- a interface usará linguagem comercial, não serviço-base/oferta;
- a página principal será navegável antes de ser editável;
- conteúdo institucional será separado por seção;
- opções comerciais e composição são conceitos distintos;
- instalações, parceiros, checkout e geração de PDF ficam fora da primeira evolução.
