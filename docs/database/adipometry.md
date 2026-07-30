# Persistência de Adipometria (ADPT)

Este documento descreve a fundação histórica própria da ADPT. Registros genéricos de avaliação usados por outros módulos não substituem `AdipometryAssessment` e não são fonte primária deste domínio.

## Estruturas canônicas

- `AdipometryProtocol`: catálogo clínico versionado. A identidade é `(id, code, version)` e somente uma versão `APPROVED` pode sustentar conclusão.
- `AdipometrySequence`: contador transacional por `contractId` e `alunoId`.
- `AdipometryAssessment`: rascunho ou avaliação concluída, com cinco dobras tipadas, resultados derivados, protocolo e snapshot reproduzível.
- `AdipometryAuditEvent`: trilha append-only das criações, atualizações, conclusões e correções persistidas.

Os quatro modelos também existem em `apps/api/prisma/schema.prisma`, com relações inversas em contrato, aluno, professor, usuário e Antropometria de apoio. As regras que o Prisma não representa — checks, triggers, funções e índices parciais — permanecem nas migrations.

## Criação concorrente e código

A criação de rascunho deve chamar `createAdipometryDraft` dentro da transação da operação. O `UPSERT` da chave `(contractId, alunoId)` serializa criações concorrentes; se o insert da avaliação falhar, o incremento sofre rollback junto com a operação.

`formatAdipometryCode` usa largura **mínima** de três dígitos:

- `1` → `ADPT-001`;
- `999` → `ADPT-999`;
- `1000` → `ADPT-1000`.

A largura cresce com a sequência. A constraint `AdipometryAssessment_code_matches_sequence_check` impede gravar manualmente código incompatível com `sequenceNumber`.

## Isolamento multi-tenant

`contractId` é parte das chaves estrangeiras que vinculam:

- sequência e aluno;
- avaliação, aluno e professor;
- Antropometria de apoio, contrato e aluno;
- avaliação original e correção, no mesmo contrato e aluno;
- evento de auditoria e avaliação.

Assim, identificadores válidos de contratos diferentes não podem ser combinados. Consultas e mutações da API continuam obrigadas a filtrar `contractId`; as constraints são a última linha de defesa, não substituem autorização.

## Aprovação de protocolo

Uma versão somente pode receber estado `APPROVED` quando possui:

- referência, aprovador e data;
- população não vazia;
- dobras exigidas;
- unidades de entrada e saída;
- equações não vazias;
- limites, precisão e arredondamento;
- comportamento para dados ausentes;
- pelo menos um vetor de teste.

Depois de aprovada, a versão é imutável. Mudança clínica exige nova versão. Guedes permanece `DRAFT` e Slaughter permanece `DISABLED`; nenhum protocolo clínico real é aprovado pelas migrations.

## Rascunho e conclusão

Rascunhos podem estar incompletos, mas não persistem resultados derivados nem snapshot de cálculo. A conclusão exige, de forma conjunta:

- protocolo relacionado e aprovado;
- cinco dobras e peso válidos;
- total das dobras consistente;
- percentual de gordura, gordura absoluta e massa magra;
- conservação de massa dentro da tolerância documentada;
- snapshot estruturado com protocolo, data, perfil, entradas, regras, resultados, versão da implementação e timestamp;
- igualdade entre entradas/resultados persistidos e os valores do snapshot.

Registros concluídos são imutáveis pelo fluxo comum e não podem ser excluídos fisicamente.

## Correção e auditoria

Uma correção é uma nova avaliação `COMPLETED`, no mesmo contrato e aluno, com:

- `correctsAssessmentId` apontando para a versão vigente;
- motivo não vazio;
- autor pertencente ao contrato;
- snapshot e protocolo próprios.

O banco bloqueia autorreferência e segunda correção direta da mesma versão. Após a gravação, a versão original recebe `correctedByAssessmentId` na mesma transação. Se esse vínculo não puder ser estabelecido, toda a operação é revertida.

Triggers registram automaticamente:

- `DRAFT_CREATED`;
- `DRAFT_UPDATED`;
- `COMPLETED`;
- `CORRECTION_CREATED`;
- `CORRECTION_LINKED`.

Eventos de auditoria são append-only. Tentativas bloqueadas pela API devem ser registradas pela camada de serviço da issue #247, pois uma escrita de auditoria feita na mesma transação rejeitada também sofreria rollback.

## Implantação, dados existentes e rollback

As migrations são aditivas e não removem nem reinterpretam Antropometria, cadastro, anamnese, métricas ou avaliações existentes. O CI valida dois caminhos:

1. aplicação completa das migrations em banco vazio;
2. aplicação da migration de endurecimento sobre banco com dados legados e rascunho ADPT pré-existente, comprovando preservação das linhas.

Validações específicas:

```bash
bash scripts/verify-adipometry-migration-existing-data.sh
bash scripts/verify-adipometry-foundation.sh
```

O deploy executa `prisma migrate deploy` antes de iniciar a API. Rollback destrutivo não é automatizado; qualquer reversão após uso real exige backup, plano explícito e aprovação operacional.
