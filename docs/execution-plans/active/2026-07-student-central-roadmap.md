# Plano: Central do Aluno e roadmap integrado do Sistema ACESSO

## Objetivo

Consolidar o Sistema ACESSO em torno da **Central do Aluno**: uma tela centralizada onde professor, gestor ou perfil autorizado pesquisa um aluno e consegue consultar, analisar e atualizar toda a vida tecnica, administrativa e evolutiva dele sem navegar por varias telas desconectadas.

Este plano registra o racional de produto, o roadmap faseado, os epicos, as subissues e o controle de avanco para evitar perda de contexto durante o desenvolvimento.

## Conceito principal

O sistema deve responder primeiro a pergunta:

> Quero ver tudo sobre este aluno.

A Central do Aluno deve permitir:

- consultar rapidamente a situacao atual do aluno;
- analisar historico tecnico, administrativo e evolutivo;
- atualizar dados no mesmo contexto;
- iniciar novas avaliacoes, acompanhamentos, treinos, contratos ou relatorios a partir do aluno selecionado;
- preservar permissoes por perfil, bloco e escopo de dados.

## Decisoes ja tomadas

- A Central do Aluno e o eixo principal do produto.
- Informacoes diretamente vinculadas ao aluno devem ser acessiveis pela Central do Aluno.
- O menu lateral pode continuar existindo, mas nao deve ser o caminho principal para trabalhar com um aluno especifico.
- Consulta, historico e atualizacao devem coexistir no mesmo fluxo.
- Pop-ups devem ser usados conscientemente apenas para acoes rapidas.
- Paineis laterais devem ser usados para formularios medios.
- Fluxos guiados devem ser usados para registros complexos.
- Apos salvar qualquer acao contextual, o usuario deve continuar no mesmo aluno.

## Fora de escopo neste momento

- Implementar todas as funcionalidades finais em uma unica entrega.
- Criar laudos finais antes de consolidar os dados de base e historicos.
- Refatorar toda a navegacao do sistema de uma vez.
- Remover rotas existentes sem estrategia de compatibilidade.
- Alterar regras de permissao sem mapear impactos por perfil e bloco.

## Relacao com documentos existentes

Este plano deve ser lido junto com:

- `docs/product/navigation-information-architecture.md`: arquitetura de informacao, hubs, Aluno 360 e navegacao.
- `docs/product/integrated-prescription-control.md`: fluxo integrado de prontuario, avaliacao, prescricao, montagem consolidada, treino de hoje, feedback e decisao.
- `docs/product/access-control.md`: regras de produto para controle de acesso.
- `docs/architecture/auth-and-access-control.md`: autenticacao, autorizacao e escopo de dados.

## Roadmap por fases

### Fase 1 - Central do Aluno

Objetivo: criar a espinha dorsal do sistema centrada no aluno.

Entregas esperadas:

- busca e selecao de aluno;
- abertura da ficha centralizada;
- cabecalho fixo com dados principais;
- aba Resumo com cards de situacao atual;
- historico unificado do aluno;
- acoes rapidas contextuais;
- estados vazio, carregamento e erro.

Issues relacionadas:

- #170 - Epic da Central do Aluno.
- #175 - Busca e selecao de aluno.
- #176 - Cabecalho fixo.
- #177 - Aba Resumo com cards.
- #178 - Historico unificado.

### Fase 2 - Base administrativa e vinculos

Objetivo: garantir que a Central do Aluno tenha dados confiaveis sobre aluno, professor, servico, contrato e permissoes.

Entregas esperadas:

- cadastro completo de aluno;
- cadastro de professor/colaborador;
- vinculo aluno-professor;
- servico/plano contratado;
- catalogo de servicos;
- contrato vinculado ao aluno;
- status do aluno;
- permissao por perfil, bloco e escopo;
- indicacao de dados pendentes ou incompletos.

Issues atuais relacionadas:

- #174 - Separar ficha do aluno de administracao geral.
- #185 - Mapear funcionalidades que pertencem a ficha do aluno.

Pendencia de backlog:

- Criar epico especifico para consolidacao de cadastros, vinculos, servicos, contratos e permissoes base.

### Fase 3 - Entrada inicial do aluno

Objetivo: organizar o fluxo de primeiro registro do aluno e revisao periodica dos dados.

Entregas esperadas:

- fluxo de primeiro cadastro;
- questionarios iniciais;
- PAR-Q;
- AHA;
- dados de emergencia;
- revisao periodica dos dados;
- confirmacao ou atualizacao pelo professor;
- indicacao de pendencias na Central do Aluno.

Pendencia de backlog:

- Criar epico para onboarding/entrada inicial do aluno.

