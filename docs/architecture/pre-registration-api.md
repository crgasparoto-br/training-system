# API de pré-matrícula

Este documento resume as fronteiras HTTP do processo. Tipos compartilhados em `packages/types`, schemas de rota e testes permanecem como contrato executável.

## Princípios

- `contractId` é a barreira multi-tenant nas rotas administrativas.
- A posse do link permite somente abrir ou reivindicar o processo inicial.
- Dados pessoais e de saúde exigem sessão autenticada vinculada ao registro canônico.
- Escritas versionadas usam `expectedVersion` e retornam conflito sem persistência parcial quando a versão mudou.
- Erros públicos usam allowlist de detalhes e não revelam candidatos, fingerprints ou dados de terceiros.
- Convites inválidos, expirados, revogados e substituídos são publicamente indistinguíveis.
- Quando o rollout está desabilitado, todas as fronteiras abaixo retornam `503 PRE_REGISTRATION_DISABLED` antes de executar regras de domínio.

## Disponibilidade do rollout

Base: `/api/v1/pre-registration`

- `GET /availability`: sonda pública e sem dados para o frontend distinguir disponibilidade técnica de autenticação. Retorna `204` quando a API está habilitada e o envelope canônico `503 PRE_REGISTRATION_DISABLED` quando está desabilitada.

A sonda não consulta banco, não exige sessão e não revela tenant, usuário, convite ou estado de processo. Ela existe para evitar que o frontend use uma rota autenticada como health check e produza `401` artificial no navegador.

A web deve executar esta sonda antes de renderizar qualquer consumidor da pré-matrícula, tanto quando `VITE_API_URL` aponta para uma origem explícita quanto quando a API é same-origin em `/api/v1`. Durante a sonda, formulário, listagem, detalhe e edição permanecem desmontados. Um `503` tardio não pode substituir uma tela funcional que já tenha sido exibida.

## Convite público

Base: `/api/v1/pre-cadastro`

- `GET /:token`: abre o convite e retorna somente o contexto público permitido.
- `POST /:token/register`: cria a conta convidada e reivindica o convite.
- Métodos ou caminhos não reconhecidos no namespace usam o fallback público seguro.

Controles obrigatórios: rate limit dedicado, body limitado, `Cache-Control: no-store, private`, `Referrer-Policy: no-referrer`, CORS explícito e ausência de token em logs ou respostas de erro.

## Sessão autenticada do onboarding

Base: `/api/v1/pre-registration`

- `POST /claim`: vincula um convite a uma conta compatível.
- `GET /processes`: lista os processos acessíveis pela conta autenticada.
- `POST /processes/:alunoId/guardian-authorization`: solicita validação administrativa do vínculo com menor.
- `GET /processes/:alunoId/session`: carrega o estado retomável.
- `PATCH /processes/:alunoId/steps`: salva identificação, contato, endereço, responsável ou privacidade.
- `POST /processes/:alunoId/complete`: conclui os dados básicos.

Todas as rotas de processo exigem autenticação e o middleware de aluno. O backend valida que a conta está vinculada ao `alunoId` solicitado.

## Anamnese Inicial

Base: `/api/v1/pre-registration/processes/:alunoId/health-intake`

- `GET /`: carrega sessão, estado e versão.
- `PATCH /`: salva uma etapa com consentimento e versão esperada.
- `POST /complete`: conclui a Anamnese com declaração explícita.

Erros relevantes: `BASIC_PRE_REGISTRATION_REQUIRED`, `CONSENT_REQUIRED`, `CONSENT_VERSION_MISMATCH`, `CONCURRENT_MODIFICATION`, `MISSING_REQUIRED_FIELDS` e `HEALTH_INTAKE_COMPLETED`.

## PAR-Q

Base: `/api/v1/pre-registration/processes/:alunoId/parq`

A fronteira expõe catálogo vigente, rascunho, salvamento versionado, conclusão e recuperação controlada quando a versão do catálogo é desconhecida. A submissão concluída é imutável; uma nova tentativa deliberada produz novo histórico.

