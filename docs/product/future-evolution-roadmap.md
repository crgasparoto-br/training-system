# Roadmap de evolucoes futuras do fluxo integrado

Este documento registra o recorte da issue #139. Ele separa o nucleo inicial do fluxo integrado das evolucoes futuras que devem virar issues proprias antes de qualquer implementacao.

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

Nenhuma evolucao futura deve remover ou substituir esse nucleo sem migration explicita, compatibilidade, testes e issue propria.

## Rastreabilidade minima para extensoes

As entidades criadas ou preparadas nas fases #135 a #138 devem manter dados suficientes para receber novas fontes no futuro:

| Camada | Dados que precisam permanecer rastreaveis | Uso futuro |
| --- | --- | --- |
| PRNT e avaliacao | aluno, contrato, data, professor, origem, versao, observacoes e alertas | relatórios evolutivos, integracoes clinicas e apoio a prescricao |
| Prescricao por capacidade | capacidade, status, origem, objetivos vinculados, parametros, justificativa e mensagem ao aluno | montagem, relatorios, exportacao futura e decisoes sugeridas |
| Montagem Consolidada | versao, blocos usados, dados-base, conflitos, validacao e professor responsavel | Treino de hoje rastreavel, auditoria e revisao tecnica |
| Feedback pos-treino | treino executado, montagem, execucoes, capacidade, aderencia, queixas e decisao sugerida | linha do tempo, retencao, relatorios e futuras recomendacoes |

## Smartwatch e provedores externos

Escopo futuro:

- exportar treinos ciclicos/aerobicos e protocolos de teste;
- importar distancia, pace, FC media, FC maxima, tempo em zona, sono, estresse e recuperacao;
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
- dicas do dia e mensagens praticas para aluno;
- envio por celular, tela do aluno ou WhatsApp quando houver consentimento e canal configurado;
- mensagens geradas a partir de dados validados, sem transformar WhatsApp em fonte tecnica.

Regras obrigatorias:

- aluno recebe linguagem pratica, clara e segura;
- professor ve contexto tecnico, origem e justificativa;
- notificacao financeira nao deve misturar dados sensiveis de saude;
- mensagens futuras devem respeitar permissao, contrato e finalidade.

## Relatorios evolutivos

Escopo futuro:

- linha do tempo com avaliacao, PRNT, prescricao, montagem, treino, execucao, feedback, aderencia e alertas;
- indicadores de treino: sessoes, tempo, constancia, prescritas, realizadas, tonelagem, calorias, PSE, PSR e aderencia;
- indicadores clinicos/evolutivos: peso, sono, qualidade do sono, sono profundo/leve, estresse, FC repouso, variabilidade de FC, PA sistolica/diastolica, LDL, HDL, hemoglobina glicada, VO2max, circunferencia abdominal e percentual de gordura;
- visao separada para professor, gestor e aluno.

Regras obrigatorias:

- dado clinico exige permissao especifica;
- relatorio deve apontar origem e data do dado;
- dados externos precisam entrar como evidencia validada;
- comparativos nao podem sobrescrever historico antigo.

## Agenda integrada, colaboradores e ambiente

Escopo futuro:

- disponibilidade de professores, estagiarios, gestores, administrativo, limpeza e servicos;
- lotacao de alunos conforme horario, servico contratado, ambiente e responsavel;
- materiais de sala, equipamentos, recursos disponiveis e restricoes de ambiente;
- substituicao de professor em falta, ferias ou viagem;
- plano alternativo com elastico, estrutura disponivel e avaliacao antes de viagem.

Regras obrigatorias:

- agenda nao pode virar origem tecnica de treino sem prescricao validada;
- disponibilidade operacional nao substitui permissao de dado sensivel;
- substituto deve ver resumo pratico necessario, nao prontuario completo sem permissao.

## Cadastro profissional, servicos e contratos

Escopo futuro:

- cadastro profissional com CREF, curriculo resumido, link externo, foto profissional, situacao atual, cargo/função e valores por servico;
- catalogo de servicos alimentando cadastro do aluno, contrato, valor mensal, servico vigente e regras comerciais;
- contrato do aluno gerado por dados cadastrais, servico vigente, condicao especial, valor, dia de pagamento e modelo configuravel;
- controle financeiro/notificacoes conectado a servico vigente, pagamento e aderencia.

Regras obrigatorias:

- dados financeiros ficam separados de prescricao tecnica;
- contrato e pagamento nao podem virar regra automatica de treino;
- qualquer nova permissao deve entrar no catalogo de acesso e passar pelo check de acesso.

## Backlog recomendado

Cada item abaixo deve virar issue propria antes de implementacao:

1. Persistir feedback pos-treino e decisao sugerida com API e permissoes.
2. Expor linha do tempo evolutiva do aluno usando dados das fases #135 a #138.
3. Criar relatorios de aderencia e retencao para gestor.
4. Modelar integracao externa como evidencia importada com origem, consentimento e auditoria.
5. Preparar exportacao de treino aerobico para smartwatch apos Montagem Consolidada validada.
6. Criar notificacoes de pagamento, treino, feedback e reavaliacao.
7. Evoluir agenda integrada com disponibilidade de colaboradores e ambiente.
8. Expandir cadastro profissional e catalogo de servicos com regras comerciais.
9. Criar fila de curadoria para exercicios novos e substituicoes por grupamento muscular.
10. Criar plano alternativo para ferias, faltas, viagens e professor substituto.

## Nao fazer nesta fase

- Nao implementar integracoes externas.
- Nao implementar smartwatch.
- Nao implementar notificacoes inteligentes.
- Nao automatizar prescricao sem professor.
- Nao expor justificativa tecnica completa ao aluno.
- Nao refatorar destrutivamente agenda, contrato, servicos, execucoes ou permissoes.
