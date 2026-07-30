# Issue 246 - Fundação histórica e persistência da Adipometria

## Objetivo

Entregar a base canônica e não destrutiva da Adipometria: protocolo versionado, contratos compartilhados, modelos Prisma, migration, sequência concorrente, snapshot e correção auditável.

## Contexto

A issue #246 é a primeira entrega da epic #245. A fonte funcional menciona Guedes e Slaughter sem definição clínica suficiente para habilitar cálculo. A implementação estrutural deve avançar sem inventar fórmula e deve deixar a finalização bloqueada até aprovação clínica.

## Arquivos e modulos principais

- `docs/product/adipometry-protocol.md`
- `packages/types/adipometry.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260730070000_issue_246_adipometry_foundation/migration.sql`
- `apps/api/src/modules/adipometry/adipometry-foundation.test.ts`
- `docs/architecture/database.md`
- `docs/README.md`

## Estratégia

1. Registrar Guedes como `draft` e Slaughter como `disabled`, sem equações inventadas.
2. Persistir avaliação, sequência e auditoria em tabelas próprias, isoladas por `contractId`.
3. Reservar código em função SQL atômica e transacional.
4. Bloquear conclusão incompleta, vínculos cross-tenant e mutação/exclusão de concluída no banco.
5. Modelar correção como nova avaliação vinculada, preservando a original.
6. Expor contratos compartilhados que não aceitam resultados derivados em payloads de escrita.
7. Manter API HTTP, autorização, cálculo e interface fora desta entrega.

## Criterios de aceite

- Fonte canônica define estados, gate de aprovação, snapshot, correção e sequência.
- Nenhum protocolo incompleto fica disponível para finalização.
- Prisma representa sequência, avaliação histórica, resultados, snapshot, correção e auditoria.
- Migration é aditiva e preserva domínios existentes.
- Código é único por contrato/aluno, concorrente e continua após `ADPT-999`.
- Banco bloqueia avaliação concluída sem entradas/resultados/protocolo/snapshot completos.
- Banco bloqueia update/delete de avaliação concluída.
- Referência à Antropometria e vínculos de aluno/professor/auditoria não cruzam tenant.
- Contratos compartilhados cobrem resumo, detalhe, protocolo, rascunho, prévia, finalização, correção, comparação e referência antropométrica.
- `pnpm validate` e migration deploy passam no CI.

## Validacao manual

- Aplicar migrations em PostgreSQL vazio.
- Confirmar que todas as migrations anteriores continuam aplicáveis.
- Reservar códigos para dois contratos e dois alunos e verificar sequências independentes.
- Executar duas reservas concorrentes para o mesmo contrato/aluno e verificar números distintos.
- Forçar `lastValue = 999` e confirmar retorno `ADPT-1000`.
- Tentar concluir registro incompleto e esperar constraint.
- Tentar usar aluno, professor, auditor ou Antropometria de outro contrato e esperar bloqueio.
- Tentar atualizar ou excluir avaliação concluída e esperar bloqueio.
- Criar correção válida e confirmar que o original permanece inalterado.

## Pendências explícitas

- Aprovação clínica de fórmula, referência, população, limites, precisão, arredondamento, vetores e responsável.
- Implementação de serviços, endpoints, cálculo e autorização na #247.
- Fluxo de coleta e ajuda técnica na #248.
- Resumo e comparação na Central do Aluno na #249.
