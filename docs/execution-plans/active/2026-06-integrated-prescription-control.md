# Plano de execucao: fluxo integrado de prontuario, prescricao e treino

Status: ativo
Data: 2026-06-12
Branch de planejamento: `docs/develop-prescription-architecture-plan`
Documento de produto: `docs/product/integrated-prescription-control.md`

## Contexto

O Sistema Acesso deve evoluir para um fluxo integrado:

```text
Prontuario / Avaliacao Fisica
  -> Prescricao por capacidades fisicas
  -> Montagem Consolidada da Prescricao
  -> Treino de hoje
  -> Feedback pos-treino
  -> Regras de decisao sugerida
  -> Nova prescricao ou ajuste validado pelo professor
```

A mudanca e estrutural e deve ser executada em fases pequenas, com PRs revisaveis e sem alterar tudo de uma vez.

## Objetivo deste plano

Organizar a implementacao para reduzir retrabalho, permitir evolucao futura e manter seguranca, rastreabilidade e controle de acesso desde a primeira fase.

## Fora de escopo inicial

- Integracao real com smartwatch.
- Automacao completa de decisao sem professor.
- Inteligencia artificial para prescricao autonoma.
- Reescrita completa do sistema atual.
- Migracoes destrutivas de dados existentes.

## Principios de implementacao

1. Documentar antes de implementar.
2. Implementar por fatias verticais pequenas.
3. Preservar comportamento existente sempre que possivel.
4. Nunca permitir acesso por frontend sem bloqueio equivalente no backend.
5. Versionar entidades criticas: prescricao, montagem e treino gerado.
6. Toda nova consulta sensivel deve respeitar `contractId` e escopo de dados.
7. Toda tela longa deve usar colapses por grupos logicos.
8. Toda fase deve atualizar docs, tipos compartilhados e testes quando aplicavel.

## Recomendacoes adicionais extraidas da planilha

Esta secao registra itens importantes identificados na planilha `Ideias e estruturacao - Professor` que nao podem ser esquecidos durante a quebra das issues. Nem todos entram no nucleo inicial; alguns devem virar backlog ou subissues quando a fase correspondente for implementada.

### Avaliacao fisica avancada

- Baropodometria, ultrassom e ventilometria devem permitir itens de comparacao pre e pos, com configuracao para incorporar imagens, dados externos e resumos em laudos.
- Ventilometria deve poder gerar protocolo exportavel para smartwatch em fase futura.
- Avaliacoes devem funcionar como fonte oficial de dados-base da prescricao, reduzindo preenchimento manual duplicado.
- Flexibilidade deve alimentar a prescricao por articulacao, puxando angulos avaliados e deficits por pescoço, ombro, cotovelo, punho, dedos, quadril e joelho.

### Prescricao e montagem

- A prescricao ciclica deve considerar capacidade fisica, reversibilidade do estimulo e dados como LAn/%VO2max quando existirem.
- Cada sessao deve permitir PSE esperado pelo professor.
- A montagem deve alertar CIT alto ou relacao agudo/cronico elevada quando aplicavel.
- A montagem deve priorizar seguranca quando houver dor relevante, tontura, fadiga excessiva, queda de performance ou alerta vermelho.
- A prescricao deve gerar mensagens praticas para WhatsApp, mas isso deve ser tratado como saida/exportacao, nao como fonte tecnica.

### Smartwatch e execucao real

- O sistema deve ser preparado para exportar treino aerobico para smartwatch e, futuramente, importar execucao real.
- Dados futuros de importacao podem incluir distancia, pace, FC media, FC maxima, tempo em zona, sono, estresse e recuperacao.
- Estes dados devem entrar como evidencias para feedback e decisao sugerida, sem substituir validacao do professor.

### Gestao, aderencia e operacao

- Gestao de alunos deve considerar status ativo com base em servico, pagamentos e respostas dos alunos.
- O aluno deve receber notificacao de proximidade de pagamento, no celular e/ou na tela do aluno.
- Gestores devem ter indicador de aderencia: presencas, treinos realizados, feedbacks respondidos, licoes de casa cumpridas e atrasos de pagamento.
- Gestores devem visualizar disponibilidade de horario dos colaboradores para apoiar lotacao de alunos.
- Gestao de ambiente deve incluir cadastro de materiais de sala.