### Fase 4 - PRNT completo

Objetivo: consolidar o PRNT como secao viva da Central do Aluno.

Entregas esperadas:

- resumo tecnico do PRNT;
- anamnese completa e versoes historicas;
- objetivos ativos e anteriores;
- historico de atividade fisica;
- medicamentos;
- cirurgias;
- restricoes;
- dores/desconfortos e acompanhamentos;
- observacoes tecnicas categorizadas;
- integracao com historico unificado do aluno.

Issues relacionadas:

- #171 - Epic de PRNT dentro da Central.
- #180 - Card de PRNT com resumo tecnico e acoes rapidas.
- #181 - Fluxo contextual para objetivos.
- #182 - Fluxo contextual para desconfortos e acompanhamentos.

Pendencias de backlog:

- Criar subissues para anamnese completa, medicamentos, cirurgias, restricoes, historico de atividade fisica e observacoes categorizadas.

### Fase 5 - Antropometria

Objetivo: fechar a avaliacao antropometrica como historico evolutivo do aluno.

Entregas esperadas:

- modelo de dados da antropometria;
- avaliacoes historicas por aluno, data e professor;
- medidas obrigatorias;
- medidas opcionais;
- segmentos configuraveis;
- tooltips, imagens e videos quando aplicavel;
- comparativo entre avaliacoes;
- graficos de evolucao;
- validacoes;
- preparacao para laudo.

Issues relacionadas:

- #172 - Epic de avaliacoes como historico evolutivo.
- #183 - Card de avaliacoes com ultima avaliacao e proxima reavaliacao.
- #184 - Fluxo guiado para nova antropometria.

Pendencias de backlog:

- Criar subissues de modelo de dados, formulario completo, segmentos opcionais, comparacao, graficos e validacoes.

### Fase 6 - Adipometria

Objetivo: estruturar avaliacao por dobras e protocolos de composicao corporal.

Entregas esperadas:

- definicao de protocolos suportados;
- dobras obrigatorias por protocolo;
- regras por idade e sexo quando aplicavel;
- calculo de percentual de gordura;
- gordura absoluta;
- massa magra;
- comparativo historico;
- preparacao para laudo.

Pendencia de backlog:

- Criar epico especifico para adipometria.

### Fase 7 - Treinamento

Objetivo: integrar plano de treino e acompanhamento pratico a Central do Aluno.

Entregas esperadas:

- plano de treino atual;
- historico de treinos;
- vinculo com objetivos;
- vinculo com restricoes e desconfortos;
- rotina semanal;
- treino de hoje;
- acompanhamento de evolucao;
- proxima acao do professor.

Pendencia de backlog:

- Criar epico para treinamento dentro da Central do Aluno.

### Fase 8 - Agenda e frequencia

Objetivo: trazer contexto operacional do aluno para a Central sem eliminar a agenda geral.

Entregas esperadas:

- agenda do aluno dentro da Central;
- agenda geral preservada;
- frequencia recente;
- proximos atendimentos;
- reavaliacoes agendadas;
- alertas de ausencia ou baixa frequencia.

Pendencia de backlog:

- Criar epico para agenda e frequencia integradas a Central.

### Fase 9 - Contratos, servicos e documentos

Objetivo: permitir que a ficha do aluno mostre a situacao administrativa relevante sem misturar com configuracoes gerais.

Entregas esperadas:

- card de contrato/servico na Central;
- historico de contratos;
- servico/plano atual;
- documentos e anexos do aluno;
- renovacoes;
- situacao administrativa conforme permissao;
- separacao entre contrato do aluno e configuracoes gerais de contrato/servico.

Pendencia de backlog:

- Criar epico para contratos, servicos e documentos na Central do Aluno.

### Fase 10 - Relatorios e laudos

Objetivo: gerar entregaveis somente depois de consolidar dados confiaveis e historicos.

Entregas esperadas:

- laudo de antropometria;
- laudo de adipometria;
- relatorio de evolucao;
- relatorio tecnico para professor;
- relatorio resumido para aluno;
- geracao de PDF quando aplicavel;
- historico de laudos gerados.

Pendencia de backlog:

- Criar epico para relatorios e laudos evolutivos.

## Controle de issues

