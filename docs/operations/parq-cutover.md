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
- os contratos públicos de criação e edição não expõem `intakeForm.parqResponses`;
- a fronteira HTTP inspeciona o payload bruto e recusa escrita direta ou aninhada com HTTP 410 e código `LEGACY_WRITE_DISABLED`;
- detalhes administrativos recebem somente `ParqAdministrativeSummaryDTO` após sanitização recursiva;
- respostas clínicas são lidas do `preRegistrationParqService` somente em rotas protegidas por permissões de saúde;
- consultas antigas podem exibir legado apenas dentro de fluxos de migração ou compatibilidade interna, nunca como última conclusão válida.

## Verificação operacional

Depois do deploy:

1. executar migrations antes de liberar a aplicação nova;
2. comparar contagens de `StudentParqLegacyRecord` por `migrationStatus`;
3. confirmar que toda submissão com `positiveCount > 0` possui revisão vinculada;
4. confirmar que não há onboarding com resposta clínica copiada;
5. repetir o verificador de migration para provar idempotência;
6. monitorar respostas `LEGACY_WRITE_DISABLED` para identificar clientes antigos ainda ativos;
7. consultar as rotas administrativas com perfil que possua `students.details.summary`, mas não `students.details.health`, e confirmar ausência de `responses`, `positiveItems`, `reviewNotes`, `parqResponses` e `questionnaireParq`;
8. consultar o intake com permissão de saúde e confirmar que `questionnaires.parq` coincide com a última submissão canônica, mesmo quando os campos legados contêm valores diferentes;
9. manter o rollout da #275 responsável por confirmar convergência antes de remover compatibilidades internas de leitura.

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

## Evidência remota

Os workflows `Issue 273 Regression Evidence` e `Issue 273 Runtime Diagnostic` devem operar com `contents: read`, no merge preview da PR, sem branch fixa, commit, push ou mascaramento de exit code.

Antes do verificador PostgreSQL, ambos compilam `@corrida/types` e `@corrida/utils`; isso garante que os exports ESM apontados para `dist/index.js` existam no runner. Falha no verificador deve falhar o job. Logs são publicados como artefatos temporários, nunca versionados na branch.

## Rollback de aplicação

A migration não deve ser revertida apagando dados. Uma versão anterior da aplicação pode continuar lendo as tabelas existentes, mas suas escritas de PAR-Q precisam permanecer bloqueadas durante o rollback para evitar novo dual-write. Rascunhos e submissões novas devem ser preservados até a reaplicação da versão atual.

## Remediação da auditoria da issue 273

- O resumo administrativo usa somente estado, versão/data, contagem e situação de análise; respostas, itens positivos e observações permanecem no PRNT autorizado.
- A geração do rascunho é persistida mesmo após conclusão, impedindo que duas abas com a mesma geração concluam respostas diferentes.
- Reenvio da mesma `idempotencyKey` identifica a submissão original sem alterar a submissão mais recente.
- O consentimento de saúde é versionado no onboarding, registra aceite/revogação e bloqueia novas gravações até novo aceite válido.
- A projeção `parqRequiresProfessionalReview` é recalculada pela existência de qualquer revisão `PENDING`.
- O backfill valida tipos JSON booleanos, deduplica fontes equivalentes e preserva divergências contra submissões canônicas.
- As rotas administrativas passam por um adaptador de saída que remove representações clínicas legadas e injeta apenas o DTO autorizado.
- As rotas antigas de escrita devolvem HTTP 410 na fronteira pública, inclusive para payload escondido em `formResponses`.
- Os workflows da issue são somente leitura e propagam falhas reais do verificador.
