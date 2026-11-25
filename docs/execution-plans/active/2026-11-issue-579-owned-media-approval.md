# Plano de execução — issue #579 (aprovação de mídia própria)

## Objetivo e contrato
Permitir aprovação profissional de exercícios com vídeo cujo `mediaOrigin` declare `Própria`, sem exigir `mediaLicense`. Preservar exigência para `Licenciada` e origens históricas não canônicas.

## Superfícies afetadas
- API de curadoria: validação dos campos pendentes e autorização do vídeo.
- PostgreSQL: nova migration incremental para a constraint de aprovação `ExerciseLibrary_approved_curated_guard`, sem editar migrations aplicadas.
- Biblioteca web: formulário, orientação contextual e prévia de mídia.
- Consumidores: catálogo operacional, progresso, treino, liberação e snapshots históricos imutáveis.

## Controles de regressão
- Positivo: `Própria` sem licença aprova e exibe prévia, inclusive quando a licença é `NULL`.
- Negativo: `Licenciada`, ausência de origem e valor legado não canônico sem licença continuam bloqueados.
- Banco: alteração SQL direta não converte mídia própria aprovada em terceiro sem licença.
- Histórico: mídia legada continua omitida; snapshot sem direitos não herda propriedade de revisão posterior.
- A-001: origem bruta exata na API, SQL, UI e snapshots; variantes com espaços ASCII/Unicode exigem licença não vazia. SQL direto cobre criação e atualização.
- A-002: progresso e treinos vivos ocultam vídeo de rascunho, revisão ou inativo, mantendo os registros e os snapshots liberados. Verificar transição de aprovação, respostas GET/PUT e regressão de histórico.
- A-003: testar a rota GET de execuções usando o serviço real, com alterações posteriores do status vivo, mídia própria/licenciada capturada e snapshots sem direitos. Projetar uma única vez, sem expor `releasedCatalog`.
- A-004: testar a listagem operacional no serviço e via HTTP autenticado com dados PostgreSQL, incluindo padrões sem origem/licença, origem não canônica, mídia própria/licenciada, legado, rascunho e outro contrato. Não ampliar o contrato de resposta nem regravar URLs.
- Isolamento: filtros por `contractId`, guardas de versão e permissões existentes não são alterados.

## Validações e conclusão
- Executar os testes focados de API e web, integração com PostgreSQL quando disponível e `pnpm validate`.
- Observar CI do SHA final na PR contra `develop`; registrar eventuais impedimentos no parecer de entrega.
- Submeter à auditoria independente, sem realizar merge automaticamente.
