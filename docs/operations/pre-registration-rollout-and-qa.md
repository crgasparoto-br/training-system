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

API e frontend devem terminar a janela de deploy no mesmo estado. Builds atuais com as rotas habilitadas possuem uma fronteira de disponibilidade em runtime: ao receber `503 PRE_REGISTRATION_DISABLED`, substituem as superfícies pública, de retomada autenticada e administrativa por uma orientação operacional temporária. O código técnico não deve ser exibido e o usuário não deve ser orientado a pedir novo convite, pois convites e rascunhos permanecem persistidos.

Uma versão anterior da web que ainda exponha as rotas e não possua essa fronteira não pode permanecer ativa enquanto a API estiver desabilitada. Nessa combinação, mantenha a API habilitada até a publicação do frontend atual ou retire o frontend anterior de circulação antes de desligar a API.

## Ordem de deploy

1. Fazer backup recuperável do banco conforme a política do ambiente.
2. Aplicar migrations e publicar a API sem alterar a disponibilidade observada pela versão da web ainda ativa.
3. Confirmar `/health`, migrations e inicialização sem erro.
4. Executar a suíte de smoke e as consultas de consistência do ambiente.
5. Publicar o frontend atual com `VITE_PRE_REGISTRATION_ENABLED=false` para confirmar que nenhuma entrada fica parcialmente exposta.
6. Confirmar que a versão anterior da web foi retirada de circulação. Se ela ainda expõe as rotas sem a fronteira de runtime, não definir `PRE_REGISTRATION_ENABLED=false` enquanto essa versão estiver atendendo usuários.
7. Validar a combinação frontend atual com rotas habilitadas e API desabilitada: as rotas pública, de retomada autenticada e administrativa devem mostrar somente a orientação operacional temporária.
8. Habilitar a API para o grupo piloto: `PRE_REGISTRATION_ENABLED=true`.
9. Publicar o frontend piloto com `VITE_PRE_REGISTRATION_ENABLED=true`.
10. Executar os cenários críticos abaixo.
11. Observar erros, latência, conflitos e volume de convites durante a janela definida.
12. Ampliar o uso somente após registrar as evidências e aprovar o go/no-go.

A flag controla a disponibilidade técnica do ambiente. Segmentação por tenant ou grupo piloto deve ser operacional, usando ambientes/instâncias separados, até existir uma flag tenant-scoped explícita.

## Compatibilidade entre versões

Toda combinação declarada como suportada precisa ser exercitada no consumidor real, e não apenas por inspeção do status HTTP.

Validar no navegador:

- frontend atual com rota pública tokenizada e API desabilitada;
- frontend atual em retomada autenticada e API desabilitada;
- frontend atual na área administrativa e API desabilitada;
- frontend atual com API habilitada;
- versão anterior da web somente enquanto a API permanecer em estado compatível com aquela versão.

Em cada cenário desabilitado, confirmar:

- título e mensagem compreensíveis para o público correto;
- ausência de `PRE_REGISTRATION_DISABLED` ou outro código técnico visível;
- ausência da orientação contraditória “solicite um novo convite”;
- ausência de mutação, revogação ou perda de rascunho;
- possibilidade de reabilitar o fluxo preservando o mesmo convite e o mesmo processo.

Quando um bundle anterior imutável não puder ser executado no gate, registrar a equivalência comprovável da condição de exposição e transformar a limitação em regra de deploy: essa versão não pode coexistir com a API desabilitada.

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

Inspecionar desde a primeira navegação tokenizada até a retomada autenticada: requests, cabeçalhos `Referer`, respostas, logs da API, telemetria habilitada, traces, analytics, armazenamento do navegador e screenshots. Eles não podem conter:

- token bruto ou URL completa do convite;
- CPF, e-mail, telefone ou endereço sem necessidade e permissão;
- corpo da Anamnese ou respostas do PAR-Q;
- dados de outro tenant;
- conteúdo do request em erros inesperados;
- segredos ou credenciais de ambiente.

Use apenas dados sintéticos. Redija tokens e contatos antes de anexar evidências. A página pública declara `Referrer-Policy: no-referrer` também no HTML, antes de qualquer recurso, para impedir que o caminho tokenizado seja enviado como referência.

## Permissões

Validar cada ação com quatro perfis mínimos:

1. sem acesso à tela;
2. somente consulta;
3. consulta com um subconjunto de blocos;
4. administrador autorizado no mesmo tenant.

Repetir os testes com registro fora do `dataScope` e registro de outro tenant. A API deve negar sem persistência parcial, mesmo quando a UI não renderiza o controle. A ação de auditoria deve ter controle positivo para os perfis profissionais autorizados e retornar somente contrato paginado e sanitizado; aceitar `404` como sucesso para um perfil autorizado não constitui evidência.

## Migrations e backfill

Executar em banco limpo e em cópia sanitizada representativa:

```bash
pnpm --filter @corrida/api exec prisma migrate deploy
bash scripts/verify-student-lifecycle-legacy-backfill.sh
pnpm --filter @corrida/api exec tsx scripts/verify-issue-272-health-intake.ts
pnpm --filter @corrida/api exec tsx scripts/verify-issue-273-parq.ts
```

O conjunto representativo deve conter ao menos aluno ativo completo, aluno legado incompleto, múltiplas submissões PAR-Q, dois tenants com identificadores semelhantes, lead pós-cutover e pré-cadastro em andamento. A reexecução deve preservar todos os IDs, estados e históricos.

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

1. Confirmar que nenhum frontend anterior sem fronteira de disponibilidade continua servindo as rotas. Se ainda existir, publicar primeiro o frontend atual desabilitado ou retirar a versão anterior de circulação.
2. Definir `PRE_REGISTRATION_ENABLED=false` na API e redeploy/reiniciar.
3. Confirmar `503 PRE_REGISTRATION_DISABLED` com headers de segurança no namespace público e nas APIs administrativas.
4. Confirmar no navegador que a versão atual, mesmo quando construída com rotas habilitadas, mostra a orientação operacional nas superfícies pública, autenticada e administrativa.
5. Publicar o frontend com `VITE_PRE_REGISTRATION_ENABLED=false` para remover menu e entradas no próximo build.
6. Preservar convites, rascunhos, consentimentos, submissões e auditoria.
7. Investigar pelo identificador de correlação e por métricas agregadas, sem consultar dados de outro tenant.
8. Reabilitar somente após correção, validação e nova decisão de go/no-go.

Convites ativos durante o desligamento não são revogados automaticamente. A equipe deve orientar o potencial aluno a tentar novamente após a reabertura ou revogar/regenerar individualmente quando necessário. A indisponibilidade temporária, por si só, nunca é motivo para solicitar um novo convite.

## Evidências

Para cada execução, registrar:

- repositório, branch, head SHA, base SHA e merge preview SHA;
- comandos e workflows executados;
- resultado por cenário;
- ambiente e dataset sintético;
- artefatos e digests;
- ressalvas e decisão final.

A evidência de compatibilidade deve incluir o navegador real para a rota pública tokenizada, a retomada autenticada e a área administrativa, com API desabilitada, além de controle negativo para `401`, `403` e falha transitória. O gate deve falhar se reaparecer o código técnico, a orientação para gerar outro convite ou qualquer mutação causada pela indisponibilidade.

Evidências visuais devem cobrir desktop, viewport de baixa altura e mobile, além de teclado, foco, labels, estados vazio/erro/carregamento e conteúdo longo. O gate de acessibilidade também registra árvore acessível, contraste calculado, zoom de 200% sem overflow e semântica de teclado móvel; screenshot isolada não substitui essas verificações.
