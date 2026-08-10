# Adipometria (ADPT) na Central do Aluno

A Central do Aluno possui um bloco dedicado para consulta e evolução da Adipometria. Esse bloco complementa o fluxo operacional de coleta documentado em `adipometry-web.md` e consome exclusivamente a API autenticada `/api/v1/adipometry`.

## Objetivo do bloco

O bloco permite ao professor autorizado:

- consultar a última ADPT concluída e vigente;
- visualizar data, código, responsável disponível, protocolo e versão;
- identificar explicitamente quando a avaliação vigente é uma correção e qual número de revisão está ativo;
- consultar peso, percentual de gordura, gordura absoluta e massa magra persistidos;
- retomar cada rascunho somente quando a capacidade correspondente estiver liberada;
- navegar para nova adipometria ou detalhe preservando `alunoId` e `assessmentId`;
- consultar histórico recente distinguindo ADPT estruturada de Antropometria, outras avaliações e uploads genéricos;
- comparar duas ADPT concluídas do mesmo aluno usando o endpoint autoritativo de comparação.

A entrada dedicada de Antropometria continua disponível na mesma aba. Antropometria e Adipometria possuem ações, rotas e históricos próprios; uma não substitui nem classifica registros da outra.

A ausência de ADPT ou uma falha localizada desse domínio não bloqueia cadastro, prontuário, treino, contratos, Antropometria ou os demais resumos da Central.

## Estados e revisão vigente

O resumo e a comparação consideram como concluída vigente somente a avaliação com:

- `status = COMPLETED`;
- `revisionStatus = FINALIZED`.

Revisões substituídas, canceladas ou invalidadas permanecem preservadas pelo backend, mas não viram a referência atual nem entram automaticamente na comparação. Rascunhos aparecem em uma área separada de pendências e nunca são tratados como resultado concluído.

Quando a avaliação finalizada possui `revisionNumber > 1`, o resumo e o histórico exibem **Avaliação corrigida — revisão N vigente**. A informação é derivada dos campos estruturados de revisão; a interface não tenta inferir correção pelo formato do código da avaliação.

A ordenação usa data da avaliação, data de criação e identificador estável como desempate. Depois que o usuário retorna do fluxo ADPT ou a aba volta a ficar visível, o bloco recarrega apenas o contexto de adipometria e remove seleções que deixaram de estar disponíveis.

## Histórico e origem

O histórico unificado identifica cada entrada por origem:

- **Avaliação estruturada ADPT:** registro devolvido pela API de adipometria, com código, estado, protocolo/versão e link de detalhe.
- **Upload genérico:** arquivo registrado pelo fluxo legado de avaliações, mesmo quando o nome ou tipo mencionar adipometria.
- **Outra avaliação:** registro legado ou estruturado de outro protocolo físico.

O filtro da interface altera apenas a apresentação. Ele não transforma um upload em ADPT nem mistura Antropometria com Adipometria.

## Comparação evolutiva

A comparação exige duas ADPT concluídas e vigentes. O navegador envia apenas os identificadores selecionados para `GET /adipometry/alunos/:alunoId/compare`; o backend revalida contrato, aluno, permissão, estado e tipo.

A tabela apresenta:

- peso;
- cinco dobras cutâneas;
- total das dobras;
- percentual de gordura;
- gordura absoluta;
- massa magra;
- valores absolutos de cada avaliação;
- variação entre as duas avaliações;
- unidades explícitas.

Campo ausente aparece como `Indisponível`, nunca como zero. Quando protocolo ou versão diferirem, a interface mostra um aviso de comparabilidade limitada e mantém os valores persistidos, sem recalcular resultados antigos. A Central não classifica automaticamente a variação como melhora ou piora.

## Permissões

Para consultar o bloco, o usuário precisa das duas permissões:

- `students.details.assessments`;
- `physicalAssessment.adpt.view`.

As capacidades de mutação são decididas pelo registro:

- criar uma nova avaliação e retomar rascunho inicial (`revisionNumber = 1`) exige `physicalAssessment.adpt.actions.manage`;
- retomar, editar, recalcular, reassociar responsável ou concluir uma revisão corretiva (`revisionNumber > 1`) exige `physicalAssessment.adpt.actions.correctCompleted`;
- possuir gestão sem correção não libera revisões corretivas;
- possuir correção sem gestão permite retomar a revisão corretiva, mas não criar uma nova avaliação comum.

A mesma regra é compartilhada pela Central e pela tela dedicada, alinhada ao middleware do backend. A interface oculta controles incompatíveis, mas a API continua sendo a barreira de segurança e aplica `contractId`, vínculo do aluno, revisão e bloco correspondente em toda operação.

## Resiliência e acessibilidade

- Carregamento, vazio, erro e comparação indisponível possuem mensagens próprias.
- Falhas de ADPT ficam contidas no bloco e oferecem nova tentativa.
- Somente a carga ADPT mais recente pode atualizar o estado; respostas anteriores do mesmo aluno são descartadas quando chegam fora de ordem.
- Uma comparação pendente é invalidada quando a seleção muda ou uma recarga começa, impedindo que resultado obsoleto reapareça na tabela.
- Falha ao carregar o cadastro necessário para a entrada de Antropometria não remove o bloco ADPT.
- Seções extensas usam controles colapsáveis nativos.
- Seleção usa checkboxes e o filtro usa `select`, ambos operáveis por teclado.
- A comparação possui tabela semântica com `caption`, cabeçalhos de coluna e linha.
- Em telas pequenas, somente a tabela possui rolagem horizontal; a página não depende de largura fixa.
- Mensagens de erro usam região de alerta, e mudanças de seleção relevantes usam região de status.

## Verificação

Validações focadas:

```bash
pnpm --filter @corrida/web test -- \
  adipometry-mutation-access.test.ts \
  AlunoAdipometryEvolutionCard.test.tsx \
  AlunoAdipometryEvolutionCard.race-regression.test.tsx \
  AlunoAdipometryEvolutionTabSection.test.tsx \
  AlunoDetailsTabs.adipometry.test.tsx
pnpm --filter @corrida/web type-check
pnpm --filter @corrida/web lint
pnpm access:check
pnpm docs:check
```

A integração real de navegador, API e PostgreSQL é executada pelo runner existente:

```bash
pnpm --filter @corrida/api exec tsx scripts/verify-issue-248-adipometry-browser-runner.ts
```

O runner preserva o fluxo guiado da issue #248 e acrescenta a Central da issue #249, incluindo revisão vigente, comparação real, atualização direcionada após finalização, tentativa cross-tenant e viewport móvel.

Validação agregada antes do handoff:

```bash
pnpm validate
```
