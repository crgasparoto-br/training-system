# Issue 271 — pré-cadastro público autenticado e retomável

## Objetivo

Transformar o convite seguro de pré-cadastro em uma experiência pública que identifica o tenant sem expor dados pessoais, vincula o processo a uma conta autenticada e permite concluir os dados básicos com retomada segura em outro dispositivo.

## Escopo implementado

- landing pública com identidade da academia, validade, etapas e aviso de privacidade;
- login com conta existente ou criação de conta de aluno restrita ao convite;
- reivindicação transacional com token usado somente na entrada;
- continuação em `/pre-cadastro`, sem token na URL;
- seleção explícita do processo quando uma conta possui mais de um dependente;
- endpoints autenticados process-scoped, sempre revalidando `userId`, `alunoId`, `contractId` e autorização;
- formulário em etapas para identificação, contato, endereço, responsável e privacidade;
- identidade canônica mantida em `StudentProfile` por meio de `student-identity.service.ts`;
- rascunho persistido no servidor com versão otimista e próxima etapa;
- rascunho temporário de aba isolado por processo e sem CPF, data de nascimento ou CPF do responsável;
- relação explícita e tenant-scoped entre conta do responsável e dependente;
- reivindicação de responsável inicialmente `PENDING`, sem leitura de dados pessoais até validação independente por usuário autorizado da academia;
- acesso de responsável permitido somente para menoridade confirmada pela data canônica e autorização `ACTIVE` validada por conta diferente da conta responsável;
- revogação de responsável remove o claim autenticado do menor inclusive após a conclusão do pré-cadastro, impedindo nova sessão e ocultando o processo da listagem;
- alteração da data de nascimento canônica de adulto para menor suspende o claim do próprio aluno quando não existir autorização `ACTIVE`, em qualquer estado do processo;
- o claim do próprio aluno é restaurado somente quando a elegibilidade retorna, por maioridade canônica ou autorização `ACTIVE` tenant-scoped;
- revogação de solicitação de outro responsável não remove o claim do próprio aluno quando outra autorização `ACTIVE` continua válida;
- suporte a múltiplos dependentes por conta de responsável sem reutilizar `Aluno.userId`;
- edição administrativa da identidade canônica invalida versões públicas desatualizadas por trigger de banco, inclusive em processo concluído;
- conclusão revalida claim, papel, conta vinculada, identidade canônica e autorização dentro da transação, depois do lock do onboarding;
- retry de conclusão já terminal é idempotente e não altera timestamps, consentimento, convites ou eventos;
- consentimento com versão, data/hora, identidade autenticada, IP e user-agent quando disponíveis;
- conclusão idempotente, evento `PRE_REGISTRATION_COMPLETED` único e convite reconciliado como concluído;
- cards independentes e acionáveis para o encaminhamento às etapas opcionais de Anamnese e PAR-Q;
- mensagens para convite indisponível, sessão ausente, versão obsoleta, duplicidade e falha de rede.

## Correções da auditoria

1. **Conta incompatível:** todas as divergências de nome, e-mail, telefone, CPF e data de nascimento bloqueiam a reivindicação sem revelar ao cliente quais atributos divergiram.
2. **Múltiplos dependentes:** sessão, salvamento, duplicidade, consentimento e conclusão recebem o processo selecionado explicitamente.
3. **Concorrência administrativa:** atualização profissional de `StudentProfile.identificationData` incrementa `StudentOnboardingProcess.version`.
4. **Responsável:** claim cria autorização pendente; a autodeclaração apenas registra o vínculo informado e a liberação exige validação administrativa independente, auditável e reforçada por constraint de banco.
5. **Conclusão:** validação ocorre sobre a identidade canônica lida dentro da transação e emite evento específico uma única vez.
6. **Etapas:** contratos discriminados e allowlists de backend impedem que uma etapa altere campos pertencentes a outra.
7. **Próximos passos:** cards deixam de ficar desabilitados e encaminham para a etapa opcional correspondente.
8. **Revogação pós-conclusão:** a mudança de autorização invalida e remove o claim do processo em qualquer estado, e a migration corrige registros históricos concluídos com autorização revogada.
9. **Múltiplos responsáveis:** o trigger diferencia o claim do responsável e o claim do aluno; uma revogação paralela não derruba o aluno enquanto existir autorização ativa aplicável.
10. **Transição de elegibilidade:** mudança canônica adulto → menor suspende acesso e listagem sem depender do estado do processo; menor → adulto ou ativação de autorização válida restaura o claim do aluno vinculado.
11. **TOCTOU na conclusão:** a autorização definitiva é reavaliada após o lock do onboarding; uma revogação concorrente vence antes do lock ou aguarda o commit, sem permitir escrita pós-revogação.
12. **Retry terminal:** repetição de conclusão já processada retorna sem atualizar metadados nem reconciliar novamente convites e eventos.

