# Issue 274 — deduplicação, revisão e conversão

## Objetivo

Entregar a conversão do lead/pré-matrícula no mesmo registro canônico, com deduplicação em todos os pontos críticos, decisões auditáveis e confirmação transacional/idempotente.

O candidato válido é sempre o HEAD final da PR registrado no handoff. Este plano não fixa SHA intermediário.

## Escopo implementado

- contrato compartilhado de evidências, decisões e resultado;
- detector único, CPF com dígitos verificadores, telefone canônico com país/DDD, normalização de nomes e mascaramento administrativo;
- guardas antes de criação, registro/claim, edição administrativa, edição pública, revisão e ativação;
- projeção dos candidatos conforme `self`, `managed` ou `contract`, sem identificar registros restritos;
- decisões versionadas, com motivo, ator, fingerprint e expiração;
- conjunto completo de candidatos usado em classificação, fingerprint, autorização e bloqueio, inclusive acima de 25 registros;
- nome + nascimento normalizado com acentos, espaços e partículas portuguesas como revisão obrigatória;
- edição comercial revisável com preflight, confirmação versionada, motivo e auditoria transacional;
- compatibilidade da conta validada contra a identidade final do canônico antes da transferência;
- criação com falso positivo auditada na mesma transação e permitida somente com escopo sobre todos os candidatos;
- consolidação sem exclusão, vínculo estruturado `duplicado → canônico` e bloqueio de reassociação clínica insegura;
- redetecção do canônico após a consolidação, com fingerprint e versão próprios;
- revisão vinculada ao `onboarding.version`, inclusive para falso positivo confirmado durante a criação;
- trigger de invalidação após mudança de identidade, com bloqueio `NOWAIT`;
- renovação transacional da revisão quando um registro permanece `READY_FOR_ENROLLMENT` após invalidação;
- capacidade de confirmar matrícula ocultada enquanto não existir revisão vigente para a versão e fingerprint atuais;
- transições de descarte, prontidão e ativação centralizadas no domínio de ciclo do aluno;
- ativação serializável do mesmo ID, com revogação de convite;
- tela administrativa específica para os estados concluído e pronto, incluindo ação explícita para renovar revisão desatualizada;
- claim sem oráculo público, com rate limit antes da detecção transacional;
- classificação do claim consumida antes da resposta pública para criar pendência administrativa privada, auditável e idempotente;
- revalidação de bloco, tenant e escopo depois do lock e antes do commit;
- consentimento comparado à versão vigente;
- grafo canônico protegido contra cadeia, ciclo, atualização posterior e concorrência;
- invalidação da revisão por origem, responsável, unidade e observações;
- revisão administrativa completa, confirmação persistente e filtro de convertidos;
- documentação e testes de classificação, normalização, autorização, entrypoints, persistência pública, consolidação real em PostgreSQL e limites downstream.

## Remediação da auditoria independente

### A-001 — fronteira pública não enumerável

- salvamento com ou sem duplicidade retorna o mesmo `200`, mensagem e sessão;
- classificação, candidato, fingerprint e aviso não atravessam a rota pública;
- todas as respostas de sessão removem `duplicateWarnings`;
- teste HTTP compara integralmente os dois cenários.

### A-002 — preservação alcançável e completa

- o erro normal do detector aciona a preservação, sem depender de `P2002`;
- CPF, e-mail e telefone são cobertos;
- CPF bloqueante permanece bruto e não normalizado, permitindo continuidade e redetecção;
- `snapshotBefore` permanece imutável e `snapshotAfter` acompanha o rascunho mais recente;
- etapas posteriores continuam preservando o rascunho;
- `StudentProfileReview` e evento registram a pendência sem PII de terceiros;
- integração PostgreSQL comprova conclusão pública e bloqueio administrativo de `READY_FOR_ENROLLMENT`.

### A-003 — autorização de criação no commit

- `students.preRegistration.create`, tela, tenant e data scope são reconsultados dentro da transação serializável;
- o mesmo `TransactionClient` percorre toda a cadeia de autorização;
- linhas de professor, função e permissões são bloqueadas para linearizar revogação e criação;
- integração PostgreSQL comprova rollback quando a revogação concorrente vence e sucesso somente com permissão vigente.

### A-004 — evidência visual

- workflow `Issue 274 Visual Evidence` renderiza a rota real `/pre-matriculas/:id`;
- produz screenshots desktop, tablet, mobile e estado de erro;
- verifica ausência de overflow horizontal, conteúdo extremo, seções críticas, aviso de escopo, alerta de PAR-Q, árvore de acessibilidade e navegação por teclado;
- o artefato é vinculado ao SHA do workflow.

### A-005 — renovação da revisão invalidada

