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
2. Recurso inexistente e recurso de outro contrato produzem a mesma resposta pública 404.
3. Resultados derivados não são aceitos em payload e são recalculados pelo backend na conclusão.
4. Avaliação concluída é imutável; correção cria nova revisão pelo contrato da issue #246.
5. A aprovação clínica ativa é bloqueada durante a conclusão, serializando revogação concorrente.
6. Dobras de 45,1 a 80,0 mm exigem confirmação registrada; acima de 80,0 mm é bloqueado.
7. Entradas com precisão superior ao contrato são rejeitadas, sem arredondamento silencioso.
8. A comparação informa deltas neutros e alerta quando protocolo ou versão divergir.

## Arquivos principais

- `apps/api/src/modules/adipometry/adipometry.service.ts`
- `apps/api/src/modules/adipometry/adipometry.routes.ts`
- `apps/api/src/modules/adipometry/index.ts`
- `apps/api/src/main.ts`
- `packages/types/access-control.ts`
- `docs/product/adipometry-protocol.md`
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

Os testes focados cobrem vetores canônicos masculino e feminino, limites de idade, precisão, alerta de capacidade, decisão de sexo, invalidação de fingerprint e presets de acesso. Os controles transacionais, de numeração, revisão e auditoria continuam cobertos pelos harnesses PostgreSQL da fundação #246 e são exercitados novamente pelo `validate` do repositório.

## Validação manual

1. Autorizar um contrato com protocolo clínico ativo.
2. Criar rascunho para aluno de 18 a 30 anos.
3. Calcular, editar uma dobra e verificar mudança do fingerprint.
4. Concluir com fingerprint atual e repetir a conclusão para confirmar idempotência.
5. Iniciar correção com perfil gerente, concluir a nova revisão e verificar que a anterior ficou `SUPERSEDED`.
6. Comparar duas avaliações e verificar alerta quando as versões forem diferentes.
7. Repetir consulta usando identificador de outro contrato e confirmar resposta pública equivalente a inexistente.

## Decisões

- Professor recebe leitura e gestão de rascunhos por padrão.
- Gerente recebe também correção de avaliação concluída.
- A prévia não persiste resultados; somente a confirmação operacional de capacidade pode ser registrada. A conclusão recalcula tudo dentro da própria transação.
- A ausência de antropometria de apoio não bloqueia a ADPT; referência informada é validada por contrato, aluno e data.

## Pendências de entrega

- executar a suíte remota no SHA congelado;
- mover este plano para `completed/` após aprovação e merge;
- realizar auditoria independente antes de aprovação operacional final.
