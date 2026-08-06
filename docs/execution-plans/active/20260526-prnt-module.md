# Plano: Modulo PRNT

## Objetivo

Implementar o PRNT como modulo novo para prontuario de entrevista e acompanhamento, com historico proprio, controle fino por bloco, historico de PAR-Q e snapshots de desconforto corporal.

## Contexto

- O PRNT nao deve usar `AlunoIntakeForm.formResponses` como fonte principal.
- A tela alvo e `/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento`.
- O mapa `BodyDiscomfortMap` sera reaproveitado sem remover o mapa corporal atual do sistema.
- Dados antigos de `Desconfortos` nao serao migrados.
- O PAR-Q passa a ter submissoes historicas; o PRNT le a mais recente e mostra apenas itens positivos.

## Fora de escopo

- Migracao de dados antigos de desconfortos.
- Substituicao do mapa corporal existente por outro componente.
- Mudancas no fluxo publico/mobile do aluno alem do registro historico de PAR-Q quando a API receber nova submissao.

## Arquivos e modulos principais

- `apps/api/prisma/schema.prisma`
- `prisma/schema.prisma`
- `apps/api/src/modules/prontuario/*`
- `apps/api/src/main.ts`
- `packages/types/*`
- `apps/web/src/pages/PhysicalAssessment/*`
- `apps/web/src/services/prontuario.service.ts`
- `apps/web/src/pages/AlunoForm.tsx`

## Regras e restricoes

- `contractId` deve ser respeitado em consultas multi-tenant.
- Permissoes devem usar `screenKey`, `blockKey` e `dataScope` quando aplicavel.
- Cada bloco do PRNT deve ter `blockKey` especifico no catalogo compartilhado.
- Novos envios de PAR-Q criam novas submisssoes sem apagar acompanhamentos antigos.
- A API deve validar `screenKey` e `blockKey` antes de retornar ou alterar dados do PRNT.
- A interface deve apresentar um unico fluxo de edicao para casos de dor e desconfortos, evitando editores duplicados na mesma rota.

## Passos de implementacao

- [x] Modelar Prisma, migration e relacoes.
- [x] Adicionar tipos compartilhados e catalogo de acesso.
- [x] Criar services e rotas da API para PRNT e PAR-Q historico.
- [x] Criar service e tela dedicada no web.
- [x] Reaproveitar `BodyDiscomfortMap` para snapshots.
- [x] Remover aba `Desconfortos` do cadastro do aluno.
- [x] Consolidar o acompanhamento de dores e desconfortos no fluxo principal do PRNT.
- [x] Atualizar docs de produto/arquitetura quando necessario.
- [x] Executar validacoes possiveis.

## Criterios de aceite

- [ ] Testes relevantes foram adicionados ou atualizados.
- [x] Documentacao foi atualizada.
- [x] `pnpm validate` passa ou bloqueios ficam registrados.
- [ ] Riscos conhecidos foram registrados no PR.

## Validacao manual

- Abrir `/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento`.
- Selecionar um aluno, criar um registro PRNT e salvar blocos.
- Confirmar que casos de dor e desconfortos aparecem em um unico fluxo de edicao, sem painel duplicado abaixo da tela.
- Salvar snapshot de desconforto pelo mapa corporal.
- Registrar novo PAR-Q e confirmar que a tela exibe somente respostas positivas mais recentes.
- Confirmar que acompanhamentos antigos continuam visiveis mesmo apos novo envio de PAR-Q.
- Confirmar que blocos somem ou bloqueiam quando a permissao e removida.

## Decisoes e pendencias

- O PRNT tera historico proprio por `ProntuarioRecord`.
- `AlunoIntakeForm.formResponses` permanece apenas como legado do cadastro.
- Type-check da API ainda possui falhas preexistentes fora do PRNT em agenda e auditoria.
