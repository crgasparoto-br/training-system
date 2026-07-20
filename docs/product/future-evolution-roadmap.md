# Evolucoes complementares do fluxo integrado — issue #139

## Status e autoridade

Este documento preserva o recorte funcional registrado na issue #139 e os requisitos complementares que ainda nao foram convertidos em epics especificas.

Ele **nao e um segundo roadmap geral**. A fonte de verdade para estado funcional, maturidade e ordem de prioridade do produto e [`roadmap.md`](roadmap.md). Em caso de divergencia, o roadmap canonico prevalece e este arquivo deve ser atualizado.

A experiencia detalhada de treinamento centrada no aluno permanece em [`student-centered-training-experience.md`](student-centered-training-experience.md).

## Objetivo do recorte

Separar o nucleo obrigatorio do fluxo integrado das evolucoes futuras que devem virar issues proprias antes de qualquer implementacao.

## Nucleo inicial preservado

O nucleo atual deve continuar preservando:

- cadastro de alunos, colaboradores, contratos, servicos e agenda atual;
- Manual do Professor como conteudo consultavel e fonte de conduta;
- PRNT e avaliacao fisica como fonte tecnica historica;
- prescricao por capacidades fisicas como camada tecnica;
- Montagem Consolidada como filtro obrigatorio antes de qualquer saida operacional;
- Treino de hoje como saida pratica de execucao;
- feedback pos-treino e decisao sugerida como evidencia para nova decisao, sempre validada pelo professor;
- permissoes, escopos de dados, contrato, aluno, professor responsavel, origem e versao.

Nenhuma evolucao futura deve remover ou substituir esse nucleo sem migration explicita quando aplicavel, compatibilidade, testes e issue propria.

## Rastreabilidade minima para extensoes

As entidades criadas ou preparadas nas fases relacionadas ao fluxo integrado devem manter dados suficientes para receber novas fontes no futuro:

| Camada | Dados que precisam permanecer rastreaveis | Uso futuro |
| --- | --- | --- |
| PRNT e avaliacao | aluno, contrato, data, professor, origem, versao, observacoes e alertas | relatorios evolutivos, integracoes clinicas e apoio a prescricao |
| Prescricao por capacidade | capacidade, status, origem, objetivos vinculados, parametros, justificativa e mensagem ao aluno | montagem, relatorios, exportacao futura e decisoes sugeridas |
| Montagem Consolidada | versao, blocos usados, dados-base, conflitos, validacao e professor responsavel | Treino de hoje rastreavel, auditoria e revisao tecnica |
| Feedback pos-treino | treino executado, montagem, execucoes, capacidade, aderencia, queixas e decisao sugerida | linha do tempo, retencao, relatorios e futuras recomendacoes |

## Smartwatch e provedores externos

Escopo futuro:

- exportar treinos ciclicos ou aerobicos e protocolos de teste;
- importar distancia, pace, frequencia cardiaca, tempo em zona, sono, estresse e recuperacao;
- tratar dados externos como evidencia, nunca como decisao automatica;
- registrar origem, provedor, data, consentimento, contrato e aluno;
- exigir validacao tecnica antes de influenciar prescricao, montagem ou decisao sugerida.

Fora do escopo atual:

- conectar APIs externas;
- criar sincronizacao em background;
- liberar treino para smartwatch sem Montagem Consolidada validada.

## Notificacoes e mensagens praticas

Escopo futuro:

- lembrete de treino, pagamento, reavaliacao, pendencia de feedback e ajuste de prescricao;
- dicas do dia e mensagens praticas para o aluno;
- envio por celular, tela do aluno ou WhatsApp quando houver consentimento e canal configurado;
- mensagens geradas a partir de dados validados, sem transformar WhatsApp em fonte tecnica.

Regras obrigatorias:

- aluno recebe linguagem pratica, clara e segura;
- professor ve contexto tecnico, origem e justificativa;
- notificacao financeira nao mistura dados sensiveis de saude;
- mensagens futuras respeitam permissao, contrato, consentimento e finalidade.

## Relatorios evolutivos

Escopo futuro:

