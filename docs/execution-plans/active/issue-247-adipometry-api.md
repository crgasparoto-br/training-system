# Issue #247 — API autoritativa da adipometria

## Objetivo

Expor o ciclo clínico da adipometria por uma API autenticada e multi-tenant, usando a fundação histórica e de governança implantada pela issue #246.

## Escopo

- listar protocolos com aprovação clínica ativa no contrato e explicar incompatibilidades;
- criar, editar e consultar rascunhos ADPT com numeração concorrente no banco;
- calcular prévia determinística somente com entradas persistidas;
- invalidar a prévia quando entrada, versão ou aprovação mudar;
- concluir avaliação em transação serializável, preservando snapshot e auditoria;
- iniciar, editar, concluir ou cancelar correções sem alterar o histórico concluído;
- listar histórico atual, última avaliação e comparação entre duas avaliações;
- vincular opcionalmente antropometria anterior do mesmo aluno e contrato;
- separar permissões de leitura, gestão de rascunho e correção de concluída.

## Invariantes

1. `contractId`, usuário e professor ator vêm da autenticação; o body não escolhe tenant ou autor.
2. Usuário e vínculo profissional são revalidados como elegíveis em cada fronteira protegida, mesmo quando o JWT ainda é criptograficamente válido. Usuário inativo, status de desligamento/inatividade ou desligamento já efetivo bloqueiam o acesso; status legado nulo permanece compatível como ativo.
3. Recurso inexistente e recurso de outro contrato produzem a mesma resposta pública 404.
4. Resultados derivados não são aceitos em payload e são recalculados pelo backend na conclusão.
5. Avaliação concluída é imutável; correção cria nova revisão pelo contrato da issue #246.
6. A aprovação clínica ativa é bloqueada durante a conclusão, serializando revogação concorrente.
7. Alertas de capacidade são derivados do protocolo aprovado. Na versão vigente, dobras de 45,1 a 80,0 mm exigem confirmação; acima de 80,0 mm é bloqueado.
8. A confirmação operacional é gravada dentro da transação serializável do cálculo, somente quando não existe outro bloqueio, e sofre rollback com qualquer falha posterior.
9. Entradas com precisão superior ao contrato e datas civis inexistentes são rejeitadas, sem arredondamento ou normalização silenciosa.
10. Histórico, última avaliação, comparação e seleção da Antropometria de apoio usam o identificador como desempate final estável.
11. A conclusão repete até três vezes a transação completa quando o PostgreSQL sinaliza conflito serializável por `P2034`. Depois do retry, uma requisição concorrente observa o estado concluído e retorna `alreadyFinalized`; se os retries se esgotarem, a fronteira pública devolve `409 ADIPOMETRY_CONCURRENT_OPERATION`, sem mensagem bruta do banco.
12. Reenviar a mesma decisão efetiva de sexo do protocolo durante a edição não renova autor, instante, justificativa nem snapshot cadastral da confirmação. A proveniência só muda quando sexo, origem ou justificativa efetiva mudam, e essa comparação ocorre atomicamente no PostgreSQL.

## Arquivos principais

- `apps/api/src/modules/adipometry/adipometry.service.ts`
- `apps/api/src/modules/adipometry/adipometry.routes.ts`
- `apps/api/src/modules/adipometry/adipometry-api.integration.test.ts`
- `apps/api/src/modules/adipometry/adipometry-remediation.integration.test.ts`
- `apps/api/src/modules/adipometry/adipometry-protocol-sex-provenance.integration.test.ts`
- `apps/api/prisma/migrations/20260804124500_preserve_adipometry_protocol_sex_decision_provenance/migration.sql`
- `apps/api/src/modules/auth/auth.middleware.ts`
- `apps/api/src/modules/access-control/access-control.middleware.ts`
- `apps/api/src/modules/adipometry/index.ts`
- `apps/api/src/main.ts`
- `packages/types/adipometry.ts`
- `packages/types/access-control.ts`
- `docs/product/adipometry-protocol.md`
- `docs/product/adipometry-api.md`
- `docs/product/access-control.md`
- `docs/architecture/api.md`

