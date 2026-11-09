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