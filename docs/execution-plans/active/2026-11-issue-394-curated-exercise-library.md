# Plano #394 — biblioteca curada e histórico rastreável

## Objetivo e fontes
Concluir #394, dependência da #404, preservando a épica #392.
Fontes: `docs/product/student-centered-training-experience.md`, roadmap,
`AGENTS.md`, arquitetura de banco e controle de acesso.

## Recorte
API, Prisma, migration, seleção operacional, tela Biblioteca, filtros,
estados de revisão, histórico por versão e testes de regressão.

## Regras
- Novas criações por API são rascunhos, sem aplicação automática.
- Administrador `master` publica após `in_review`; mídia exige licença/origem.
- `expectedVersion` evita concorrência e revisões append-only preservam a trilha.
- Desativação é lógica; histórico de treino permanece.
- Seleção nova exige exercício aprovado e `contractId` correto, inclusive em
  `save-week`, substituição diária e todas as cópias que materializem novos exercícios.
- Referências existentes podem permanecer após desativação, sem reaprovação
  artificial, mas não podem ser reaplicadas por cópia a outra semana/dia.
- Defaults históricos são preservados com origem `legacy_baseline`.
- Remediação A-394-01: novos registros em `draft`/`legacyGrandfathered=false`
  inclusive nos defaults do PostgreSQL; fixtures legadas aprovadas são explícitas.
- Remediação A-394-02: escrita administrativa revalida papel `master`, usuário
  ativo e contrato sob row locks na transação definitiva, incluindo revogação.
- Remediação A-394-03: trigger com lock por chave normalizada de nome/contrato
  rejeita duplicidade nova e concorrente sem alterar duplicatas legadas.
- Testes negativos: SQL direto, Prisma sem status, nomes com caixa/espaçamento,
  concorrência, tenant cruzado e revogação de acesso; HTTP 403/409.
- Remediação A-394-006: o carregador e o importador devem aplicar a mesma
  identidade canônica de caixa/espaços que o PostgreSQL, preservar a primeira
  grafia e complementar metadados de fontes equivalentes. Validar instalação
  em contrato vazio, registro legado com grafia diferente, idempotência e
  ausência de herança de mídia sem licença, inclusive com PostgreSQL real.

## Remediação da auditoria de 10/11/2026
- A-394-007: `legacyGrandfathered=true` preserva status e histórico, mas nunca
  habilita novas aplicações. Migração adiciona guard para futuras aprovações,
  com ator, capacidade canônica, instruções e mídia rastreável; sem reescrita
  dos dados anteriores. Busca oficial, treino, cópia, mapeamento, substituição
  e liberação usam a mesma elegibilidade. Mídia legada sem proveniência não é
  reproduzida nos detalhes de treino. Testes SQL positivos/negativos.
- A-394-008: reusar `PHYSICAL_CAPACITY_TYPES` no backend, validação Zod,
  domínio e combobox web. Não reclassificar automaticamente valores antigos.
- R-394-001: busca e filtro muscular contemplam primários e secundários,
  com pesquisa case-insensitive e escopo por contrato.
- A-394-011: migração incremental reconstrói a constraint de aprovação com
  predicados SQL nula-seguros para `capacity` e `lastCurationAction`, sem
  validar retroativamente registros legados; testes PostgreSQL negativos para
  SQL direto e Prisma e controle positivo do catálogo histórico.
- A-394-012: catálogo oficial e leitura de progresso autorizados por `plans`
  ou `library`; consultas de aluno por `plans` seguem seu `dataScope`.
  Detalhes administrativos, listagem de rascunhos e mutações preservam `library`
  (e `master` onde exigido). Testes HTTP com middleware real abrangem perfis
  sem biblioteca, negação, revogação, self-scope e escopo por contrato.

- A-394-013: a instalação/reinstalação de padrões não pode alterar exercícios
  aprovados e não legados, ainda que campos opcionais estejam vazios ou o nome
  precise de normalização. Revalidar o estado na gravação definitiva nos
  caminhos SQL e Prisma; regressão PostgreSQL real deve preservar versão,
  revisor, ação de curadoria, nome e revisões, sem impedir backfill de rascunhos
  e legado.

## Remediação da auditoria independente (A-394-014 / RISK-394-001 / RISK-394-002)
- A-394-014: campos técnicos multilinha preservam espaços e quebras durante a
  digitação; normalizam os itens somente na gravação. Testes cobrem cada lista.
- RISK-394-001: operações novas bloqueiam as linhas do catálogo com SELECT
  FOR SHARE na transação de escrita; desativação concorrente aguarda o lock,
  e uma aplicação posterior à desativação é negada.
- RISK-394-001 complementar: liberação da Montagem Consolidada usa o
  mesmo bloqueio de linha antes de materializar WorkoutExercise.
- RISK-394-002: nova ficha para curadoria cria um draft com outro ID e nome,
  copiando metadados técnicos sem transferir direitos de mídia ou vínculos
  históricos. O registro antigo e suas referências não são alterados.
- A-394-015: o teste PostgreSQL de corrida entre aplicação e desativação
  utiliza clientes Prisma separados para garantir conexões independentes
  mesmo com pool de uma conexão por cliente; exige que a atualização chegue
  à transação e observe o lock SQL, sem aceitar timeout ao abrir transação.