### Relatorios e visao multidisciplinar

- A evolucao do aluno deve ter linha do tempo com avaliacoes, objetivos, ajustes de prescricao, feedbacks e indicadores relevantes.
- Relatorios multidisciplinares devem prever indicadores clinicos e de performance, como peso, sono, qualidade do sono, sono REM/leve, exercicio aerobico/resistido, estresse, FC repouso, variabilidade de FC, pressao arterial, LDL, HDL, hemoglobina glicada, VO2max, circunferencia abdominal e percentual de gordura.
- Dados clinicos devem ter permissao especifica, escopo por contrato e separacao clara entre visao tecnica e visao do aluno.

### Observacao sobre abas da planilha

A exportacao acessivel nesta rodada trouxe a aba selecionada com 33 itens uteis. Caso existam outras abas nao exportadas pelo link atual, elas devem ser revisadas antes de iniciar implementacao funcional e os achados devem atualizar este plano ou gerar issues adicionais.

## Fases e issues

### Fase 0 - Governanca e base documental

Objetivo: criar fonte de verdade para orientar o Codex e os proximos PRs.

Entregas:

- Documento de produto criado.
- Plano de execucao ativo criado.
- Issues organizadas por fase.
- PR de documentacao aberto contra `develop`.

Criterios de aceite:

- Documentacao revisavel sem alteracao de comportamento.
- Issues possuem contexto, entregas, criterios de aceite e dependencias.

### Fase 1 - Navegacao e contexto do aluno

Objetivo: reorganizar a experiencia em torno do aluno selecionado.

Escopo sugerido:

- Criar ou ajustar rota/tela de aluno selecionado.
- Abas: Resumo, Treino de hoje, Prontuario, Prescricao, Avaliacao Fisica, Historico/Evolucao, Cadastro e Vinculos.
- Colapses em blocos longos.
- Menu lateral ocultando o que nao for permitido.
- Controle por `screenKey`, `blockKey` e `dataScope`.

Criterios de aceite:

- Professor acessa somente alunos permitidos.
- Gestor respeita escopo configurado.
- Aluno nao acessa visao tecnica.
- Frontend oculta e backend bloqueia.

### Fase 2 - Prontuario e avaliacao como entrada tecnica

Objetivo: garantir que prontuario e avaliacao fisica alimentem a prescricao.

Escopo sugerido:

- Consolidar resumo tecnico do PRNT por aluno.
- Expor historico de avaliacao fisica e antropometria.
- Marcar dados importaveis para prescricao.
- Criar linha do tempo tecnica inicial.
- Garantir auditoria nos blocos sensiveis.
- Considerar baropodometria, ultrassom, ventilometria, flexibilidade e dados-base oficiais como extensoes planejadas.

Criterios de aceite:

- Historico nao e sobrescrito.
- Dados tecnicos sensiveis exigem permissao.
- Resumo tecnico e consumivel pela fase de prescricao.

### Fase 3 - Prescricao por capacidades fisicas

Objetivo: dividir a prescricao em capacidades independentes.

Escopo sugerido:

- Modelar capacidades: Resistido, Flexibilidade, Ciclico e Equilibrio.
- Criar status: planejado, ativo, em ajuste, suspenso e finalizado.
- Vincular objetivos, justificativas, sessoes, alertas e feedback.
- Criar validacoes por capacidade.
- Impedir envio direto para Treino de hoje.
- Considerar PSE esperado, prescricao ciclica por LAn/%VO2max e selecao articular por checkbox como subissues da fase.

Criterios de aceite:

- Cada capacidade possui origem, status e responsavel.
- Capacidade nao gera treino diretamente.
- Dados sao filtrados por contrato e aluno.

### Fase 4 - Montagem Consolidada da Prescricao

Objetivo: criar a camada-mae/filtro final antes do treino.

Escopo sugerido:

