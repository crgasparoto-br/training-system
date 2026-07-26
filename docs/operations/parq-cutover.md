# Cutover e reconciliação do PAR-Q

## Objetivo

Migrar o PAR-Q para o histórico canônico sem dual-write, perda de legado ou fabricação de evidência clínica.

## Migration

A migration `20260725201000_issue_273_canonical_parq`:

1. adiciona versão, contagem positiva, origem legada e chave de idempotência a `StudentParqSubmission`;
2. cria `StudentParqDraft`, `StudentParqProfessionalReview` e `StudentParqLegacyRecord`;
3. preserva cópias somente leitura das duas fontes legadas;
4. classifica cada legado como importável, incompatível, divergente ou sem evidência temporal;
5. importa apenas respostas semanticamente completas para a versão histórica conhecida;
6. cria pendências para submissões positivas válidas;
7. atualiza somente referências e estados resumidos no onboarding;
8. recalcula a projeção de pendência do aluno;
9. instala guardas de tenant em banco.

O SQL usa chaves únicas de origem e operações convergentes para permitir rerun sem duplicação.

## Regra de importação

Uma origem antiga só forma submissão histórica quando:

- contém exatamente `q1` a `q8` booleanos;
- `q8=true` sustenta a declaração do formulário antigo;
- há data de avaliação persistida que pode ser usada como `submittedAt`;
- não existe divergência concorrente não explicada entre as fontes na mesma data.

A importação registra `catalogVersion=parq-legacy-8-declaration-v1`, remove `q8` das respostas clínicas, usa `sourceType=system` e preserva `legacySourceType` e `legacySourceId`. Não fabrica usuário responsável, consentimento novo, observação profissional ou timestamp diferente da evidência disponível.

Legado incompleto, sem declaração, sem data ou divergente permanece em `StudentParqLegacyRecord`, não aparece como conclusão e produz `NEEDS_REPEAT` quando não existe submissão canônica válida.

## Compatibilidade após o corte

- o formulário administrativo de aluno não oferece etapa editável de PAR-Q;
- a Central do Aluno não reenvia `parqResponses` ao salvar outros dados;
- services antigos recusam gravação direta ou aninhada com HTTP 410 e código `LEGACY_WRITE_DISABLED`;
- PRNT, detalhes administrativos e pré-matrícula usam o mesmo service canônico;
- consultas antigas podem exibir legado somente como compatibilidade, nunca como última conclusão válida.

## Verificação operacional

Depois do deploy:

1. executar migrations antes de liberar a aplicação nova;
2. comparar contagens de `StudentParqLegacyRecord` por `migrationStatus`;
3. confirmar que toda submissão com `positiveCount > 0` possui revisão vinculada;
4. confirmar que não há onboarding com resposta clínica copiada;
5. repetir o verificador de migration para provar idempotência;
6. monitorar respostas `LEGACY_WRITE_DISABLED` para identificar clientes antigos ainda ativos;
7. manter o rollout da #275 responsável por confirmar convergência antes de remover compatibilidades de leitura.

Consultas úteis:

```sql
SELECT "migrationStatus", count(*)
FROM "StudentParqLegacyRecord"
GROUP BY "migrationStatus";

SELECT s.id
FROM "StudentParqSubmission" s
LEFT JOIN "StudentParqProfessionalReview" r ON r."submissionId" = s.id
WHERE s."positiveCount" > 0 AND r.id IS NULL;
```

## Rollback de aplicação

A migration não deve ser revertida apagando dados. Uma versão anterior da aplicação pode continuar lendo as tabelas existentes, mas suas escritas de PAR-Q precisam permanecer bloqueadas durante o rollback para evitar novo dual-write. Rascunhos e submissões novas devem ser preservados até a reaplicação da versão atual.


## Remediação da auditoria da issue 273

- O resumo administrativo usa somente estado, versão/data, contagem e situação de análise; respostas, itens positivos e observações permanecem no PRNT autorizado.
- A geração do rascunho é persistida mesmo após conclusão, impedindo que duas abas com a mesma geração concluam respostas diferentes.
- Reenvio da mesma `idempotencyKey` identifica a submissão original sem alterar a submissão mais recente.
- O consentimento de saúde é versionado no onboarding, registra aceite/revogação e bloqueia novas gravações até novo aceite válido.
- A projeção `parqRequiresProfessionalReview` é recalculada pela existência de qualquer revisão `PENDING`.
- O backfill valida tipos JSON booleanos, deduplica fontes equivalentes e preserva divergências contra submissões canônicas.
