# Issue 271 — pré-cadastro público autenticado e retomável

## Objetivo

Transformar o convite seguro de pré-cadastro em uma experiência pública que identifica o tenant sem expor dados pessoais, vincula o processo a uma conta autenticada e permite concluir os dados básicos com retomada segura em outro dispositivo.

## Escopo implementado

- landing pública com identidade da academia, validade, etapas e aviso de privacidade;
- login com conta existente ou criação de conta de aluno restrita ao convite;
- reivindicação transacional com token usado somente na entrada;
- continuação em `/pre-cadastro`, sem token na URL;
- formulário em etapas para identificação, contato, endereço, responsável e privacidade;
- identidade canônica mantida em `StudentProfile` por meio de `student-identity.service.ts`;
- rascunho persistido no servidor com versão otimista e próxima etapa;
- relação explícita e tenant-scoped entre conta do responsável e dependente;
- suporte a múltiplos dependentes por conta de responsável sem reutilizar `Aluno.userId`;
- consentimento com versão, data/hora, identidade autenticada, IP e user-agent quando disponíveis;
- conclusão idempotente, convite reconciliado como concluído e cards independentes para Anamnese e PAR-Q;
- mensagens para convite indisponível, sessão ausente, versão obsoleta, duplicidade e falha de rede.

## Limites preservados

- a conclusão do pré-cadastro não ativa matrícula, contrato, cobrança, agenda, plano ou liberação para treino;
- Anamnese e PAR-Q permanecem opcionais e não bloqueiam o cadastro básico;
- campos textuais de responsável não concedem acesso sem a relação de autorização;
- o frontend não persiste respostas do formulário em URL, query string ou `localStorage`;
- a landing pública não retorna CPF, e-mail, telefone, IDs internos, dados clínicos ou informações comerciais.

## Validação

1. migrations aplicadas em PostgreSQL pelo workflow oficial;
2. `pnpm type-check`;
3. `pnpm lint`;
4. `pnpm test`, incluindo teste de banco da issue 271;
5. `pnpm build`;
6. `pnpm arch:check`;
7. `pnpm access:check`;
8. `pnpm docs:check`;
9. auditoria funcional requisito a requisito;
10. auditoria visual independente em desktop e mobile;
11. higienização final do diff, incluindo remoção dos arquivos temporários de transporte e correção das consultas SQL de autorização do responsável.

## Entrega

- Branch: `feat/271-public-pre-registration`
- Pull request: #281
- Base: `develop`

A PR deve permanecer sem merge até autorização explícita.