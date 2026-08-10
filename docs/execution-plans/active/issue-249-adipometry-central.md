# Plano: integrar adipometria ADPT à Central do Aluno

## Objetivo

Transformar a aba `Avaliação Física` da Central do Aluno no ponto principal de consulta da adipometria, permitindo visualizar o último resultado vigente, retomar pendências autorizadas, consultar histórico com origem explícita e comparar duas avaliações concluídas.

## Contexto

- Issue #249, dependente das entregas de API (#247) e fluxo guiado web (#248), já incorporadas à `develop`.
- A API `/api/v1/adipometry` é a única fonte de resultados, histórico, revisão vigente e comparação.
- A aba já possui avaliações, entrada estruturada de Antropometria e uploads legados; a integração ADPT permanece isolada para que falhas desse domínio não interrompam os demais conteúdos autorizados.
- Referências: `docs/product/adipometry-web.md`, `docs/product/adipometry-central.md`, `docs/architecture/web.md`, `docs/architecture/auth-and-access-control.md` e `docs/quality/issue-248-browser-integration.md`.

## Fora de escopo

- Recalcular resultados antigos no navegador.
- Misturar uploads genéricos ou Antropometria com registros ADPT estruturados.
- Editar ou corrigir avaliações concluídas diretamente na Central.
- Gerar gráficos avançados, laudos ou classificação automática de melhora/piora.
- Alterar contratos, migrations ou fórmulas clínicas.
- Criar ou modificar workflow para produzir evidência.

## Arquivos e módulos principais

- `apps/web/src/access/adipometry-mutation-access.ts`
- `apps/web/src/access/adipometry-mutation-access.test.ts`
- `apps/web/src/components/alunos/AlunoAdipometryEvolutionCard.tsx`
- `apps/web/src/components/alunos/AlunoAdipometryEvolutionCard.test.tsx`
- `apps/web/src/components/alunos/AlunoAdipometryEvolutionCard.race-regression.test.tsx`
- `apps/web/src/components/alunos/AlunoAdipometryEvolutionTabSection.tsx`
- `apps/web/src/components/alunos/AlunoAdipometryEvolutionTabSection.test.tsx`
- `apps/web/src/components/alunos/AlunoAdipometryEvolutionTabSection.context-isolation.test.tsx`
- `apps/web/src/components/alunos/AlunoDetailsTabs.tsx`
- `apps/web/src/components/alunos/AlunoDetailsTabs.adipometry.test.tsx`
- `apps/web/src/pages/PhysicalAssessment/AdipometryScreen.tsx`
- `apps/web/src/services/adipometry.service.ts`
- `apps/web/src/services/adipometry.service.test.ts`
- `apps/api/scripts/verify-issue-249-adipometry-central-browser.ts`
- `apps/api/scripts/verify-issue-248-adipometry-browser-runner.ts`
- `apps/api/src/main.ts`
- `docs/product/adipometry-central.md`
- `docs/architecture/api.md`
- `docs/architecture/auth-and-access-control.md`
- `docs/quality/issue-248-browser-integration.md`

## Regras e restrições

- A Central só consulta ADPT quando o usuário possui `students.details.assessments` e `physicalAssessment.adpt.view`.
- Nova avaliação e rascunho inicial R1 exigem `physicalAssessment.adpt.actions.manage`.
- Revisão corretiva R2+ exige `physicalAssessment.adpt.actions.correctCompleted` em toda mutação; gestão não substitui correção.
- O backend continua responsável por `contractId`, autorização, revisão vigente, valores persistidos e comparação.
- Rascunhos ficam separados do histórico concluído e não entram na comparação.
- A revisão finalizada R2+ deve ser identificada explicitamente como correção vigente no resumo e no histórico, usando os campos estruturados de revisão.
- Somente a carga mais recente do mesmo aluno pode atualizar o estado, mesmo quando respostas chegam fora de ordem.
- Uma carga descartada após troca de aluno não deve continuar para a consulta de detalhe da avaliação antiga.
- Comparações pendentes deixam de ser válidas quando seleção ou geração de dados mudarem.
- O cliente de comparação pode omitir `assessmentIds` para usar o comportamento padrão da API ou enviar uma ou duas avaliações; zero ou mais de duas são rejeitadas antes da chamada HTTP.
- Uploads genéricos com nome semelhante a adipometria continuam identificados pela origem e não são tratados como ADPT estruturada.
- A entrada dedicada de Antropometria deve coexistir com `Nova adipometria`, sem fundir os domínios.
- Ausência de valor deve aparecer como indisponível, nunca como zero.
- Seções longas usam agrupamento colapsável e a tabela mantém leitura horizontal em telas pequenas.
- O verificador integrado deve usar navegador, API e PostgreSQL reais, sem interceptar `/api/v1`.
- O Manual do Professor exibido na área de avaliações depende da rota montada `/api/v1/professor-manual`.

