# Produto: matriz de dominios da Central do Aluno

Este documento define a fronteira entre funcionalidades que pertencem a Central do Aluno, a administracao geral do sistema ou a ambos.

Ele implementa a matriz solicitada nas issues #174 e #185 e deve ser usado como referencia por novas issues, PRs e planos relacionados a Central do Aluno.

## Objetivo

A Central do Aluno deve responder a pergunta:

> Estou trabalhando com este aluno agora. O que preciso ver, acompanhar ou atualizar sobre ele?

A administracao geral deve continuar concentrando cadastros, catalogos, parametros, configuracoes globais e operacoes que nao dependem de um aluno selecionado.

Funcionalidades hibridas podem ter gestao principal fora da Central, mas devem aparecer dentro da ficha quando explicam a situacao do aluno selecionado ou permitem uma acao contextual diretamente vinculada a ele.

## Regras de decisao

Classifique uma funcionalidade como **Central do Aluno** quando:

- o ponto de partida natural e um aluno selecionado;
- a acao cria, consulta ou atualiza dado diretamente vinculado ao aluno;
- o usuario precisa preservar o contexto do aluno apos salvar, cancelar ou encontrar erro;
- o registro deve aparecer no historico unificado, quando houver evento persistido;
- o dado ajuda o professor, gestor ou perfil autorizado a decidir a proxima acao para aquele aluno.

Classifique como **Administracao geral** quando:

- a funcionalidade configura catalogos, parametros, modelos ou permissoes globais;
- a acao vale para varios alunos, colaboradores, contratos ou unidades sem escolher um aluno;
- o fluxo principal e gestao operacional, financeira, cadastral ou tecnica geral;
- mover a funcionalidade para a ficha criaria uma tela gigante ou misturaria responsabilidades.

Classifique como **Hibrida** quando:

- existe uma configuracao, cadastro ou operacao geral fora da Central;
- existe tambem um vinculo, status, resumo, historico ou acao contextual relevante para um aluno especificico;
- a Central precisa mostrar o impacto no aluno, mas nao substituir o modulo administrativo principal.

## Matriz de classificacao