Respostas positivas são calculadas no backend e geram pendência profissional na mesma transação. O cliente não define `positiveItems`, `positiveCount` ou estado clínico.

## Gestão administrativa

Base: `/api/v1/pre-registration-admin`

Leitura de tela exige `students.preRegistration`. Cada mutação exige o bloco correspondente.

- `GET /leads`: lista paginada com busca, filtros e ordenação no backend.
- `POST /leads/duplicates`: consulta candidatos antes de criar.
- `POST /leads`: cria lead mínimo.
- `GET /leads/:id`: carrega ficha administrativa.
- `GET /leads/:id/audit`: lista, com paginação no banco, eventos comerciais e de convite em contrato sanitizado (`id`, categoria, tipo, instante e natureza do ator), sem metadata, IP, User-Agent, identificadores de ator, token ou dados pessoais.
- `PATCH /leads/:id`: altera dados comerciais.
- `POST /leads/:id/invites`: gera ou regenera convite.
- `POST /leads/:id/invites/revoke`: revoga a versão alvo com motivo.
- rotas de autorização de responsável: leitura, aprovação e rejeição administrativa.
- rotas autoritativas de revisão, decisão de duplicidade, descarte/reabertura e conversão são montadas antes das rotas legadas para impedir bypass.

A resposta administrativa pode apresentar evidências mascaradas e estados resumidos. Respostas de Anamnese, respostas do PAR-Q e notas clínicas completas permanecem em fronteiras clínicas dedicadas. A trilha de auditoria respeita o mesmo `contractId` e `dataScope` da ficha: perfis com leitura da tela consultam somente registros visíveis, enquanto outro tenant recebe `404` uniforme.

## Convite administrativo por aluno

Base: `/api/v1/alunos/:alunoId/pre-registration-invites`

As rotas permitem consultar resumo, gerar, regenerar e revogar convites segundo a permissão administrativa. O token bruto aparece somente no resultado de geração/regeneração e não pode ser recuperado depois.

O histórico administrativo é deliberadamente limitado: o serviço retorna 20 versões por padrão e aplica teto de 100 quando um consumidor interno solicita limite explícito. A ficha administrativa usa o limite padrão. Relações de substituição são carregadas em lote; não é permitido executar uma consulta adicional por convite. Gates de desempenho devem exercer este serviço de produção com mais registros persistidos que o limite, e não um SQL paralelo escrito apenas no verificador.

## Status e recuperação

- `204`: sonda de disponibilidade com rollout habilitado.
- `400`: entrada inválida ou campo obrigatório ausente.
- `401`: sessão ausente ou inválida nas rotas autenticadas; a sonda de disponibilidade nunca usa este status.
- `403`: tela, bloco, escopo ou vínculo insuficiente.
- `404`: registro não encontrado ou inacessível; o resultado não diferencia outro tenant.
- `409`: concorrência, conflito de identidade, convite ativo, catálogo/versionamento incompatível ou estado já concluído.
- `422`: transição ou pré-condição de negócio inválida.
- `429`: rate limit público.
- `503 PRE_REGISTRATION_DISABLED`: rollout desabilitado sem remover dados.
- `500`: resposta segura com identificador de correlação quando aplicável.

O cliente deve recarregar o estado autoritativo em conflitos de versão. Não deve reenviar automaticamente uma mutação destrutiva ou substituir uma decisão administrativa.

## Telemetria técnica

A middleware HTTP emite somente:

```json
{
  "event": "pre_registration_http",
  "area": "public-invite",
  "method": "GET",
  "statusCode": 200,
  "durationMs": 42,
  "outcome": "success"
}
```

Áreas permitidas: `public-invite`, `authenticated-onboarding`, `administrative-management` e `administrative-invite`.

Não registrar path, query string, token, payload, headers, usuário, `contractId`, CPF, e-mail, telefone, respostas clínicas ou notas de revisão nesta métrica.