## Limites preservados

- a conclusão do pré-cadastro não ativa matrícula, contrato, cobrança, agenda, plano ou liberação para treino;
- Anamnese e PAR-Q permanecem opcionais e não bloqueiam o cadastro básico;
- os formulários completos de Anamnese e PAR-Q continuam pertencendo às issues #272 e #273;
- campos textuais e a declaração do responsável não concedem acesso sem a relação `ACTIVE` validada por usuário administrativo diferente;
- o frontend não persiste respostas do formulário em URL, query string ou `localStorage`;
- a landing pública não retorna CPF, e-mail, telefone, IDs internos, dados clínicos ou informações comerciais.

## Validação

1. migrations aplicadas em PostgreSQL pelo workflow oficial;
2. `pnpm type-check`;
3. `pnpm lint`;
4. `pnpm test`, incluindo cenários discriminantes de banco da issue 271;
5. `pnpm build`;
6. `pnpm arch:check`;
7. `pnpm access:check`;
8. `pnpm docs:check`;
9. pré-auditoria funcional requisito a requisito e passagem adversarial;
10. verificação visual interna em desktop amplo, desktop de baixa altura e mobile;
11. higienização final do diff e nova rodada completa de validação.

## Entrega

- Branch: `feat/271-public-pre-registration`
- Pull request: #281
- Base: `develop`

A PR deve permanecer sem merge até autorização explícita.

## Correções da auditoria independente de 24/07/2026

- rascunhos locais agora registram a versão-base do servidor e não são restaurados automaticamente quando a versão mudou;
- conflitos de concorrência bloqueiam a edição até reconciliação explícita, campo a campo, entre os dados atuais e o rascunho local;
- e-mail principal passou a integrar a regra compartilhada de conclusão no frontend, backend e fluxo administrativo;
- telefone e e-mail alternativos foram incluídos no contrato público e na etapa de contato;
- convite inválido sempre orienta a solicitação de um novo link;
- contas já vinculadas a aluno ativo recebem resposta tipada e encaminhamento seguro ao sistema autenticado;
- mensagens de erro de campo usam associação programática por `aria-describedby`;
- testes de regressão cobrem rascunho obsoleto, reconciliação, e-mail obrigatório, contatos alternativos, aluno ativo e fallback de convite.

Validação oficial repetida após alinhar as fixtures antigas à regra compartilhada de e-mail obrigatório.

## Remediação da auditoria de segurança de 24/07/2026

- a declaração pública do responsável permanece `PENDING` e não grava mais `validatedAt` nem `validatedByUserId`;
- um usuário com permissão `students.preRegistration.review` valida o vínculo na ficha administrativa, após confirmação de verificação por fonte independente;
- a constraint `PreRegistrationGuardianAuthorization_independent_validation_check` impede `ACTIVE` sem relacionamento, data, validador e separação entre responsável e validador;
- autorizações antigas autovalidadas são rebaixadas para `PENDING` pela migration;
- revogação remove imediatamente o vínculo do processo, inclusive quando o pré-cadastro básico já foi concluído, e impede autorreativação pelo mesmo convite;
- testes cobrem responsável não vinculado, autovalidação bloqueada, aprovação administrativa, múltiplos dependentes, múltiplos responsáveis, revogação, tentativa cross-tenant e revogação pós-conclusão;
- o schema de salvamento é uma união discriminada por etapa e rejeita campos fora da allowlist da etapa selecionada;
- a auditoria visual inclui solicitação, espera de aprovação, validação administrativa em desktop/mobile e continuação após liberação.