- Criar entidade de montagem consolidada.
- Receber blocos ativos e validados das capacidades.
- Validar conflitos e alertas.
- Registrar versao, origem, justificativa e status.
- Gerar versao operacional do Treino de hoje.
- Considerar alertas de CIT alto, relacao agudo/cronico e priorizacao de seguranca quando houver dor, tontura, fadiga ou queda de performance.

Criterios de aceite:

- Treino de hoje e rastreavel ate a montagem.
- Conflitos sao exibidos antes da liberacao.
- Professor valida a montagem antes da liberacao.

### Fase 5 - Feedback pos-treino e decisao sugerida

Objetivo: fechar o ciclo entre execucao e nova prescricao.

Escopo sugerido:

- Capturar feedback do aluno e professor.
- Consolidar PSE, PSR, dor, dificuldade, carga usada e aderencia.
- Criar decisao sugerida: manter, progredir, reduzir, trocar, suspender ou reavaliar.
- Exigir validacao final do professor.
- Registrar historico de decisao.
- Preparar entrada futura de dados de smartwatch como evidencia complementar.

Criterios de aceite:

- Decisao sugerida nao altera prescricao sem aprovacao.
- Historico e rastreavel.
- Aluno ve apenas mensagem pratica.

### Fase 6 - Evolucoes futuras

Objetivo: preparar extensoes sem refazer o nucleo.

Backlog:

- Integracao com smartwatch.
- Notificacoes inteligentes.
- Relatorios evolutivos.
- Regras avancadas de decisao.
- Agenda integrada com disponibilidade de professor, ambiente e aluno.
- Geracao de mensagem WhatsApp a partir da prescricao validada.
- Indicadores de aderencia, status ativo por pagamento/resposta e notificacao de cobranca.
- Painel de disponibilidade de colaboradores.
- Cadastro de materiais de sala.
- Relatorios multidisciplinares com indicadores clinicos e de performance.

## Sequencia recomendada de PRs

1. PR 0: documentacao e issues.
2. PR 1: navegacao do aluno selecionado e permissao base.
3. PR 2: resumo tecnico de prontuario e avaliacao.
4. PR 3: modelo e API de prescricao por capacidades.
5. PR 4: UI de prescricao por capacidades.
6. PR 5: montagem consolidada no backend.
7. PR 6: montagem consolidada no frontend.
8. PR 7: geracao controlada do Treino de hoje.
9. PR 8: feedback pos-treino.
10. PR 9: regras de decisao sugerida.

## Checklist para cada PR do Codex

- Ler `docs/product/integrated-prescription-control.md`.
- Confirmar issue principal e dependencias.
- Criar branch a partir de `develop`.
- Fazer mudanca pequena e coesa.
- Atualizar docs se houver decisao nova.
- Atualizar `packages/types` se houver contrato compartilhado.
- Adicionar testes de backend quando houver regra de permissao/dados.
- Adicionar testes ou validacao de frontend quando houver UI sensivel.
- Rodar `pnpm validate`.
- Abrir PR com resumo, testes executados e riscos.

## Riscos conhecidos

| Risco | Mitigacao |
| --- | --- |
| Tentar implementar tudo em um PR | Dividir por fases e issues pequenas |
| Criar regra apenas no frontend | Exigir validacao no backend |
| Perder historico tecnico | Usar entidades historicas e versionamento |
| Aluno ver informacao sensivel | Separar visao tecnica e pratica |
| Prescricao virar tela gigante | Separar por capacidade e usar colapses |
| Integracao futura exigir refatoracao grande | Definir origem, versao e rastreabilidade desde o inicio |
| A planilha ter abas nao revisadas pela exportacao atual | Antes de implementar, confirmar se ha abas adicionais e atualizar issues/plano |

## Definicao de pronto global

Uma fase so deve ser considerada pronta quando:

- criterios da issue foram atendidos;
- permissoes e escopo de dados foram validados;
- historico/auditoria foram considerados;
- documentacao foi atualizada;
- `pnpm validate` foi executado ou o bloqueio foi explicado no PR;
- comportamento existente relevante foi preservado.