## Validação automatizada

```bash
pnpm --filter @corrida/api test
pnpm access:check
pnpm arch:check
pnpm docs:check
pnpm validate
```

Os testes focados cobrem vetores canônicos masculino e feminino, limites de idade, precisão, alerta de capacidade, decisão de sexo, invalidação de fingerprint, sanitização do erro `P2034` e presets de acesso. O harness PostgreSQL da API também exerce numeração concorrente, sequência acima de 999, rollback de finalização, duas conclusões simultâneas sem efeitos duplicados, imutabilidade, correção, ordenação estável, isolamento entre contratos e a matriz HTTP negativa para ausência de autenticação, papel incorreto, falta de leitura, falta de gestão e falta da permissão específica de correção.

A remediação de proveniência acrescenta dois controles PostgreSQL discriminantes: a própria migration aborta se uma decisão efetivamente inalterada renovar autor ou instante, e a suíte de integração repete o fluxo com dois profissionais, comprovando preservação na edição comum e transferência somente após mudança clínica real.

SHAs e runs neste plano são tratados como evidência histórica, não como identidade vigente do candidato. A fonte canônica do head auditável é a PR #292 e os checks associados ao SHA exato exibido nela. O baseline anterior à remediação de proveniência foi `34ef9e02ab11722d6fc6d4769a9f4200950f373a`, aprovado por `Validate PR` run `30906221472` e `Issue 275 Pre-registration QA` run `30906221527`. O head e os runs posteriores à remediação devem ser registrados na descrição da PR após a conclusão automática dos workflows, evitando manter no próprio commit uma referência autorreferente que se torna obsoleta ao editar este arquivo.

## Validação manual

1. Autorizar um contrato com protocolo clínico ativo.
2. Criar rascunho para aluno de 18 a 30 anos.
3. Calcular, editar uma dobra e verificar mudança do fingerprint.
4. Disparar duas conclusões simultâneas com o mesmo fingerprint e confirmar uma finalização efetiva, uma resposta idempotente e apenas um efeito de auditoria.
5. Iniciar correção com perfil gerente, concluir a nova revisão e verificar que a anterior ficou `SUPERSEDED`.
6. Comparar duas avaliações e verificar alerta quando as versões forem diferentes.
7. Repetir consulta usando identificador de outro contrato e confirmar resposta pública equivalente a inexistente.
8. Revogar separadamente leitura, gestão e correção e confirmar `403` nas operações correspondentes.
9. Desativar usuário ou vínculo de professor mantendo o token anterior e confirmar que a API deixa de autorizar.
10. Enviar `2026-02-31` e confirmar `400` sem criação de rascunho.
11. Confirmar alerta em rascunho ainda incompleto e verificar que nenhuma confirmação é persistida.
12. Confirmar a decisão pelo profissional A, salvar uma medida pelo profissional B reenviando a mesma decisão e verificar que autor e instante permanecem de A; depois alterar realmente a decisão e verificar a transferência para B.

## Decisões

- Professor recebe leitura e gestão de rascunhos por padrão.
- Gerente recebe também correção de avaliação concluída.
- A prévia não persiste resultados. A confirmação operacional de capacidade pertence à mesma transação do cálculo e não é gravada quando coexistir outro erro bloqueante.
- A ausência de antropometria de apoio não bloqueia a ADPT; referência informada é validada por contrato, aluno e data.
- Os contratos compartilhados representam os bodies HTTP reais; aluno, professor, ator e contrato permanecem fora do payload e são derivados da URL ou autenticação.
- Retry de conflito serializável reaplica toda a decisão transacional; não repete apenas a escrita nem reutiliza estado lido antes do conflito.
- A integridade de proveniência da decisão clínica é protegida por trigger `BEFORE UPDATE`, para que nenhuma rota, job ou consumidor futuro consiga reatribuir a confirmação ao apenas reenviar o mesmo estado efetivo.

## Pendências de entrega

- mover este plano para `completed/` após aprovação e merge;
- realizar auditoria independente antes de aprovação operacional final.
