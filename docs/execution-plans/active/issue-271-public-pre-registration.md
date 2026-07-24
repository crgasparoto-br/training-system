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
- suporte a múltiplos dependentes por conta de responsável sem reutilizar `Aluno.userId`;
- edição administrativa da identidade canônica invalida versões públicas desatualizadas por trigger de banco;
- conclusão revalida os dados canônicos dentro da transação bloqueada, sem regravar snapshot antigo;
- consentimento com versão, data/hora, identidade autenticada, IP e user-agent quando disponíveis;
- conclusão idempotente, evento `PRE_REGISTRATION_COMPLETED` único e convite reconciliado como concluído;
- cards independentes e acionáveis para o encaminhamento às etapas opcionais de Anamnese e PAR-Q;
- mensagens para convite indisponível, sessão ausente, versão obsoleta, duplicidade e falha de rede.

## Correções da auditoria

1. **Conta incompatível:** todas as divergências de nome, e-mail, telefone, CPF e data de nascimento bloqueiam a reivindicação.
2. **Múltiplos dependentes:** sessão, salvamento, duplicidade, consentimento e conclusão recebem o processo selecionado explicitamente.
3. **Concorrência administrativa:** atualização profissional de `StudentProfile.identificationData` incrementa `StudentOnboardingProcess.version`.
4. **Responsável:** claim cria autorização pendente; a autodeclaração apenas registra o vínculo informado e a liberação exige validação administrativa independente, auditável e reforçada por constraint de banco.
5. **Conclusão:** validação ocorre sobre a identidade canônica lida dentro da transação e emite evento específico uma única vez.
6. **Etapas:** contratos discriminados e allowlists de backend impedem que uma etapa altere campos pertencentes a outra.
7. **Próximos passos:** cards deixam de ficar desabilitados e encaminham para a etapa opcional correspondente.

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
9. auditoria funcional requisito a requisito e passagem adversarial;
10. auditoria visual independente em desktop amplo, desktop de baixa altura e mobile;
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
- revogação remove imediatamente o vínculo do processo incompleto e impede autorreativação pelo mesmo convite;
- testes cobrem responsável não vinculado, autovalidação bloqueada, aprovação administrativa, múltiplos dependentes, revogação e tentativa cross-tenant;
- o schema de salvamento é uma união discriminada por etapa e rejeita campos fora da allowlist da etapa selecionada;
- a auditoria visual inclui solicitação, espera de aprovação, validação administrativa em desktop/mobile e continuação após liberação.