- uma alteração relevante continua invalidando `reviewedAt`, o ator da revisão e a versão anterior;
- `canConfirmEnrollment` exige `reviewedAt` e evento `ENROLLMENT_REVIEW` vinculados à versão e fingerprint atuais;
- um registro ainda em `READY_FOR_ENROLLMENT` recebe `canMarkReady` somente quando a revisão está desatualizada e a deduplicação está resolvida;
- a renovação revalida tenant, bloco de revisão, data scope, consentimento, campos obrigatórios, versão, fingerprint e decisão de duplicidade dentro de transação serializável;
- o status permanece `READY_FOR_ENROLLMENT`, sem transição artificial, e um novo evento auditável é criado;
- a interface oferece `Renovar revisão administrativa` com motivo obrigatório.

### A-006 — resultado da deduplicação no claim

- após o vínculo autenticado e antes da resposta pública, o detector canônico é executado em fronteira transacional com lock do aluno e onboarding;
- classificações `REVIEW_REQUIRED` e `BLOCKING` geram ou atualizam uma única `StudentProfileReview` pendente;
- o evento administrativo registra apenas classificação, campos, códigos de sinais, fingerprint e versão, sem IDs ou PII dos candidatos;
- retries atualizam a mesma pendência e não duplicam o evento da mesma versão/fingerprint;
- o corpo e o formato da resposta pública permanecem iguais ao claim sem duplicidade.

### AUD-274-14 — fechamento documental e regressão visual dependente

- o plano registra os runs e artefatos efetivamente aprovados no HEAD de remediação, sem manter portões concluídos como pendentes;
- o workflow visual legado da issue 270 recebeu um mock de compatibilidade para a consulta de `enrollment-review`, sem alterar regra de negócio;
- a regressão da issue 270 foi revalidada com sucesso no run `30312421292` do SHA `bf1536d4571a9535e730802f2e0e3d99340d5d18`;
- a auditoria controller-adversarial deste ciclo não substitui a auditoria independente exigida para o fechamento definitivo.

## Critérios de aceite

- [x] nome isolado não bloqueia;
- [x] CPF/conta incompatível bloqueiam;
- [x] resposta pública não revela candidatos nem permite distinção por status/corpo;
- [x] rascunho conflitante é preservado sem expor a causa;
- [x] decisão registra ator, motivo, versão persistida, fingerprint e validade;
- [x] decisão exige escopo sobre os cadastros relacionados;
- [x] consolidação não apaga, registra o vínculo canônico e não sobrescreve campo existente automaticamente;
- [x] origem consolidada não reaparece como bloqueio do canônico;
- [x] histórico clínico bloqueia consolidação não assistida;
- [x] alteração de identidade invalida revisão;
- [x] revisão invalidada em `READY_FOR_ENROLLMENT` pode ser renovada sem intervenção externa;
- [x] confirmação não é oferecida enquanto a revisão vigente estiver ausente;
- [x] deduplicação do claim produz pendência privada e auditável quando aplicável;
- [x] confirmação revalida no commit e é idempotente;
- [x] nenhum domínio posterior é criado automaticamente;
- [x] aluno ativo permanece localizável pelo filtro `Convertido`;
- [x] confirmação e próximas ações sobrevivem a reload da Central do Aluno;
- [x] `pnpm validate`, integração PostgreSQL e workflows remotos aprovados no SHA `bf1536d4571a9535e730802f2e0e3d99340d5d18` pelo run `30312421283`;
- [x] evidência visual aprovada e atestada no mesmo SHA pelo run `30312421273`, artefato `8670889026` e digest `sha256:cfb37526095b56e5b55cf08852e5c17c0812b72efe8ecb1796525602c57654cf`;
- [ ] auditoria independente aprovada em contexto separado.

## Validação obrigatória

1. `pnpm validate`.
2. `RUN_DATABASE_INTEGRATION_TESTS=true pnpm --filter @corrida/api test` no workflow com PostgreSQL.
3. Teste HTTP de não enumeração para respostas com e sem conflito.
4. Integração de preservação CPF/e-mail/telefone, continuidade das etapas e bloqueio de READY.
5. Integração de revogação/concessão do bloco de criação dentro da transação.
6. Integração A-005: marcar pronto, invalidar por alteração, negar confirmação, renovar revisão e ativar o mesmo ID.
7. Integração A-006: claim com duplicidade cria pendência privada; retry é idempotente; claim limpo preserva o mesmo formato público.
8. Workflow visual com três viewports, árvore de acessibilidade, screenshots e relatório JSON no SHA final.
9. Pré-auditoria interna adversarial.
10. Nova auditoria independente em conversa separada.

## Riscos e pendências

- A reassociação clínica automática permanece bloqueada até existir serviço de domínio específico por prontuário.
- A resposta pública é semanticamente uniforme; métricas operacionais não devem registrar identificadores ou classificações em logs acessíveis ao usuário.
- Este plano permanece ativo até auditoria independente do SHA final.
