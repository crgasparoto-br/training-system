# Issue #248 — fluxo guiado de adipometria na web

## Objetivo

Substituir o placeholder de Adipometria por uma tela operacional conectada à API autoritativa entregue pela issue #247.

## Escopo entregue

- rota dedicada `AdipometryScreen` no submenu ADPT;
- seleção direta de aluno e preservação de `alunoId` recebido pela Central;
- abertura exata por `assessmentId`;
- rascunho, histórico, prévia, conclusão idempotente e correção por revisão;
- seleção explícita de protocolo aprovado e decisão clínica de sexo;
- peso, cinco dobras, observações e normalização decimal;
- ajuda técnica acessível para as cinco dobras;
- apoio opcional da Antropometria;
- estados de loading, vazio, erro, permissão e conflito;
- documentação e teste unitário dos contratos locais de entrada e ajuda.

## Arquivos principais

- `apps/web/src/pages/PhysicalAssessment/AdipometryScreen.tsx`
- `apps/web/src/pages/PhysicalAssessment/adipometry-ui.ts`
- `apps/web/src/services/adipometry.service.ts`
- `apps/web/src/pages/PhysicalAssessmentProtocol.tsx`
- `docs/product/adipometry-web.md`

## Decisões

1. O frontend não seleciona professor nem envia resultados derivados.
2. O protocolo é sempre uma escolha explícita entre opções retornadas pela API; não há fallback local.
3. O progresso é derivado de registros e prévias retornados pelo backend.
4. Qualquer edição invalida a prévia no navegador.
5. Conflitos não sobrescrevem valores locais sem decisão do usuário.
6. A ausência de Antropometria ou imagem de ajuda não bloqueia a coleta.

## Validação esperada

```bash
pnpm --filter @corrida/web test -- adipometry-ui.test.ts
pnpm --filter @corrida/web type-check
pnpm --filter @corrida/web lint
pnpm docs:check
pnpm validate
```

## Estado

Implementação preparada em branch própria, sem merge. A aprovação final depende de auditoria independente em contexto separado.