## Remediação da pré-auditoria da fronteira pública de 24/07/2026

- os detalhes de erros públicos usam allowlist por código; campos internos não autorizados deixam de ser serializados por expansão de objetos;
- `ACCOUNT_INCOMPATIBLE` retorna somente o código público e uma mensagem estável, sem listar nome, CPF, telefone, e-mail ou data de nascimento divergentes;
- falhas inesperadas retornam mensagem genérica, código `INTERNAL_ERROR` e identificador de correlação não sensível;
- a mensagem técnica original permanece restrita ao log do servidor associado ao identificador de correlação;
- testes HTTP comparam divergências distintas e exigem payload externo idêntico;
- teste HTTP injeta uma falha técnica e confirma que nomes de tabela, campos e mensagem original não aparecem na resposta.

## Remediação do achado AUD-271-003

- a função de trigger de autorização não limita mais a invalidação a processos com `completedAt` nulo;
- para claim de responsável, apenas a revogação ou substituição da autorização vinculada àquela conta remove o acesso;
- para claim do próprio aluno, o acesso somente é removido quando não resta nenhuma autorização `ACTIVE` tenant-scoped;
- a revogação efetiva incrementa a versão, limpa `claimedByUserId` e `claimedAt` na mesma transação, mantendo o status cadastral concluído sem preservar acesso autenticado indevido;
- a migration executa backfill apenas de processos de menores com autorização `REVOKED`, claim residual e nenhuma autorização `ACTIVE`, preservando declarações `PENDING`;
- a listagem deixa de retornar o processo porque depende do claim vigente, e a consulta process-scoped responde `NOT_FOUND` sem carregar a identidade;
- o teste de integração cobre conclusão seguida de revogação e confirma ausência de processo e sessão;
- um segundo cenário disputa conclusão e revogação simultaneamente e exige que o estado final permaneça sem claim e sem leitura de dados pessoais;
- um terceiro cenário revoga uma solicitação `PENDING` paralela e confirma que o claim do aluno permanece quando outra autorização `ACTIVE` continua válida.

## Remediação dos achados AUD-271-004 e AUD-271-005

- a data de nascimento canônica passou a ser uma fonte explícita de elegibilidade: adulto → menor sem autorização ativa limpa `claimedByUserId` e `claimedAt` atomicamente;
- a regra vale para `INVITED`, `PRE_REGISTRATION_IN_PROGRESS` e `PRE_REGISTRATION_COMPLETED`, sem exceção baseada em `completedAt`;
- menor → adulto restaura o claim do próprio aluno usando o `Aluno.userId` tenant-scoped; para menor, a ativação de autorização `ACTIVE` também restaura o claim elegível;
- o backfill reconcilia claims de menores com a existência real de autorização ativa, cobrindo dados históricos anteriores à migration;
- `completePublicStudentPreRegistration` bloqueia o onboarding e então revalida claim, papel, conta vinculada, lifecycle, idade canônica e autorização ativa;
- o branch já concluído é somente leitura: não altera `updatedAt`, IP, user-agent, consentimento, convites ou eventos;
- testes discriminantes cobrem transição adulto → menor em andamento, transição após conclusão, restauração por autorização, restauração por maioridade e retry terminal após revogação com controle negativo de todas as mutações.

## Verificação interna final

- Passagem A: rastreabilidade direta entre identidade canônica, autorização, claim, listagem, sessão, conclusão e testes de integração;
- Passagem B: ataque fresco sobre transições de elegibilidade, estados em andamento/concluído, perda e restauração de autoridade, retry terminal e ausência de efeitos colaterais;
- o workflow oficial deve aplicar a migration, executar os testes de banco e repetir type-check, lint, build, arquitetura, catálogo de acessos e documentação no SHA final;
- os identificadores dos gates e o SHA final devem ser registrados na descrição da PR e no comentário de handoff da issue;
- estado esperado após gates verdes: pronto para auditoria independente; a verificação interna não reivindica aprovação independente.

Qualquer alteração posterior ao SHA corrigido exige nova auditoria independente funcional e documental antes do merge.
