# Issue 270 — gestão administrativa de leads e pré-matrículas

## Objetivo

Entregar um fluxo administrativo próprio para entrada de leads, geração de convites de pré-cadastro, acompanhamento de progresso, revisão e preparação da matrícula, sem misturar registros não ativos com a Central do Aluno.

## Escopo implementado

- rotas recarregáveis de lista, criação, detalhe e edição comercial;
- busca, filtros, ordenação e paginação no backend;
- escopo de dados por responsável, equipe gerenciada ou contrato;
- permissões granulares para criação, edição, convite, revogação, revisão, descarte/reabertura e conversão;
- deduplicação tenant-scoped por CPF, e-mail e telefone;
- criação mínima de lead com nome, origem e telefone ou e-mail;
- integração com o ciclo de vida e com os convites de pré-cadastro existentes;
- progresso resumido, pendências por nome e histórico administrativo;
- observações comerciais e unidade mantidas na projeção administrativa do perfil canônico;
- descarte, reabertura e revisão com motivo/referências auditáveis;
- interface responsiva com tabela compacta no desktop e cartões no mobile.

## Limites

- respostas de anamnese, saúde e PAR-Q não são retornadas pela API administrativa nem exibidas na interface;
- a contratação e a ativação continuam no fluxo de matrícula existente;
- o link bruto do convite só é exibido na resposta de geração ou regeneração e não é recuperável depois.

## Validação prevista

1. `pnpm type-check`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm build`
5. `pnpm arch:check`
6. `pnpm access:check`
7. `pnpm docs:check`
8. auditoria funcional requisito a requisito
9. auditoria visual independente nas larguras desktop e mobile
10. higienização final do diff

## Entrega

Branch: `feat/270-pre-registration-admin`

Pull request: #280

A pull request deve permanecer sem merge até autorização explícita.