| Funcionalidade | Classificacao | Ponto principal de acesso | Presenca esperada na Central | Permissoes e dados sensiveis |
| --- | --- | --- | --- | --- |
| Busca e selecao de aluno | Central do Aluno | `/central-do-aluno` | Entrada para abrir a ficha centralizada. | Deve respeitar `contractId` e escopo permitido pela API. |
| Dados cadastrais do aluno | Central do Aluno | Ficha do aluno e cadastro legado compatibilizado | Cabecalho, aba Resumo, cadastro do aluno e acoes contextuais de edicao. | Dados pessoais exigem controle por tela/bloco e filtro por `contractId`. |
| Status do aluno | Hibrida | Administracao/cadastro e ficha do aluno | Resumo de situacao, pendencias e proxima acao. | Pode envolver dados administrativos; nao expor detalhes financeiros sem permissao. |
| Professor responsavel ou vinculo aluno-professor | Hibrida | Administracao de vinculos e ficha do aluno | Nome/responsavel atual, historico ou acao contextual quando permitido. | Professores devem ver somente alunos sob sua responsabilidade, salvo permissao ampliada. |
| Cadastro geral de professores e colaboradores | Administracao geral | Administracao de colaboradores | Apenas responsavel vinculado ao aluno quando aplicavel. | Usa permissoes de colaboradores; nao deve entrar como edicao completa na Central. |
| PRNT | Central do Aluno | Ficha do aluno, secao PRNT | Card de resumo, status completo/parcial/pendente, alertas, historico e acoes contextuais. | Dados de saude sensiveis; usar `physicalAssessment.protocol` e blocos PRNT quando aplicavel. |
| Anamnese, PAR-Q e AHA | Central do Aluno | Secao PRNT ou fluxo guiado contextual | Status, pendencias, ultima atualizacao e entrada para atualizar. | Dados sensiveis; exigir `blockKey`, `dataScope` quando aplicavel e `contractId`. |
| Objetivos do aluno | Central do Aluno | Secao PRNT/Objetivos e card de Resumo | Objetivo ativo, objetivos anteriores, criar/editar/encerrar no contexto do aluno. | Deve preservar historico, responsavel e data; respeitar permissoes de PRNT. |
| Dores, desconfortos, restricoes e acompanhamentos | Central do Aluno | Secao PRNT/Desconfortos | Alertas ativos, historico, registrar acompanhamento e encerrar quando permitido. | Dados de saude sensiveis; nao expor detalhes para perfis sem permissao. |
| Medicamentos, cirurgias e procedimentos | Central do Aluno | Secao PRNT | Resumo permitido, historico e registro contextual quando houver fluxo. | Dados sensiveis; exigir bloco especifico ou bloco PRNT equivalente. |
| Observacoes tecnicas do aluno | Central do Aluno | Secao PRNT, Resumo ou Historico | Observacao recente, adicionar observacao e alimentar historico unificado. | Podem conter dados sensiveis; aplicar permissao de PRNT. |
| Avaliacoes fisicas | Central do Aluno | Secao Avaliacao Fisica da ficha | Card de ultima avaliacao, estado pendente/vencido/em dia, historico e nova avaliacao. | Dados sensiveis; API deve validar permissao, escopo e `contractId`. |
| Antropometria | Central do Aluno | Fluxo guiado a partir do aluno | Nova avaliacao com aluno pre-selecionado, historico e base para comparacao. | Dados sensiveis; registrar data, responsavel, origem e contrato. |
| Adipometria | Central do Aluno | Fluxo guiado futuro a partir do aluno | Ponto planejado na secao Avaliacao Fisica e historico quando implementado. | Dados sensiveis e calculos testaveis preferencialmente no backend/service. |
| Prescricao tecnica | Central do Aluno | Secao Prescricao do aluno | Resumo, status por capacidade, origem dos dados-base e acoes do professor. | Visao tecnica restrita ao professor autorizado; aluno nao deve ver justificativas internas. |
| Treino de hoje | Central do Aluno | Secao Treino de hoje do aluno | Saida operacional, orientacoes praticas, alertas e feedback. | Deve ser rastreavel ate a montagem consolidada e respeitar visao professor/aluno. |
| Feedback pos-treino | Central do Aluno | Treino de hoje e Historico/Evolucao | Registro de PSE, dor, dificuldade, observacoes e evidencia para revisao. | Pode conter dados sensiveis; nao altera prescricao sem validacao do professor. |
| Catalogo geral de servicos | Administracao geral | Administracao de servicos | Nao aparece como catalogo completo; apenas servico contratado do aluno. | Permissao administrativa; nao usar como regra tecnica de treino. |
| Servico ou plano contratado pelo aluno | Hibrida | Contratos/servicos e ficha do aluno | Status, plano vigente, datas relevantes e vinculo administrativo. | Dados comerciais; detalhes financeiros exigem permissao especifica. |
| Contratos do aluno | Hibrida | Administracao de contratos e ficha do aluno | Contrato vigente, historico do aluno e documentos vinculados quando permitido. | Dados financeiros/contratuais exigem bloco especifico e `contractId`. |
| Modelos e regras gerais de contrato | Administracao geral | Administracao/configuracoes | Nao editar na Central; apenas refletir contrato aplicado ao aluno. | Permissao administrativa. |
| Agenda geral | Administracao geral | Agenda operacional | Nao substituir pela Central; pode abrir eventos filtrados do aluno. | Deve respeitar escopo do usuario e contrato. |
| Agenda do aluno, frequencia e reavaliacoes | Hibrida | Agenda e ficha do aluno | Proximos eventos, faltas, frequencia recente e reavaliacoes agendadas. | Dados operacionais do aluno; proteger por contrato e escopo. |
| Documentos e anexos do aluno | Hibrida | Documentos/contratos e ficha do aluno | Lista ou resumo dos documentos do aluno, anexar documento simples quando permitido. | Documentos pessoais, contratos e laudos exigem permissao especifica. |
| Relatorios e laudos do aluno | Central do Aluno | Secao Relatorios/Laudos do aluno | Historico de laudos, gerar relatorio quando dados-base estiverem consolidados. | Pode conter dados sensiveis; controlar visao professor/aluno e auditoria. |
| Relatorios gerenciais globais | Administracao geral | Relatorios gerenciais | Nao aparecem na ficha; no maximo indicadores agregados sem detalhe indevido. | Dados de varios alunos; exigir permissao gerencial e escopo adequado. |
| Configuracoes do sistema | Administracao geral | Configuracoes | Nao aparecem na Central. | Permissao administrativa; nunca depender de contexto de aluno. |
| Permissoes por perfil, tela, bloco e escopo | Administracao geral | Controle de acesso | A Central apenas reage ao que a API autoriza ou bloqueia. | Fonte em `packages/types/access-control.ts`; usar `screenKey`, `blockKey`, `dataScope` e `contractId`. |
| Parametros, modelos e templates reutilizaveis | Administracao geral | Configuracoes, catalogos ou biblioteca | Nao editar na Central; apenas usar o resultado aplicado ao aluno. | Permissao conforme dominio; evitar regra critica escondida no frontend. |
| Historico unificado do aluno | Central do Aluno | Ficha do aluno, Historico/Evolucao | Linha do tempo de eventos relevantes por data, responsavel, origem e contexto. | Eventos sensiveis devem filtrar detalhes conforme permissao. |

## Como usar esta matriz em novas issues

Toda issue relacionada a Central do Aluno deve declarar:

- **Classificacao**: Central do Aluno, Administracao geral ou Hibrida.
- **Ponto principal de acesso**: rota, tela, secao ou modulo onde o usuario comeca.
- **Presenca na Central**: resumo, vinculo, historico, alerta ou acao contextual esperada.
- **Permissoes**: `screenKey`, `blockKey`, `dataScope`, `contractId` ou justificativa quando nao houver impacto.
- **Atualizacao de historico**: se a acao deve alimentar o historico unificado do aluno.

## Criterios para revisao futura

Atualize esta matriz quando:

- uma nova epica introduzir dominio que afete diretamente a ficha do aluno;
- uma funcionalidade administrativa passar a ter resumo ou acao contextual na Central;
- uma acao sensivel exigir nova chave de permissao;
- uma decisao de produto mudar o ponto principal de acesso.

Mudancas nesta matriz devem continuar compativeis com:

- `ARCHITECTURE.md`;
- `docs/product/integrated-prescription-control.md`;
- `docs/product/access-control.md`;
- `docs/architecture/auth-and-access-control.md`;
- `docs/product/student-central-action-patterns.md`.
