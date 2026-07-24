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
- reivindicação de responsável inicialmente `PENDING`, sem leitura de dados pessoais até confirmação do vínculo;
- acesso de responsável permitido somente para menoridade confirmada pela data canônica;
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
4. **Responsável:** claim cria autorização pendente; confirmação e menoridade são exigidas antes da leitura dos dados.
5. **Conclusão:** validação ocorre sobre a identidade canônica lida dentro da transação e emite evento específico uma única vez.
6. **Próximos passos:** cards deixam de ficar desabilitados e encaminham para a etapa opcional correspondente.

## Limites preservados

- a conclusão do pré-cadastro não ativa matrícula, contrato, cobrança, agenda, plano ou liberação para treino;
- Anamnese e PAR-Q permanecem opcionais e não bloqueiam o cadastro básico;
- os formulários completos de Anamnese e PAR-Q continuam pertencendo às issues #272 e #273;
- campos textuais de responsável não concedem acesso sem a relação de autorização;
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