## Passos de implementação

- [x] Adicionar cliente web para o endpoint de comparação ADPT.
- [x] Criar bloco isolado de resumo, pendências, histórico e comparação na aba `Avaliação Física`.
- [x] Centralizar a decisão `revisionNumber × capacidade` e reutilizá-la na Central e na tela dedicada.
- [x] Adicionar controles negativos para gestão sem correção e correção sem gestão.
- [x] Recolocar a entrada estruturada de Antropometria no mesmo contexto da ação ADPT.
- [x] Preservar o card ADPT quando o cadastro usado pela entrada de Antropometria falhar isoladamente.
- [x] Adicionar estados de carregamento, vazio, erro localizado, nova tentativa e atualização após retorno à aba.
- [x] Impedir que respostas antigas do mesmo aluno sobrescrevam uma recarga mais nova.
- [x] Impedir que a resposta descartada do aluno anterior continue para a consulta de detalhe.
- [x] Invalidar comparação pendente quando a seleção ou a geração de dados mudar.
- [x] Exibir explicitamente o número da revisão corrigida vigente no resumo e no histórico.
- [x] Adicionar testes determinísticos com promises controladas para respostas fora de ordem.
- [x] Alinhar o cliente `compare` ao contrato opcional e à cardinalidade aceita pela API.
- [x] Adicionar testes do cliente para ausência, uma, duas, zero e mais de duas avaliações.
- [x] Adicionar verificador real da Central com revisão vigente, comparação, atualização após finalização, cross-tenant e mobile.
- [x] Integrar o novo verificador ao runner existente, sem alterar workflow.
- [x] Corrigir a composição móvel da ficha e a quebra de textos longos observadas no navegador real.
- [x] Montar a rota já existente do Manual do Professor para eliminar o erro contextual na ficha.
- [x] Atualizar documentação de produto, API, acesso e qualidade.
- [x] Definir que SHA, merge preview e runs do candidato final sejam registrados na descrição da PR, sem manter identificadores dinâmicos neste documento versionado.

## Critérios de aceite

- [x] A última ADPT concluída mostra data, código, responsável disponível, protocolo/versão e resultados principais.
- [x] Uma revisão finalizada R2+ é identificada como avaliação corrigida e informa qual revisão está vigente.
- [x] Rascunho R1 aparece somente para quem possui gestão.
- [x] Rascunho R2+ aparece somente para quem possui correção de concluída.
- [x] Correção sem gestão pode retomar R2+, mas não criar nova ADPT.
- [x] Gestão sem correção não recebe ação para R2+.
- [x] Histórico distingue ADPT estruturada de outras avaliações e uploads, com filtro e ordenação estável.
- [x] Uma resposta ADPT antiga não substitui dados carregados por requisição posterior do mesmo aluno.
- [x] Uma carga ADPT descartada não consulta o detalhe da avaliação do aluno anterior.
- [x] Uma comparação antiga não reaparece depois que a seleção muda ou uma recarga invalida seus dados.
- [x] Comparação aceita duas concluídas, usa a API, mostra dez métricas, unidades, variações e aviso de protocolo diferente.
- [x] O cliente de comparação preserva o modo padrão da API sem IDs e rejeita cardinalidade inválida antes do HTTP.
- [x] Campos ausentes aparecem como `Indisponível`.
- [x] Falha da ADPT não quebra os outros blocos da Central.
- [x] Ações dedicadas de Antropometria e Adipometria coexistem sem misturar registros.
- [x] A integração é montada somente na aba `Avaliação Física`, sem duplicação no `Aluno 360`.
- [x] O ensaio integrado usa a Central real contra API e PostgreSQL reais e verifica isolamento cross-tenant.
- [x] O layout real não produz overflow horizontal em `390px`.
- [x] O Manual do Professor carrega pela rota real em vez de apresentar 404.
- [x] O gate final exige `pnpm validate` e os workflows existentes no mesmo SHA; o estado e os identificadores do candidato ficam registrados na descrição da PR.

