# Arquitetura da revisão e conversão de pré-matrícula

## Fronteiras

- `packages/types/pre-registration-enrollment.ts`: contrato compartilhado da revisão, evidências mascaradas, decisões e ativação.
- `apps/api/src/modules/pre-registration-enrollment`: detector canônico, guardas de entrypoint, projeção por escopo, resolução, revisão e confirmação transacional.
- `apps/api/src/modules/pre-registration-public/pre-registration-public-atomic.service.ts`: aplica o detector dentro da transação de identificação/contato público, antes da persistência.
- `apps/api/src/modules/pre-registration-public/pre-registration-duplicate-review.service.ts`: preserva internamente rascunhos com conflito, mantém a pendência administrativa e projeta a sessão pública sem sinais de existência de terceiros.
- `apps/api/src/modules/pre-registration-public/pre-registration-public.service.ts`: aplica o detector no claim, depois do lock do convite e antes de qualquer vínculo; o resultado não cria uma resposta pública diferenciada.
- `apps/web/src/pages/PreRegistrationAdmin/PreRegistrationEnrollmentDetail.tsx`: experiência administrativa; não contém regra de segurança.
- `Aluno.canonicalAlunoId`: vínculo estruturado e não público do registro descartado para o canônico; candidatos já resolvidos deixam de participar de novas detecções.
- `StudentProfileReview`: rascunho versionado e privado dos identificadores que ainda dependem de resolução administrativa. `snapshotBefore` é imutável durante a pendência e `snapshotAfter` acompanha o último rascunho.
- `StudentLifecycleEvent`: trilha imutável de decisões, fingerprints específicos da origem e do canônico, versão revisada, ator e consolidação.
- `StudentOnboardingProcess.version`: token otimista que invalida revisão quando a identidade muda.

## Invariantes

1. Toda consulta e mutação filtra `contractId`.
2. Candidatos de outro tenant nunca são consultados ou revelados.
3. Candidatos fora do escopo `self`, `managed` ou `contract` do ator não são identificados na resposta; somente uma contagem restrita pode ser exibida.
4. A resposta pública não inclui pessoa, contato, CPF, candidato, fingerprint, classificação, aviso de duplicidade nem código distinto. Salvar uma etapa com ou sem candidato retorna o mesmo status, mensagem e formato de sessão.
5. O backend revalida permissão, escopo de dados, versão, estado e deduplicação no commit.
6. A criação e a edição administrativa com falso positivo exigem fingerprint, versão e motivo atuais e registram a decisão na mesma transação da gravação.
7. Consolidação não exclui registros e não move dados clínicos sem serviço transacional específico.
8. O registro descartado aponta para um canônico do mesmo `contractId`; o banco serializa o grafo por tenant e rejeita autorreferência, destino cross-tenant, cadeia, ciclo e transformação posterior de um destino referenciado em origem.
9. A auditoria do canônico é recalculada depois do vínculo e nunca reutiliza fingerprint ou versão da origem.
10. Ativação altera somente ciclo, timestamps, convite e auditoria; domínios posteriores permanecem independentes.
11. As rotas administrativas autoritativas são montadas antes das rotas legadas para impedir bypass.
12. Rate limit, autenticação e validação pública executam antes de qualquer consulta sensível; não existe guard público de deduplicação que responda de forma distinta.
13. Bloco de ação, tela, tenant e escopo de dados são reconsultados na mesma transação, depois do lock e antes da mutação. Isso inclui o bloco `students.preRegistration.create`.
14. Classificação, fingerprint, autorização e bloqueio usam o conjunto completo de candidatos; nenhuma paginação ou limitação visual reduz a decisão.
15. Antes de transferir uma conta ao canônico, a compatibilidade é reavaliada contra a identidade final do destino, dentro da mesma transação.
16. Um CPF bloqueante preservado pelo fluxo público nunca ocupa `leadCpfNormalized`. O CPF canônico anterior é removido, o novo valor bruto fica em `Aluno.leadCpf` e os valores anterior/novo permanecem em `snapshotBefore`/`snapshotAfter`, permitindo redetecção administrativa sem violar a restrição única.
17. Enquanto existir revisão pendente, etapas posteriores continuam pela fronteira de preservação para não apagar o identificador bloqueante. Um identificador corrigido e não conflitante encerra a pendência sem apagar seu histórico.
18. A criação bloqueia as linhas do professor, da função e das permissões de tela/bloco antes da decisão. Revogação já iniciada vence e causa rollback; revogação posterior aguarda o commit da criação.
19. Origem/responsável e unidade/observações podem ser persistidos em projeções diferentes, mas invalidam `StudentOnboardingProcess.version` uma única vez por transação e também antes da primeira revisão administrativa.

## Fronteira pública não enumerável

A detecção continua obrigatória antes da escrita de identificação e contato. Quando houver `BLOCKING` ou `REVIEW_REQUIRED`, a transação normal é revertida e a rota executa a preservação controlada:

1. bloqueia e reautoriza o onboarding;
2. reexecuta o detector canônico;
3. persiste campos seguros;
4. remove o CPF canônico anterior e mantém o novo CPF bloqueante somente como valor bruto não normalizado;
5. cria ou atualiza `StudentProfileReview`, preservando o `snapshotBefore` original e atualizando somente o `snapshotAfter`;
6. avança a etapa e incrementa a versão;
7. recarrega e projeta a sessão, removendo `duplicateWarnings` e qualquer detalhe de classificação.

A mesma projeção é usada em `GET session`, salvamento e conclusão. A causa fica disponível apenas no fluxo administrativo autenticado e autorizado.

## Concorrência

Criação revisada, edição administrativa, revisão, consolidação, preservação pública e confirmação usam isolamento `SERIALIZABLE`. As transições de ciclo e a edição pública bloqueiam o processo antes da verificação. A deduplicação pública ocorre após autorização e bloqueio do onboarding e antes de `upsertStudentIdentity`, eliminando a janela entre checagem e gravação.

A transição usa condição no estado atual. Em conflito, a transação é revertida e o frontend recarrega versão e fingerprint. Leituras de tela, bloco e data scope recebem o mesmo `TransactionClient` da mutação. A criação usa `FOR SHARE` nas linhas de professor, função e permissões relevantes para estabelecer um ponto de linearização com revogações concorrentes.

## Invalidação de revisão

A migration `20260727170000_issue_274_audit_hardening` amplia a invalidação para origem, responsável comercial, unidade e observações, além dos identificadores. A migration `20260728021500_issue_274_review_invalidation_once` mantém o gatilho de `Aluno` para sua projeção e integra a limpeza da revisão ao gatilho canônico `StudentProfile_bump_pre_registration_version`, que já governa alterações de `identificationData`. Ambos usam o mesmo marcador local à transação por aluno: a primeira superfície aplicável incrementa a versão e limpa a revisão; a segunda reconhece o marcador e não repete o incremento. Isso cobre `reviewedAt` nulo, preserva o comportamento anterior à conclusão e evita versão dupla em edições combinadas.

`READY_FOR_ENROLLMENT` compara a versão persistida do aceite à `PRIVACY_NOTICE_VERSION` vigente. Uma versão antiga presente é insuficiente. Qualquer pendência bloqueante preservada continua visível ao detector pelo valor bruto e impede `READY_FOR_ENROLLMENT` até a resolução.
