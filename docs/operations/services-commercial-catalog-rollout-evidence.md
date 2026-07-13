# Evidências do rollout do catálogo comercial

## Escopo

Este registro complementa o runbook `services-commercial-catalog-rollout.md` e separa:

- evidência automatizada e reproduzível executada no workflow oficial;
- classificação dos consumidores do catálogo legado;
- execução operacional que deve ser preenchida por contrato em cada ambiente real.

## Evidência automatizada

| Cenário | Contrato de teste | Procedimento | Resultado esperado |
| --- | --- | --- | --- |
| Primeira carga | `catalog-bootstrap-contract-a` | teste de integração `service-catalog-bootstrap.integration.test.ts` | cria somente os nove serviços e seus registros de referência |
| Simulação | `catalog-bootstrap-contract-dry-run` | bootstrap com `dryRun=true` | não persiste serviço, opção, item ou componente |
| Idempotência | `catalog-bootstrap-contract-a` | segunda execução após customização | não duplica nem sobrescreve campos e posições personalizados |
| Isolamento | `catalog-bootstrap-contract-a` e `catalog-bootstrap-contract-b` | carga nos dois contratos | registros independentes e nenhuma relação cruzada |
| Rollback | `catalog-bootstrap-contract-rollback` | trigger de falha durante criação de componente | transação integralmente revertida |
| Autorização HTTP | `service-http-contract-a` | token válido, token sem permissão e chamada sem token | respostas `200`, `403` e `401`, respectivamente |
| Escrita sem permissão | `service-audit-gaps-contract` | `POST /services/catalog` com função sem `settings.services` | resposta `403` e nenhuma linha persistida |
| Multi-tenant HTTP | `service-http-contract-a` e `service-http-contract-b` | consulta e alteração de ID pertencente ao outro contrato | resposta genérica `404` e nenhum dado alterado |
| Validação de edição | `service-audit-gaps-contract` | `PUT /services/catalog/:id` com payload inválido | resposta padrão `400` e registro preservado |
| Reordenação | `service-http-contract-a` | lotes inválidos e duas requisições concorrentes | lote inválido sem escrita parcial e posições finais contíguas |
| Impacto | `service-http-contract-a` | componentes ativos repetidos, outro plano e componente histórico inativo | contagem por plano distinto, ignorando histórico inativo |
| Matriz de impacto | `service-audit-gaps-contract` | cenários com zero, um e vários planos para serviço e opção | quantidade exata retornada pelos endpoints reais |
| Concorrência otimista | `service-http-contract-a` | alterar o recurso entre consulta e confirmação | resposta `409` e item permanece ativo |
| Mutação relacionada concorrente | `service-audit-gaps-contract` | inserir componente após consultar impacto e reutilizar confirmação antiga | versão invalidada, resposta `409` e item permanece ativo |
| Bypass legado | `service-audit-gaps-contract` | tentar `PUT /services/:id` com `isActive=false` | resposta `400`; inativação exige a rota auditada do catálogo |
| Alvo inativo no banco | `service-audit-gaps-contract` | inserir componente ativo apontando para serviço inativo | trigger rejeita a gravação e nenhuma relação inválida permanece |
| Fonte jurídica | teste web `contractTemplatePresets.test.ts` | validar ID, título, data da revisão e cláusula 6.5 | fonte rastreável, data `22 de abril de 2026` e modelo mantido em `DRAFT` |

A referência oficial da execução deve ser o workflow **Validate PR** da PR de catálogo. O link e o número do run são registrados na descrição da PR após a conclusão.

## Proteções de concorrência

A migration `20260713195100_service_catalog_concurrency_guards` adiciona somente funções e triggers não destrutivos:

- uma composição ativa somente pode apontar para serviço ou opção ativos do mesmo contrato;
- inserções e alterações de componentes bloqueiam e validam o alvo na mesma transação;
- mudanças em componentes atualizam a versão dos serviços e opções afetados;
- a inativação usa comparação de versão e retorna `409` quando o catálogo muda entre consulta e gravação.

Nenhum serviço, opção, componente, contrato ou vínculo histórico é apagado pela migration.

## Consumidores do catálogo

| Consumidor | Situação | Classificação | Observação |
| --- | --- | --- | --- |
| `Configurações > Serviços` | usa `/services/catalog` e contratos estruturados | migrado | fonte principal de administração do catálogo |
| Auditoria de impacto | usa endpoints `/catalog/:id/impact` | migrado | consulta por contrato autenticado |
| Cadastro e edição de aluno | usa projeção de `GET /services` | mantido temporariamente | preserva Serviço de Interesse legado e IDs existentes |
| Geração e vínculo de contratos | usa IDs preservados de `ServiceOption` | mantido temporariamente | compatibilidade até migração integral dos consumidores |
| Ofertas legadas com `parentServiceId` | permanecem armazenadas | mantido temporariamente | não são fonte da nova tela |
| Atualização legada de serviço | permanece para edições administrativas | mantido temporariamente com restrição | não pode executar `isActive=false`; inativação passa pela auditoria estruturada |
| Exclusão física de serviços e opções | não utilizada | removido do fluxo operacional | inativação preserva histórico |

A remoção dos adaptadores temporários exige uma issue própria e evidência de ausência de consumidores.

## Registro por contrato em ambiente real

Preencher uma linha por contrato antes de considerar o rollout produtivo concluído.

| Ambiente | Contract ID | Backup | Migration | Dry-run | Conflitos revisados | Carga real | Segunda simulação | Operador | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| homologação | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente |
| produção | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente |

Não registrar valores fictícios. Enquanto esta tabela não possuir os contratos e resultados reais do ambiente alvo, o rollout operacional permanece pendente, embora a implementação e a validação automatizada possam estar aprovadas.
