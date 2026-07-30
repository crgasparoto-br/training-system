# Persistência de Adipometria (ADPT)

Este documento descreve a fundação histórica própria da ADPT. Registros genéricos de avaliação usados por outros módulos não substituem `AdipometryAssessment` e não são fonte primária deste domínio.

## Estruturas canônicas

- `AdipometryProtocol`: catálogo clínico versionado. A identidade é `(id, code, version)` e somente uma versão `APPROVED` pode sustentar conclusão.
- `AdipometrySequence`: contador transacional por `contractId` e `alunoId`.
- `AdipometryAssessment`: rascunho ou avaliação concluída, com cinco dobras tipadas, resultados derivados, protocolo e snapshot reproduzível.
- `AdipometryAuditEvent`: trilha append-only das criações, atualizações, conclusões e correções persistidas.

Os quatro modelos também existem em `apps/api/prisma/schema.prisma`, com relações inversas em contrato, aluno, professor, usuário e Antropometria de apoio. As regras que o Prisma não representa — checks, triggers, funções e índices parciais — permanecem nas migrations.

## Criação concorrente e código

A criação de rascunho deve chamar a sobrecarga explícita de `createAdipometryDraft` dentro da transação da operação, informando o usuário autenticado do backend. O `UPSERT` da chave `(contractId, alunoId)` serializa criações concorrentes; se o insert da avaliação falhar, o incremento sofre rollback junto com a operação.

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

## Aprovação e desativação de protocolo

Uma versão somente pode receber estado `APPROVED` quando `isValidAdipometryProtocolDefinition` confirma um contrato clínico completo e versionado, incluindo:

- `schemaVersion` igual ou superior a `2`;
- população com faixa etária, sexo e maturação;
- exatamente as cinco dobras canônicas;
- unidades por entrada e saída;
- três árvores de equação executáveis para percentual de gordura, gordura absoluta e massa magra;
- limites de bloqueio por entrada e coleção explícita de alertas;
- precisão e arredondamento;
- comportamento estruturado para dados ausentes e incompatíveis;
- no mínimo dois vetores distintos com resultados e tolerâncias não negativas, limitadas à menor unidade da precisão de resultado;
- aprovação com identificador, aprovador, instante com fuso e SHA-256 do artefato;
- referência não vazia.

`evaluateAdipometryExpression` executa uma linguagem JSON restrita com constantes, variáveis, soma, subtração, multiplicação, divisão, potência, negação e condição por igualdade. `evaluateAdipometryProtocolVector` calcula o total das cinco dobras, executa as três equações em ordem e devolve os quatro resultados canônicos.

`isValidAdipometryExpression` valida recursivamente todas as ramificações, a ordem das três saídas e a lista de variáveis permitidas, inclusive caminhos não selecionados pelos vetores. O gate executa cada vetor antes de aceitar `APPROVED`. Expressão textual, operador desconhecido, variável ausente, divisão por zero, saída duplicada, vetor repetido, perfil fora da população, medida fora dos limites, tolerância excessiva ou negativa, ou resultado divergente rejeitam a aprovação. A validação não trata texto descritivo como fórmula.

O instante `clinicalApproval.approvedAt` deve conter `Z` ou offset explícito. O JSON é convertido para UTC e comparado com a coluna histórica como `TIMESTAMP(3)` sem depender do `TimeZone` da sessão. A função de validação é `STABLE`, não `IMMUTABLE`, porque processa um instante com fuso.

A definição clínica aprovada é imutável. A única alteração permitida é a transição operacional `APPROVED → DISABLED`, mantendo definição, referência e aprovação intactas. `DISABLED` é terminal: não pode ser reativado, alterado ou excluído. Avaliações históricas que usaram a versão permanecem válidas, mas novas conclusões são bloqueadas.

Guedes permanece `DRAFT` e Slaughter permanece `DISABLED`; nenhum protocolo clínico real é aprovado pelas migrations.

## Ator transacional e auditoria

A autoria do evento deve representar quem executou a operação, não o professor responsável pelo atendimento.

- A API define `app.adipometry_actor_user_id` com `set_config(..., true)` dentro da mesma transação da escrita; ou usa a sobrecarga explícita de `createAdipometryDraft` que recebe o ator.
- `requireAdipometryActorUserId` confirma que o usuário está ativo e vinculado como colaborador do mesmo contrato.
- O ator de correção deve coincidir com `correctionAuthorUserId`.
- O frontend não envia nem escolhe o ator.
- As sobrecargas legadas sem ator tiveram `EXECUTE` removido de `PUBLIC`; permanecem apenas para o proprietário do banco executar migrations e fixtures antigas.
- Papéis de aplicação sem contexto de ator recebem `ADIPOMETRY_ACTOR_REQUIRED` antes da mutação.

Triggers registram automaticamente:

- `DRAFT_CREATED`;
- `DRAFT_UPDATED`;
- `COMPLETED`;
- `CORRECTION_CREATED`;
- `CORRECTION_LINKED`.

Eventos de auditoria são append-only. Tentativas bloqueadas pela API devem ser registradas pela camada de serviço da issue #247, pois uma escrita de auditoria feita na mesma transação rejeitada também sofreria rollback.

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

## Correção

Uma correção é uma nova avaliação `COMPLETED`, no mesmo contrato e aluno, com:

- `correctsAssessmentId` apontando para a versão vigente;
- motivo não vazio;
- autor autenticado pertencente ao contrato;
- snapshot e protocolo próprios.

O banco bloqueia autorreferência e segunda correção direta da mesma versão. Após a gravação, a versão original recebe `correctedByAssessmentId` na mesma transação. Se esse vínculo não puder ser estabelecido, toda a operação é revertida.

`correctedByAssessmentId` é campo gerenciado pelo banco: inserts com vínculo predefinido, atualizações de rascunho, remoção do vínculo e associações sem uma correção concluída e recíproca são rejeitados.

## Implantação, dados existentes e rollback

As migrations são aditivas e não removem nem reinterpretam Antropometria, cadastro, anamnese, métricas ou avaliações existentes. O CI valida:

1. aplicação completa das migrations em banco vazio;
2. preservação de dados e rascunho ADPT durante o endurecimento incremental;
3. banco construído apenas com migrations anteriores à ADPT, populado com dados legados e atualizado pela cadeia ADPT completa na ordem real;
4. equações executáveis, validação recursiva e vetores discriminantes;
5. normalização UTC em sessões com fusos diferentes;
6. autoria explícita diferente do professor responsável;
7. bloqueio de papel de aplicação sem ator;
8. concorrência, rollback, `ADPT-1000`, imutabilidade, correção e isolamento.

Validações específicas:

```bash
bash scripts/verify-adipometry-migration-existing-data.sh
bash scripts/verify-adipometry-migration-full-chain.sh
bash scripts/verify-adipometry-foundation-v2.sh
bash scripts/verify-adipometry-protocol-validator.sh
```

Os scripts legados `verify-adipometry-foundation.sh` e `verify-adipometry-audit-remediation.sh` delegam ou reutilizam a verificação v2 para preservar compatibilidade sem duplicar o gate no mesmo workflow.

O deploy executa `prisma migrate deploy` antes de iniciar a API. Rollback destrutivo não é automatizado; qualquer reversão após uso real exige backup, plano explícito e aprovação operacional.
