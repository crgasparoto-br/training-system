# Plano de execução - catálogo comercial de serviços

## Status

Implementado na PR #219. Mantido neste caminho por compatibilidade até a aplicação da migration, carga por contrato e validação operacional.

Épica: #210  
Subissues: #211, #212, #213, #214, #215, #216 e #217

## Objetivo

Evoluir `/settings/services` para um hub de gestão do catálogo comercial, preservando os IDs dos serviços atuais e a compatibilidade com o campo Serviço de Interesse do aluno.

## Fontes de verdade

- `docs/product/services-commercial-catalog.md`
- material comercial "Serviços ACESSO 2026"
- `docs/operations/services-commercial-catalog-rollout.md`

## Entrega implementada

### Domínio e persistência - #211

- [x] campos de categoria, resumo, "O que é?", público-alvo, ordem e origem no agregado principal;
- [x] entidades para opções comerciais, itens de apresentação e componentes de plano;
- [x] constraints para categoria, preço, vigência, ordem, quantidade, alvo único e autorreferência;
- [x] índices com `contractId` e chaves de consulta;
- [x] conversão idempotente das ofertas legadas sem exclusão dos registros originais;
- [x] preservação dos IDs de `ServiceOption` usados por alunos e contratos.

### Contratos compartilhados e API - #212

- [x] tipos compartilhados para catálogo, detalhe, opções, itens, componentes e carga;
- [x] leitura resumida e detalhada;
- [x] criação e edição de serviços, opções, itens e componentes;
- [x] reordenação transacional com sequência completa;
- [x] validação de preço fixo, gratuito e sob consulta;
- [x] validação de vigência e ciclos indiretos;
- [x] escopo por contrato em todas as consultas e mutações;
- [x] autorização pela tela `settings.services` e papel master para escrita;
- [x] adaptador temporário em `GET /services`.

### Catálogo navegável - #213

- [x] cards responsivos em vez de tabela extensa;
- [x] busca por nome/código;
- [x] filtros por categoria e status;
- [x] preço inicial e estados sem opção, vencido ou plano incompleto;
- [x] estados de carregamento, erro, vazio e nenhum resultado.

### Editor estruturado - #214

- [x] fluxo de novo serviço e detalhe contextual;
- [x] categoria, ordem, status e código estável;
- [x] seções "O que é?", "A quem se destina?" e "O que o compõe?";
- [x] proteção contra saída com alterações não salvas;
- [x] preservação dos dados digitados em falha de gravação;
- [x] alteração de categoria sem exclusão silenciosa de registros.

### Opções, valores e composição - #215

- [x] CRUD e reordenação de opções comerciais;
- [x] preço fixo, gratuito e sob consulta;
- [x] frequência, quantidade, unidade e vigência;
- [x] composição por serviço ou opção do mesmo contrato;
- [x] bloqueio de autorreferência e ciclos;
- [x] visão consolidada "Combinações e valores".

### Carga ACESSO 2026 - #216

- [x] matriz explícita dos nove serviços de referência;
- [x] preços e opções confirmados no material;
- [x] itens de apresentação confirmados;
- [x] componentes relacionais para as opções do Plano Essencial confirmadas;
- [x] comando por contrato com `--dry-run`;
- [x] carga incremental, idempotente e sem sobrescrita automática;
- [x] relatório de conflitos para divergências existentes.

### Compatibilidade e rollout - #217

- [x] Serviço de Interesse continua usando IDs dos serviços principais;
- [x] projeção das opções estruturadas no formato legado;
- [x] registros legados preservados para rollback;
- [x] documentação de ordem de deploy, carga, validação e rollback;
- [ ] migration aplicada em ambiente alvo;
- [ ] carga executada por contrato;
- [ ] checklist manual em ambiente com banco concluído.

## Decisões de implementação

- `ServiceOption` permanece como agregado principal durante o rollout para preservar referências existentes.
- As novas entidades são acessadas pela API com SQL parametrizado até a consolidação do schema Prisma; a migration é a fonte de verdade física desta etapa.
- Componentes externos que ainda não são serviços do catálogo ficam como itens de apresentação; não são criados serviços adicionais sem confirmação do material.
- A carga nunca altera um serviço existente com o mesmo código; divergências são reportadas.
- Instalações, parceiros, checkout e geração de PDF permanecem fora do escopo.

## Ordem de rollout

1. aplicar `20260710230000_services_commercial_catalog`;
2. publicar API e web;
3. executar `db:bootstrap-services-catalog` com `--dry-run` para cada contrato;
4. revisar conflitos;
5. executar a carga real;
6. validar catálogo, Serviço de Interesse e contratos;
7. executar novamente o dry-run para confirmar idempotência.

## Validação automatizada

A PR executa o workflow oficial `Validate PR`:

- [ ] type-check;
- [ ] lint;
- [ ] testes;
- [ ] arquitetura;
- [ ] catálogo de acesso;
- [ ] documentação.

## Checklist manual final

- [ ] visualizar os nove serviços na ordem definida;
- [ ] buscar e filtrar por categoria e status;
- [ ] criar e editar as três categorias;
- [ ] editar as três seções de apresentação;
- [ ] cadastrar preço fixo, gratuito e sob consulta;
- [ ] configurar e reordenar opções e componentes;
- [ ] confirmar bloqueio de composição cíclica;
- [ ] validar vigências e preços vencidos;
- [ ] preservar aluno com serviço legado;
- [ ] impedir novo vínculo com serviço inativo;
- [ ] validar isolamento entre contratos;
- [ ] executar carga duas vezes sem duplicação.

## Riscos remanescentes

- a API nova depende da migration e não deve ser publicada antes dela;
- a validação real de dados legados exige banco representativo;
- a remoção futura do adaptador legado deve ocorrer apenas após inventário de consumidores;
- o schema Prisma deve ser consolidado em etapa posterior antes de eliminar o acesso SQL de compatibilidade.
