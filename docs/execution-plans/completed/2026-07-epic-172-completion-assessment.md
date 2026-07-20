# Levantamento concluido da epica #172

## Status

Registro de auditoria concluido em 2026-07-10. Mantido em `execution-plans/completed/` para preservar a distincao entre o primeiro incremento entregue e as pendencias posteriores da Antropometria.

## Objetivo

Registrar o estado real da epica #172 na branch `develop`, separar o que estava implementado do que permanecia pendente e definir os recortes necessarios para considerar a trilha de avaliacoes e antropometria efetivamente concluida.

## Fontes verificadas

- issue #172 e subissues #183 e #184;
- PRs #197, #198, #202 e #203;
- `apps/web/src/pages/PhysicalAssessment/AnthropometryScreen.tsx`;
- `apps/web/src/hooks/useAnthropometry.ts`;
- componentes de resumo e historico da Central do Aluno;
- roadmap da Central do Aluno existente na data da revisao.

## Estado registrado em 2026-07-10

A epica foi encerrada no GitHub apos a entrega das subissues #183 e #184. O encerramento representou a conclusao do primeiro recorte funcional da Central do Aluno, mas nao a conclusao integral da Antropometria.

### Implementado

- card de avaliacoes na Central do Aluno;
- estados de avaliacao inexistente, pendente, em dia e vencida;
- ultima avaliacao, tipo, data e responsavel;
- proxima reavaliacao quando disponivel;
- historico recente por data, tipo, responsavel, origem e status;
- inicio de nova antropometria preservando `alunoId`;
- bloqueio de troca acidental do aluno no fluxo contextual;
- exigencia de aluno, data e professor responsavel;
- criacao sequencial de avaliacao antropometrica;
- edicao da avaliacao atual;
- historico anterior somente leitura;
- comparacao lado a lado;
- segmentos configuraveis;
- observacoes gerais e importaveis;
- estados de carregamento, ausencia de historico e erro;
- retorno explicito para a Central do Aluno.

### Implementado parcialmente ou sem comprovacao completa

- atualizacao imediata do card e do historico apos salvar;
- integracao garantida com o historico unificado;
- regra formal de avaliacao em dia ou vencida;
- testes especificos de permissoes e `contractId`;
- obrigatoriedade de medidas por protocolo;
- contrato de dados para laudos.

### Nao implementado naquele recorte

- graficos de evolucao;
- variacao absoluta e percentual por medida;
- protocolo completo de adipometria;
- calculos de composicao corporal;
- laudos finais ou PDF;
- estados formais de rascunho e concluida;
- validacao completa antes da conclusao;
- suite especifica de autorizacao, timeline e atualizacao da Central.

## Decisao registrada

- a issue #172 podia permanecer encerrada como primeiro incremento funcional;
- a fase completa de Antropometria nao deveria ser marcada como concluida;
- os itens restantes deveriam seguir em novas issues e fontes de verdade atuais.

## Trabalho identificado para concluir a Antropometria

1. Formalizar o ciclo de vida da avaliacao.
2. Definir protocolos e obrigatoriedade das medidas.
3. Fortalecer rastreabilidade e timeline.
4. Validar permissoes e escopo de dados.
5. Completar comparacao evolutiva.
6. Criar graficos somente apos estabilizar dados e protocolos.
7. Preparar contrato de dados para laudo.
8. Consolidar testes automatizados e validacao manual.

## Criterio registrado para conclusao

A Antropometria somente poderia ser considerada concluida quando houvesse:

- ciclo de vida definido;
- protocolos e medidas obrigatorias formalizados;
- historico imutavel e rastreavel;
- comparacao evolutiva completa;
- permissoes e `contractId` testados;
- card e timeline atualizados;
- decisao explicita sobre graficos;
- contrato de dados para laudo;
- testes automatizados e validacao manual.

O estado atual e as prioridades vigentes devem ser consultados em `docs/product/roadmap.md` e nas issues abertas relacionadas.
