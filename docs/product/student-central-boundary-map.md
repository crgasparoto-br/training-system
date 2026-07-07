# Central do Aluno: matriz de fronteira com administração geral

## Objetivo

Esta matriz define quais funcionalidades pertencem à Central do Aluno, quais permanecem em administração geral e quais são híbridas. Ela deve ser usada para orientar novas issues, evitar que a Central vire uma tela de administração e garantir que tudo que dependa diretamente do aluno selecionado tenha acesso ou resumo contextual.

## Regra de decisão

Uma funcionalidade pertence à **Central do Aluno** quando a ação principal depende de um aluno específico e precisa manter contexto, histórico ou tomada de decisão técnica sobre esse aluno.

Uma funcionalidade pertence à **administração geral** quando configura catálogos, parâmetros, pessoas, permissões ou regras reutilizadas por vários alunos.

Uma funcionalidade é **híbrida** quando a configuração principal é administrativa, mas o vínculo, status, resumo ou ação contextual precisa aparecer dentro da ficha do aluno.

## Matriz de classificação

| Funcionalidade | Classificação | Ponto principal | Presença esperada na Central | Permissão/dado sensível |
| --- | --- | --- | --- | --- |
| Dados cadastrais do aluno | Central do Aluno | Ficha do aluno | Dados, revisão e ações contextuais de edição quando permitido | `students.details.profile`, dados pessoais |
| Busca/seleção de aluno | Central do Aluno | Central/Listagem de alunos | Porta de entrada para a ficha centralizada | Respeita escopo do usuário |
| PRNT/anamnese/PAR-Q | Central do Aluno | Ficha do aluno e protocolo PRNT | Resumo técnico, histórico, alertas e ação para atualizar | `students.details.health`, dado sensível de saúde |
| Objetivos do aluno | Central do Aluno | Ficha do aluno | Objetivo ativo, histórico e ações de atualização/acompanhamento | Pode afetar prescrição e avaliação |
| Dores, desconfortos e restrições | Central do Aluno | Ficha do aluno/PRNT | Alertas, histórico e acompanhamento contextual | Dado sensível de saúde |
| Avaliações físicas do aluno | Central do Aluno | Ficha do aluno | Card, última avaliação, histórico, comparação e nova avaliação | `students.details.assessments`, dado técnico/sensível |
| Antropometria do aluno | Central do Aluno | Protocolo iniciado com `alunoId` | Entrada guiada a partir do card de avaliações | Deve preservar aluno, data e responsável |
| Adipometria do aluno | Central do Aluno | Protocolo físico futuro | Resumo e histórico quando implementada | Dado sensível de composição corporal |
| Plano de avaliações do aluno | Híbrida | Ficha do aluno e configuração de tipos | Cadência, próximos checkpoints e tipos ativos do aluno | `students.details.assessmentPlan` |
| Tipos/catálogos de avaliação | Administração geral | Administração/configuração | Apenas nome, status e cadência aplicada ao aluno | Configuração global |
| Professores/colaboradores | Administração geral | Administração de equipe | Apenas responsável, vínculos e permissões aplicáveis ao aluno | Dados de equipe/permissões |
| Vínculo aluno-professor | Híbrida | Administração/ficha do aluno | Professor responsável e contexto de atendimento | Afeta escopo e acesso |
| Serviços/catálogo de planos | Administração geral | Administração comercial | Apenas serviço contratado e características relevantes | Configuração global/comercial |
| Contrato do aluno | Híbrida | Contratos/administração e ficha do aluno | Status, vigência, plano, vínculo e ações permitidas | Dados financeiros/comerciais |
| Agenda geral | Administração geral | Agenda | Nenhuma gestão geral dentro da Central | Eventos podem ser resumidos por aluno |
| Agenda do aluno | Híbrida | Agenda e ficha do aluno | Próximos eventos, faltas, frequência e ações contextuais | Pode afetar presença e cobrança |
| Treinos e planos do aluno | Central do Aluno | Ficha do aluno/treinos | Treino de hoje, plano ativo, histórico e ações | `students.details.trainingPlans` |
| Prescrição integrada | Híbrida | Módulo técnico e ficha do aluno | Resumo, pendências e origem dos dados usados | Deve rastrear origem técnica |
| Documentos do aluno | Central do Aluno | Ficha do aluno | Documentos vinculados ao aluno, uploads e histórico | Pode conter dados pessoais/sensíveis |
| Documentos/modelos gerais | Administração geral | Administração/documentos | Apenas documentos gerados ou aplicados ao aluno | Configuração global |
| Relatórios/laudos do aluno | Central do Aluno | Ficha do aluno/relatórios | Laudos, relatórios e evolução vinculados ao aluno | Dado sensível/técnico |
| Relatórios gerenciais | Administração geral | Relatórios/administração | Não aparecem como função da Central, salvo indicadores do aluno | Pode ter dados agregados |
| Integrações do aluno | Híbrida | Configuração/contas conectadas e ficha do aluno | Status, conta conectada, última sincronização e dados aplicáveis | Escopo por aluno/conta |
| Configurações do sistema | Administração geral | Configurações | Não entram na Central; apenas efeito aplicado quando relevante | Permissões administrativas |
| Permissões, perfis e blocos | Administração geral | Administração de acesso | A Central apenas respeita `blockKey`, `screenKey`, escopo e `contractId` | Segurança/acesso |
| Auditoria/histórico unificado | Central do Aluno | Ficha do aluno | Linha do tempo do aluno e rastreabilidade de ações relevantes | Pode expor dados sensíveis por permissão |

## Regras para novas issues

1. Toda issue da Central deve declarar qual item da matriz está sendo alterado.
2. Toda funcionalidade híbrida deve explicitar o que fica na administração e o que aparece na Central.
3. Toda ação que usa dados sensíveis deve citar o bloco/permissão esperado.
4. Toda ação iniciada pela Central deve preservar o aluno selecionado e evitar troca acidental de contexto.
5. Toda funcionalidade administrativa exibida na Central deve aparecer como resumo, vínculo ou ação contextual, não como cadastro geral completo.

## Aplicação imediata

- PRNT, avaliações e antropometria permanecem como funcionalidades da Central do Aluno.
- Professores, serviços, tipos de avaliação, permissões e configurações permanecem fora da Central como administração geral.
- Contratos, agenda, plano de avaliações e integrações são híbridos: a gestão pode ser externa, mas o aluno precisa ver status/resumo e ações contextuais.

## Pendências para issues futuras

- Revisar issues antigas para indicar a classificação da matriz.
- Criar subissues específicas para objetivos, desconfortos, documentos e laudos quando forem priorizados.
- Definir política de aprovação para alterar esta matriz quando houver conflito entre Central e administração.