| Fase | Issue | Tipo | Status | Observacao |
| --- | --- | --- | --- | --- |
| 1. Central do Aluno | #170 | Epic | Aberta | Espinha dorsal do produto |
| 1. Central do Aluno | #175 | Subissue | Aberta | Busca e selecao de aluno |
| 1. Central do Aluno | #176 | Subissue | Aberta | Cabecalho fixo |
| 1. Central do Aluno | #177 | Subissue | Aberta | Aba Resumo com cards |
| 1. Central do Aluno | #178 | Subissue | Aberta | Historico unificado |
| UX contextual | #173 | Epic | Aberta | Consulta, historico e atualizacao contextual |
| UX contextual | #179 | Subissue | Aberta | Padrao de pop-up, painel lateral e fluxo guiado |
| PRNT | #171 | Epic | Aberta | PRNT dentro da Central |
| PRNT | #180 | Subissue | Aberta | Card de PRNT |
| PRNT | #181 | Subissue | Aberta | Objetivos do aluno |
| PRNT | #182 | Subissue | Aberta | Desconfortos e acompanhamentos |
| Avaliacoes | #172 | Epic | Aberta | Historico evolutivo de avaliacoes |
| Avaliacoes | #183 | Subissue | Aberta | Card de avaliacoes |
| Avaliacoes | #184 | Subissue | Aberta | Fluxo guiado de antropometria |
| Administracao x ficha | #174 | Epic | Aberta | Fronteira entre Central e administracao geral |
| Administracao x ficha | #185 | Subissue | Aberta | Mapa de funcionalidades |

## Padroes de UX

### Consulta

A consulta deve ser sempre a primeira camada da Central do Aluno. O professor deve entender rapidamente quem e o aluno, qual sua situacao atual e quais pontos exigem atencao.

### Historico

Todo dado evolutivo ou sensivel deve ter visao historica. O historico deve permitir entender o que mudou, quando mudou, quem registrou e qual foi o contexto.

### Atualizacao contextual

Toda atualizacao deve partir do contexto do aluno selecionado. O usuario nao deve precisar sair da ficha do aluno para registrar uma informacao diretamente relacionada a ele.

### Pop-up

Usar para acoes rapidas com ate 5 ou 6 campos.

Exemplos:

- adicionar observacao;
- registrar acompanhamento simples;
- marcar proxima reavaliacao;
- encerrar alerta;
- anexar documento simples.

### Painel lateral

Usar para formularios medios que precisam de contexto, mas nao justificam fluxo completo.

Exemplos:

- editar dados cadastrais;
- atualizar objetivo;
- registrar desconforto com detalhes;
- atualizar parte da anamnese.

### Fluxo guiado

Usar para registros grandes, com etapas, calculos, comparacoes ou muitos campos.

Exemplos:

- nova antropometria;
- nova adipometria;
- avaliacao completa;
- plano de treino;
- emissao de laudo.

## Criterios de pronto por modulo

Um modulo ou bloco da Central do Aluno so deve ser considerado pronto quando tiver:

- [ ] modelo de dados ou fonte de dados definida;
- [ ] API ou consulta necessaria implementada;
- [ ] tela ou bloco de consulta;
- [ ] acao de criacao/edicao quando aplicavel;
- [ ] historico quando aplicavel;
- [ ] permissao por perfil, bloco e escopo;
- [ ] validacoes principais;
- [ ] estados vazio, carregamento e erro;
- [ ] atualizacao visual apos salvar;
- [ ] testes relevantes;
- [ ] documentacao atualizada;
- [ ] validacao manual descrita.

## Validacao manual

Cenarios manuais esperados para validar a evolucao da Central do Aluno:

- pesquisar aluno por nome e abrir ficha centralizada;
- validar cabecalho com dados completos e incompletos;
- navegar entre secoes internas sem perder o aluno selecionado;
- criar uma observacao rapida e confirmar atualizacao do resumo/historico;
- atualizar objetivo e confirmar reflexo no card e no cabecalho;
- registrar acompanhamento de desconforto e confirmar historico;
- iniciar nova avaliacao a partir do aluno selecionado;
- validar restricoes de permissao por perfil;
- validar estados vazios para aluno sem historico.

## Decisoes e pendencias

### Decisoes

- A Central do Aluno sera a referencia principal para trabalhar com dados de um aluno especifico.
- A navegacao por modulos pode existir, mas deve preservar compatibilidade e nao competir com o fluxo central do aluno.
- O desenvolvimento deve priorizar funcionalidades fechadas e coerentes, evitando varias telas pela metade.
- Novas issues devem indicar se pertencem a Central do Aluno, administracao geral ou ambos.

### Pendencias

- Criar epicos faltantes para base administrativa, entrada inicial do aluno, antropometria completa, adipometria, treinamento, agenda/frequencia, contratos/documentos e relatorios/laudos.
- Revisar issues antigas para relacionar com este roadmap.
- Decidir se a nomenclatura final sera Central do Aluno, Aluno 360 ou outro nome de produto.
- Atualizar documentos de produto estaveis quando o fluxo sair de plano ativo e virar decisao consolidada.
