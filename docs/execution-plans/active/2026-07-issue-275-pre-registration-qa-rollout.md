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
- `apps/api/src/main.ts`;
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
- Desligamento não apaga, converte ou revoga automaticamente registros.
- A evidência deve estar vinculada ao head/base/merge preview testados.

## Passos de implementação

- [x] Confirmar que as subissues foram incorporadas à `develop`.
- [x] Mapear documentação, testes e workflows existentes.
- [x] Adicionar gate de rollout em todas as fronteiras HTTP.
- [x] Adicionar gate equivalente na navegação e nas rotas web.
- [x] Adicionar telemetria HTTP sanitizada e testes unitários.
- [x] Documentar produto, API, permissões, QA, rollout e rollback.
- [ ] Adicionar workflow consolidado da issue #275.
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

## Decisões e pendências

- O piloto por tenant não será simulado dentro de uma única instância; usar ambiente/instância separado até existir flag tenant-scoped.
- O rollback padrão é de aplicação e flag, sem reversão destrutiva de migrations.
- O ambiente local desta execução não conseguiu resolver `github.com`; validações executáveis serão realizadas pelo GitHub Actions e registradas na PR.
