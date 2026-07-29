# Plano: issue 275 — QA integrado e rollout da pré-matrícula

## Objetivo

Consolidar as entregas das issues #268 a #274 em um gate operacional verificável, adicionar desligamento controlado e observabilidade segura, e deixar o processo documentado para validação e publicação gradual.

## Contexto

As PRs das subissues foram incorporadas à `develop`. A issue #275 não deve reimplementar os domínios; deve validar as fronteiras integradas, fechar lacunas transversais e produzir evidências no SHA candidato.

Fontes principais:

- [`../../product/pre-registration.md`](../../product/pre-registration.md);
- [`../../architecture/pre-registration-api.md`](../../architecture/pre-registration-api.md);
- [`../../architecture/pre-registration-enrollment.md`](../../architecture/pre-registration-enrollment.md);
- [`../../operations/pre-registration-rollout-and-qa.md`](../../operations/pre-registration-rollout-and-qa.md).

## Fora de escopo

- envio automático de convite por WhatsApp ou e-mail;
- bloqueio comercial por Anamnese ou PAR-Q;
- reassociação automática de dados clínicos em consolidação;
- feature flag por tenant no mesmo processo de API;
- criação automática de contrato, cobrança, agenda ou plano;
- merge da PR.

## Arquivos e módulos principais

- `apps/api/src/common/pre-registration-rollout.ts`;
- `apps/api/src/common/pre-registration-safe-log.ts`;
- `apps/api/src/main.ts`;
- `apps/api/scripts/verify-issue-275-integrated-e2e.ts`;
- `apps/web/src/config/pre-registration-rollout.ts`;
- `apps/web/src/App.tsx`;
- `apps/web/src/layouts/DashboardLayout.tsx`;
- `docs/product/pre-registration.md`;
- `docs/architecture/pre-registration-api.md`;
- `docs/operations/pre-registration-rollout-and-qa.md`;
- `.github/workflows/issue-275-pre-registration-qa.yml`.

## Regras e restrições

- `contractId`, vínculo autenticado, `screenKey`, `blockKey` e `dataScope` continuam obrigatórios.
- Produção é fail-safe: flag ausente ou inválida mantém API e UI desabilitadas.
- Telemetria não inclui path, token, payload, usuário, tenant ou dado pessoal/clínico.
- Toda resposta inesperada `5xx` nos namespaces da pré-matrícula é normalizada na fronteira HTTP e recebe `correlationId`.
- Logs inesperados dentro da requisição são reduzidos a nome e código técnico allowlisted, mesmo quando um handler legado captura a exceção.
- Desligamento não apaga, converte ou revoga automaticamente registros.
- A evidência deve estar vinculada ao head/base/merge preview testados.
- Cenário classificado como E2E integrado deve atravessar as fronteiras aplicáveis: navegador, autenticação, HTTP, API, domínio e PostgreSQL; chamada direta de service permanece apenas evidência de integração interna.

## Passos de implementação

- [x] Confirmar que as subissues foram incorporadas à `develop`.
- [x] Mapear documentação, testes e workflows existentes.
- [x] Adicionar gate de rollout em todas as fronteiras HTTP.
- [x] Adicionar gate equivalente na navegação e nas rotas web.
- [x] Adicionar telemetria HTTP sanitizada e testes unitários.
- [x] Documentar produto, API, permissões, QA, rollout e rollback.
- [x] Adicionar workflow consolidado da issue #275.
- [x] Corrigir a matriz para exigir auditoria positiva, paginada, sanitizada e tenant-scoped.
- [x] Ampliar o backfill para o dataset representativo exigido e reexecução convergente.
- [x] Inspecionar privacidade no ciclo completo com telemetria ativa e política de referrer.
- [x] Adicionar gate executável de teclado, foco, labels, contraste, árvore acessível, zoom e teclado móvel.
- [x] Remediar o bypass de sanitização em handlers administrativos que consumiam exceções inesperadas.
- [x] Substituir o verificador integrado baseado em services por jornadas com API real e PostgreSQL.
- [x] Cobrir o fluxo básico por interface administrativa e pública, incluindo abertura da Central do Aluno com o mesmo ID.
- [x] Comprovar retomada em dois contextos isolados de navegador.
- [x] Adicionar controle negativo de `5xx` com segredo deliberado ausente da resposta e dos logs.
- [ ] Executar `pnpm validate` e verificadores especializados no CI do PR.
- [ ] Executar passagem adversarial no SHA final e remediar achados bloqueantes.
- [ ] Registrar resultado e mover este plano para `completed/` quando os gates estiverem aprovados.

## Critérios de aceite

- [x] API e web podem ser desligadas de forma controlada.
- [x] Produção não habilita o fluxo por ausência ou valor inválido da flag.
- [x] Rotas públicas preservam headers de segurança e CORS no estado desligado.
- [x] Menu administrativo não aparece quando a UI está desligada.
- [x] Testes cobrem defaults, valores explícitos e privacidade da métrica.
- [x] Documentação permanente descreve ciclo, APIs, permissões, QA, observabilidade e rollback.
- [x] A matriz de autorização não aceita ausência da rota de auditoria como sucesso.
- [x] O fixture de migration cobre aluno incompleto, múltiplos PAR-Q, tenants semelhantes, lead e processo em andamento.
- [x] Privacidade é inspecionada antes e depois do claim, com telemetria ativa e `Referer` sem token.
- [x] Acessibilidade possui evidência executável em mobile, desktop e zoom de 200%.
- [x] As sete famílias obrigatórias mantêm evidência pela API real e PostgreSQL.
- [x] O fluxo básico atravessa UI administrativa, UI pública, autenticação, API, persistência, conversão e Central do Aluno.
- [x] A retomada usa contextos de navegador independentes e recupera o estado persistido no servidor.
- [x] Erros inesperados não devolvem nem registram mensagem, detalhes ou payload bruto.
- [ ] `pnpm validate` passa no SHA candidato.
- [ ] Workflows especializados e consolidados passam no merge preview.
- [ ] Auditoria controller-adversarial não encontra ressalva bloqueante.
- [ ] Riscos conhecidos estão registrados na PR.

## Validação manual

1. Produção sem flags: menu ausente, página pública indisponível e APIs retornam `503` seguro.
2. Produção com flags verdadeiras: menu e rotas disponíveis conforme permissões.
3. Flag API falsa com UI verdadeira: browser recebe resposta CORS válida e mensagem operacional segura.
4. Usuário sem tela/bloco continua negado quando a UI está habilitada.
5. Logs da métrica contêm somente as seis chaves permitidas.
6. Desligar e reabilitar preserva convite e rascunho de teste.
7. Injetar falha inesperada com CPF, e-mail, token ou resposta clínica e confirmar que somente contrato genérico e `correlationId` são observáveis.
8. Iniciar o cadastro em um contexto de navegador, encerrá-lo e retomar em outro contexto autenticado na etapa persistida.

## Decisões e pendências

- O piloto por tenant não será simulado dentro de uma única instância; usar ambiente/instância separado até existir flag tenant-scoped.
- O rollback padrão é de aplicação e flag, sem reversão destrutiva de migrations.
- A fonte do SHA remoto foi materializada por artefato temporário do GitHub Actions para permitir validação local reproduzível; o workflow auxiliar será removido antes do freeze final.
- Os achados bloqueantes mais recentes foram tratados no mesmo ciclo: E2E de fronteira real e sanitização de exceções administrativas. Qualquer alteração posterior exige novo freeze e nova auditoria controller-adversarial.