## Remediação da auditoria independente — A-394-016 e A-394-017 (10/11/2026)
- A-394-016: a rota legada de liberação passa o contrato autenticado ao serviço,
  que revalida o template e todos os exercícios vinculados dentro da mesma
  transação de publicação. O catálogo é bloqueado com `FOR SHARE` até o
  commit; referência desativada, legada ou não aprovada impede a liberação
  integral, sem modificar snapshots. Liberações antigas continuam idempotentes.
- A-394-017: progresso individual e agregado projetam mídia histórica pelo
  mesmo guard de procedência usado nos treinos. Links sem licença/origem ou
  registros legados não são expostos nas respostas, permanecendo no banco para
  auditoria. A listagem também exige exercício do contrato consultado.
- Evidências requeridas: testes HTTP de vínculo por contrato, unitários de
  consultas de progresso e elegibilidade, integração PostgreSQL de liberação
  negada/aprovada/histórica, `pnpm validate` e CI exact-SHA. Auditoria externa
  permanece obrigatória depois do CI verde.

## Validação e aceite
- [ ] Tests de domínio e API, segurança e isolamento.
- [ ] Migration e triggers em PostgreSQL.
- [ ] Tela administrativa e seletor com perfis e viewports.
- [ ] `pnpm validate` e CI exact-SHA.
- [ ] Auditoria independente em contexto separado.

## Fora de escopo
Não aplicar prescrição, integrar mídia sem licença, criar substituição
automática (#404) ou presumir aprovação clínica.

## Situação
Checklist aberto até verificação de CI exact-SHA e auditoria independente.

## Remediação A-394-018 — sanitização da mídia operacional
- Guardar `mediaOrigin`, `mediaLicense` e `legacyGrandfathered` em novos snapshots técnicos e de substituição, mantendo opcionais para registros antigos.
- Redigir `videoUrl` não comprovado nas prévias, nos mapeamentos e em toda resposta pública da montagem consolidada (inclusive histórico e referências de substituição), sem modificar o JSON armazenado.
- Validar via regressão negativa (URL antiga sem licença), positiva (snapshot licenciado), substituição, prévia operacional HTTP e leitura histórica HTTP; executar CI exact-SHA antes de solicitar nova auditoria independente.

## Remediação da auditoria independente — A-394-019 / A-394-020 (10/11/2026)
- **A-394-019:** migration incremental substitui apenas a função de captura
  da liberação, preservando o trigger #400 e todos os snapshots anteriores;
  novas capturas incluem `videoUrl`, `mediaOrigin`, `mediaLicense` e
  `legacyGrandfathered`. A projeção usa o estado legado do snapshot e não
  transfere procedência de versões posteriores. Testes de integração cobrem
  licença positiva, alteração posterior do catálogo e snapshot antigo sem
  prova de origem (vídeo oculto, histórico intacto).
- **A-394-020:** detalhe do catálogo usa `select` explícito de escalares
  da biblioteca, sem carregar ou serializar `alunoProgress`,
  `workoutExercises` e respectivos planos. Acesso de Biblioteca continua
  separado de Planos e não vaza cargas, objetivos ou vínculos de alunos.
  Testes HTTP com middleware real cobrem `library` isolado, `plans` isolado,
  papel administrativo, escopo por contrato e payload sem dados de alunos.
- Validações obrigatórias: Prisma migrations no PostgreSQL real,
  testes API/HTTP, `pnpm validate`, CI exact-SHA e reauditoria independente.
  A PR deve permanecer Draft e a issue aberta até o parecer externo.

## Remediação A-021 — histórico e resposta HTTP (11/11/2026)

- Histórico GET /executions/aluno usa catálogo congelado na liberação para nome e direitos de mídia.
- Dados sem snapshot mantêm o texto, sem inferir direitos de vídeo adquiridos depois.
- Ambas as rotas PUT de exercício filtram URLs legadas ou não licenciadas na resposta.
- Regressões: controles HTTP negativos/positivos, PostgreSQL histórico/licença,
  isolamento de aluno e nenhuma alteração dos registros persistidos.
- A PR permanece Draft até CI exact-SHA e auditoria independente.

## Remediação A-394-022 / A-394-023 — 11/11/2026

- **A-394-022 (escopo do progresso):** `GET /library/progress/:alunoId[/:exerciseId]`
  e `PUT /library/progress/:alunoId/:exerciseId` passam pelo mesmo guard de
  pertencimento do aluno. A permissão `library` não ignora o `dataScope` de
  `plans`; o perfil que tenha somente `library` usa `self`, e `master` usa
  `contract`. Alunos de outro escopo retornam 404 antes de consultar/gravar
  progresso. Controles HTTP cobrem `self`, `managed`, `library` isolada,
  permissões combinadas, `master` e negação de escrita, sem alterar treinos.
- **A-394-023 (navegador):** adicionar o teste dedicado
  `src/pages/Library/issue-394-browser-evidence.test.js` ao workflow CRITICAL
  existente. Em Chromium com os componentes reais da Biblioteca e do seletor,
  API HTTP sintética e perfis distintos, registrar criação, edição, transições
  de curadoria, filtros, catálogo oficial e seleção nos viewports 1440×900,
  768×1024 e 390×844. Gerar capturas, árvores de acessibilidade e relatório
  `artifacts/issue-394/browser.json` ligado ao SHA do workflow. A integração
  de autorização real permanece coberta pelos testes HTTP/API.
- O checklist de aceite só pode ser marcado após a CI exact-SHA executar esses
  controles e os artefatos serem inspecionados. A aprovação independente segue
  sendo uma etapa posterior, sem merge automático.