- linha do tempo com avaliacao, PRNT, prescricao, montagem, treino, execucao, feedback, aderencia e alertas;
- indicadores de treino: sessoes, tempo, constancia, prescritas, realizadas, tonelagem, calorias, PSE, PSR e aderencia;
- indicadores clinicos ou evolutivos: peso, sono, qualidade do sono, estresse, frequencia cardiaca de repouso, variabilidade de frequencia cardiaca, pressao arterial, LDL, HDL, hemoglobina glicada, VO2max, circunferencia abdominal e percentual de gordura;
- visoes separadas para professor, gestor e aluno.

Regras obrigatorias:

- dado clinico exige permissao especifica;
- relatorio aponta origem e data do dado;
- dados externos entram como evidencia validada;
- comparativos nao sobrescrevem historico antigo.

## Agenda integrada, colaboradores e ambiente

Escopo futuro:

- disponibilidade de professores, estagiarios, gestores, administrativo, limpeza e prestadores;
- lotacao de alunos conforme horario, servico contratado, ambiente e responsavel;
- materiais de sala, equipamentos, recursos disponiveis e restricoes de ambiente;
- substituicao de professor em falta, ferias ou viagem;
- plano alternativo com elastico, estrutura disponivel e avaliacao antes de viagem.

Regras obrigatorias:

- agenda nao vira origem tecnica de treino sem prescricao validada;
- disponibilidade operacional nao substitui permissao de dado sensivel;
- substituto ve somente o resumo pratico necessario, sem prontuario completo quando nao autorizado.

## Cadastro profissional, servicos e contratos

Escopo futuro:

- cadastro profissional com CREF, curriculo resumido, link externo, foto profissional, situacao atual, cargo ou funcao e valores por servico;
- catalogo de servicos alimentando cadastro do aluno, contrato, valor mensal, servico vigente e regras comerciais;
- contrato do aluno gerado por dados cadastrais, servico vigente, condicao especial, valor, dia de pagamento e modelo configuravel;
- controle financeiro e notificacoes conectados a servico vigente, pagamento e aderencia.

Regras obrigatorias:

- dados financeiros permanecem separados de prescricao tecnica;
- contrato e pagamento nao viram regra automatica de treino;
- qualquer nova permissao entra no catalogo de acesso e passa pelo check de acesso.

## Backlog complementar preservado

Cada item deve virar issue ou epic propria antes da implementacao:

1. Persistir feedback pos-treino e decisao sugerida com API e permissoes.
2. Expor linha do tempo evolutiva do aluno usando dados do fluxo integrado.
3. Criar relatorios de aderencia e retencao para gestor.
4. Modelar integracao externa como evidencia importada com origem, consentimento e auditoria.
5. Preparar exportacao de treino aerobico para smartwatch somente apos Montagem Consolidada validada.
6. Criar notificacoes de pagamento, treino, feedback e reavaliacao.
7. Evoluir agenda integrada com disponibilidade de colaboradores e ambiente.
8. Expandir cadastro profissional e catalogo de servicos com regras comerciais.
9. Criar fila de curadoria para exercicios novos e substituicoes por grupamento muscular.
10. Criar plano alternativo para ferias, faltas, viagens e professor substituto.

Os itens que ja estiverem cobertos pelo [`roadmap.md`](roadmap.md) ou por uma issue aberta devem ser executados pela fonte mais especifica e recente, sem duplicar backlog.

## Nao fazer nesta fase

- nao implementar integracoes externas;
- nao implementar smartwatch;
- nao implementar notificacoes inteligentes sem consentimento, finalidade e fonte validada;
- nao automatizar prescricao sem professor;
- nao expor justificativa tecnica completa ao aluno;
- nao refatorar destrutivamente agenda, contratos, servicos, execucoes ou permissoes.

## Regra de manutencao

Ao transformar um item deste recorte em epic ou issue:

1. registrar o vinculo com a issue #139 quando aplicavel;
2. atualizar o roadmap canonico apenas se prioridade ou maturidade mudar;
3. remover daqui o item duplicado ou substitui-lo por referencia explicita a nova issue;
4. preservar as regras permanentes na fonte de produto ou arquitetura correspondente.