## Evidência de validação

Os identificadores imutáveis do candidato, merge preview e runs são registrados na descrição da PR depois que os workflows automáticos do mesmo SHA terminam. Este documento descreve os gates exigidos, mas não mantém números de runs ou um SHA estático para evitar alegações obsoletas após uma remediação.

O cenário real da Central deve comprovar ações de Antropometria e Adipometria, revisão corretiva vigente, tabela de comparação, atualização direcionada depois da finalização, preservação do aluno, `404 ADIPOMETRY_RESOURCE_NOT_FOUND` para outro contrato, viewport de `390px` sem overflow e ausência de erros de página ou console.

## Validação focada

```bash
pnpm --filter @corrida/web test -- \
  adipometry.service.test.ts \
  adipometry-mutation-access.test.ts \
  AlunoAdipometryEvolutionCard.test.tsx \
  AlunoAdipometryEvolutionCard.race-regression.test.tsx \
  AlunoAdipometryEvolutionTabSection.test.tsx \
  AlunoAdipometryEvolutionTabSection.context-isolation.test.tsx \
  AlunoDetailsTabs.adipometry.test.tsx
pnpm --filter @corrida/web type-check
pnpm --filter @corrida/web lint
pnpm --filter @corrida/api exec tsx scripts/verify-issue-248-adipometry-browser-runner.ts
pnpm access:check
pnpm docs:check
pnpm validate
```

## Cenários de revisão

1. Gestão sem correção: visualizar e retomar apenas R1.
2. Correção sem gestão: visualizar e retomar apenas R2+, sem ação de nova ADPT.
3. Gestão e correção: visualizar os dois tipos de pendência.
4. Sem ambas: consultar concluídas autorizadas sem pendências operacionais.
5. Abrir a Central com revisão original substituída e confirmar apenas a correção vigente, identificada pelo número da revisão.
6. Comparar duas concluídas pela tabela semântica usando a API real.
7. Chamar a comparação sem IDs e confirmar que o cliente preserva o comportamento padrão do backend.
8. Rejeitar array vazio ou com mais de duas avaliações sem executar chamada HTTP.
9. Finalizar um rascunho enquanto a Central está aberta e confirmar atualização direcionada pelo foco.
10. Resolver duas cargas do mesmo aluno em ordem inversa e confirmar que apenas a requisição mais nova permanece visível.
11. Trocar de aluno antes de a primeira carga terminar e confirmar que a carga antiga não consulta detalhe nem altera a interface.
12. Alterar a seleção antes de a comparação responder e confirmar que a tabela obsoleta não aparece.
13. Consultar aluno de outro contrato diretamente e confirmar resposta pública não enumerável.
14. Confirmar as entradas dedicadas de Antropometria e Adipometria na mesma aba.
15. Repetir em `390px` sem overflow horizontal da página.

## Decisões

- A regra de mutação por revisão fica em helper compartilhado para impedir divergência entre superfícies.
- A integração ADPT permanece separada do conteúdo legado e da entrada de Antropometria para preservar resiliência.
- Cargas e comparações usam gerações monotônicas; somente a requisição ainda vigente pode aplicar resultado ao estado ou avançar para a consulta de detalhe.
- O cliente de comparação reproduz a cardinalidade da API e mantém o parâmetro ausente quando o chamador solicita a comparação padrão.
- O nome histórico do responsável é resolvido pelo diretório autorizado; quando não estiver disponível, a interface informa indisponibilidade sem expor identificadores internos.
- A evidência real foi acoplada ao runner já executado pelo gate existente; nenhum workflow novo é necessário.
- A rota do Manual do Professor foi montada porque o componente já fazia parte da ficha e o navegador real comprovou o 404 anterior.
- Metadados dinâmicos de validação pertencem à descrição da PR, pois atualizá-los em arquivo versionado criaria um novo SHA e invalidaria os próprios runs registrados.
