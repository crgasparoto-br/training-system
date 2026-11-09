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