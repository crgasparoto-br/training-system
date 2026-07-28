# Rollout e QA da pré-matrícula

Este runbook governa a validação integrada, a habilitação gradual, a observação e o rollback do processo de pré-matrícula.

## Condições para iniciar

Antes de habilitar o fluxo em um ambiente:

- migrations de #268 a #274 aplicadas com sucesso;
- `pnpm validate` aprovado no mesmo SHA candidato;
- verificadores de Anamnese e PAR-Q aprovados em PostgreSQL limpo e em base com dados legados representativos;
- fluxos administrativos e públicos validados com usuários e tenants de teste;
- aviso de privacidade publicado em HTTPS e versão configurada;
- matriz de permissões revisada para os perfis do ambiente;
- responsável operacional e janela de observação definidos;
- nenhuma evidência contém token real, CPF, e-mail, telefone ou resposta clínica.

## Flags

API:

- `PRE_REGISTRATION_ENABLED`: habilita todas as fronteiras públicas, autenticadas e administrativas. Em `NODE_ENV=production`, ausência ou valor inválido significa desabilitado.
- `PRE_REGISTRATION_TELEMETRY_ENABLED`: habilita a métrica HTTP técnica agregada. O padrão é habilitado.

Frontend:

- `VITE_PRE_REGISTRATION_ENABLED`: inclui as rotas e a navegação utilizáveis no build. Em build de produção, ausência ou valor inválido significa desabilitado.

API e frontend devem usar o mesmo estado. Durante um desligamento emergencial, desabilite primeiro a API; depois publique o frontend sem o menu. Convites e rascunhos permanecem persistidos.

## Ordem de deploy

1. Fazer backup recuperável do banco conforme a política do ambiente.
2. Publicar a API com migrations aplicadas e `PRE_REGISTRATION_ENABLED=false`.
3. Confirmar `/health`, migrations e inicialização sem erro.
4. Executar a suíte de smoke e as consultas de consistência do ambiente.
5. Publicar o frontend com `VITE_PRE_REGISTRATION_ENABLED=false`.
6. Habilitar a API para o grupo piloto: `PRE_REGISTRATION_ENABLED=true`.
7. Publicar o frontend piloto com `VITE_PRE_REGISTRATION_ENABLED=true`.
8. Executar os cenários críticos abaixo.
9. Observar erros, latência, conflitos e volume de convites durante a janela definida.
10. Ampliar o uso somente após registrar as evidências e aprovar o go/no-go.

A flag controla a disponibilidade técnica do ambiente. Segmentação por tenant ou grupo piloto deve ser operacional, usando ambientes/instâncias separados, até existir uma flag tenant-scoped explícita.

## Cenários E2E obrigatórios

### Fluxos principais

- lead criado apenas com telefone;
- lead criado apenas com e-mail;
- convite gerado, copiado e aberto;
- conta nova criada e convite reivindicado;
- conta existente compatível reivindica o convite;
- etapas básicas salvas e retomadas em outro navegador/dispositivo;
- consentimento vigente aceito e pré-cadastro básico concluído;
- revisão administrativa vigente concluída;
- matrícula confirmada no mesmo `Aluno.id`;
- convite revogado após ativação;
- ausência de criação automática de contrato, cobrança, agenda ou plano.

### Fluxo completo de saúde

- Anamnese iniciada, salva por etapa, retomada e concluída;
- PAR-Q carregado pelo catálogo vigente, salvo e concluído;
- resposta positiva cria pendência de análise profissional;
- matrícula comercial continua possível com pendência clínica;
- dados clínicos completos não aparecem na listagem comercial.

### Convites e retomada

- token inválido, expirado, revogado e substituído têm resposta pública indistinguível;
- regenerar o convite A produz B e invalida A;
- repetir revogação de A não revoga B;
- primeiro acesso concorrente gera somente o evento permitido;
- rascunho salvo antes da regeneração continua vinculado ao processo autenticado correto.

### Duplicidade

- mesmo CPF no mesmo tenant exige decisão compatível com a política;
- mesmo CPF em tenants distintos não vaza nem bloqueia indevidamente;
- telefone compartilhado cria candidato revisável, não consolidação silenciosa;
- resposta pública permanece idêntica com e sem candidato;
- falso positivo exige versão, fingerprint e motivo atuais;
- alteração de identidade invalida a revisão anterior;
- origem com vínculo operacional ou clínico retorna `HEALTH_REASSOCIATION_REQUIRED` sem perda de dados.

### Concorrência e idempotência

- dois salvamentos com a mesma versão produzem um vencedor e um conflito recuperável;
- dois claims concorrentes deixam somente um vínculo válido;
- revogação e abertura concorrentes respeitam o lock e a revalidação;
- revisão e alteração de identidade concorrentes não ativam versão obsoleta;
- duas confirmações de matrícula deixam um único estado final e uma trilha coerente;
- repetição segura de requisição concluída não cria evento ou registro duplicado.

## Segurança e privacidade

Validar negativamente:

