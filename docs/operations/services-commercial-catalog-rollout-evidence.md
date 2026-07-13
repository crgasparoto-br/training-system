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
| Multi-tenant HTTP | `service-http-contract-a` e `service-http-contract-b` | consulta e alteração de ID pertencente ao outro contrato | resposta genérica `404` e nenhum dado alterado |
| Reordenação | `service-http-contract-a` | lotes inválidos e duas requisições concorrentes | lote inválido sem escrita parcial e posições finais contíguas |
| Impacto | `service-http-contract-a` | componentes ativos repetidos, outro plano e componente histórico inativo | contagem por plano distinto, ignorando histórico inativo |
| Concorrência otimista | `service-http-contract-a` | alterar o recurso entre consulta e confirmação | resposta `409` e item permanece ativo |

A referência oficial da execução deve ser o workflow **Validate PR** da PR de catálogo. O link e o número do run são registrados na descrição da PR após a conclusão.

## Consumidores do catálogo

| Consumidor | Situação | Classificação | Observação |
| --- | --- | --- | --- |
| `Configurações > Serviços` | usa `/services/catalog` e contratos estruturados | migrado | fonte principal de administração do catálogo |
| Auditoria de impacto | usa endpoints `/catalog/:id/impact` | migrado | consulta por contrato autenticado |
| Cadastro e edição de aluno | usa projeção de `GET /services` | mantido temporariamente | preserva Serviço de Interesse legado e IDs existentes |
| Geração e vínculo de contratos | usa IDs preservados de `ServiceOption` | mantido temporariamente | compatibilidade até migração integral dos consumidores |
| Ofertas legadas com `parentServiceId` | permanecem armazenadas | mantido temporariamente | não são fonte da nova tela |
| Exclusão física de serviços e opções | não utilizada | removido do fluxo operacional | inativação preserva histórico |

A remoção dos adaptadores temporários exige uma issue própria e evidência de ausência de consumidores.

## Registro por contrato em ambiente real

Preencher uma linha por contrato antes de considerar o rollout produtivo concluído.

| Ambiente | Contract ID | Backup | Migration | Dry-run | Conflitos revisados | Carga real | Segunda simulação | Operador | Evidência |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| homologação | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente |
| produção | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente | pendente |

Não registrar valores fictícios. Enquanto esta tabela não possuir os contratos e resultados reais do ambiente alvo, o rollout operacional permanece pendente, embora a implementação e a validação automatizada possam estar aprovadas.