- acesso sem autenticação a rotas autenticadas;
- usuário autenticado não vinculado ao processo;
- perfil sem `students.preRegistration`;
- perfil com tela e sem o bloco específico da ação;
- aluno fora do `dataScope` do professor;
- identificador de outro tenant em leitura e mutação;
- alteração manual de `contractId`, `alunoId`, versão, fingerprint ou estado;
- payload excessivo ou JSON inválido no namespace público;
- métodos e sufixos de rota não previstos;
- origem CORS não permitida;
- brute force dentro e acima da janela do rate limit.

Inspecionar respostas, logs, traces, analytics e screenshots. Eles não podem conter:

- token bruto ou URL completa do convite;
- CPF, e-mail, telefone ou endereço sem necessidade e permissão;
- corpo da Anamnese ou respostas do PAR-Q;
- dados de outro tenant;
- conteúdo do request em erros inesperados;
- segredos ou credenciais de ambiente.

Use apenas dados sintéticos. Redija tokens e contatos antes de anexar evidências.

## Permissões

Validar cada ação com quatro perfis mínimos:

1. sem acesso à tela;
2. somente consulta;
3. consulta com um subconjunto de blocos;
4. administrador autorizado no mesmo tenant.

Repetir os testes com registro fora do `dataScope` e registro de outro tenant. A API deve negar sem persistência parcial, mesmo quando a UI não renderiza o controle.

## Migrations e backfill

Executar em banco limpo e em cópia sanitizada representativa:

```bash
pnpm --filter @corrida/api exec prisma migrate deploy
bash scripts/verify-student-lifecycle-legacy-backfill.sh
pnpm --filter @corrida/api exec tsx scripts/verify-issue-272-health-intake.ts
pnpm --filter @corrida/api exec tsx scripts/verify-issue-273-parq.ts
```

Registrar:

- SHA candidato;
- banco/ambiente sanitizado;
- migrations aplicadas;
- contagens antes e depois por estado, sem identificadores pessoais;
- divergências, conflitos e tratamento adotado;
- resultado da reexecução idempotente;
- procedimento de rollback da aplicação.

Não declarar rollback de migration destrutiva sem script e ensaio específicos. O rollback padrão desta entrega é desligar a funcionalidade e voltar a aplicação, preservando os dados já gravados.

## Desempenho

A avaliação é proporcional ao uso esperado e deve registrar volume e ambiente. Não use um limite arbitrário sem baseline.

Medir pelo menos:

- listagem administrativa paginada com filtros combinados;
- abertura de convite válido e inválido;
- carregamento de sessão básica, Anamnese e PAR-Q;
- detector de duplicidade com volume representativo;
- revisão e confirmação de matrícula;
- contenção em cenários concorrentes.

Analisar query plans e índices quando houver regressão. Registrar p50, p95, taxa de erro e volume testado, sem labels de alta cardinalidade ou dados pessoais.

## Observabilidade

A métrica `pre_registration_http` possui somente área, método, status, duração e resultado. Ela pode alimentar contagens e latência por:

- `public-invite`;
- `authenticated-onboarding`;
- `administrative-management`;
- `administrative-invite`.

Alertas mínimos recomendados:

- crescimento sustentado de respostas `5xx`;
- aumento de `429` no convite público;
- crescimento de `409` de concorrência acima do baseline;
- p95 de latência degradado em relação ao piloto;
- falhas de migration ou inicialização;
- volume anormal de regenerações/revogações conforme eventos de auditoria do domínio.

Não use token, `alunoId`, `userId`, `contractId`, CPF, e-mail ou telefone como label de métrica.

## Go/no-go

A decisão de habilitar exige:

- todos os gates automatizados aprovados no SHA candidato;
- cenários críticos executados no ambiente alvo;
- zero vazamento de dados ou bypass de autorização;
- zero inconsistência de identidade, tenant ou estado final;
- plano de suporte e operador responsável definidos;
- evidências anexadas ao PR ou ao registro operacional sem dados sensíveis.

Qualquer falha de privacidade, multi-tenant, autorização, integridade ou migration é `no-go`.

## Desligamento e rollback

1. Definir `PRE_REGISTRATION_ENABLED=false` na API e redeploy/reiniciar.
2. Confirmar `503 PRE_REGISTRATION_DISABLED` com headers de segurança no namespace público e nas APIs administrativas.
3. Publicar o frontend com `VITE_PRE_REGISTRATION_ENABLED=false`.
4. Confirmar que o menu sumiu e que links públicos mostram orientação operacional.
5. Preservar convites, rascunhos, consentimentos, submissões e auditoria.
6. Investigar pelo identificador de correlação e por métricas agregadas, sem consultar dados de outro tenant.
7. Reabilitar somente após correção, validação e nova decisão de go/no-go.

Convites ativos durante o desligamento não são revogados automaticamente. A equipe deve orientar o potencial aluno a tentar novamente após a reabertura ou revogar/regenerar individualmente quando necessário.

## Evidências

Para cada execução, registrar:

- repositório, branch, head SHA, base SHA e merge preview SHA;
- comandos e workflows executados;
- resultado por cenário;
- ambiente e dataset sintético;
- artefatos e digests;
- ressalvas e decisão final.

Evidências visuais devem cobrir desktop, viewport de baixa altura e mobile, além de teclado, foco, labels, estados vazio/erro/carregamento e conteúdo longo.
