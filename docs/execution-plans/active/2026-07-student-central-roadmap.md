# Plano: Central do Aluno e roadmap integrado do Sistema ACESSO

## Objetivo

Consolidar o Sistema ACESSO em torno da Central do Aluno, permitindo que professor, gestor ou perfil autorizado pesquise um aluno e consulte, analise e atualize sua vida técnica, administrativa e evolutiva sem depender de várias telas desconectadas.

Este documento registra o estado funcional real da branch `develop` em 2026-07-10. O estado de implementação abaixo é independente do estado aberto ou fechado das issues no GitHub.

## Decisões consolidadas

- A Central do Aluno é o eixo principal do produto.
- Informações diretamente vinculadas ao aluno devem ser acessíveis a partir da Central.
- O menu lateral continua existindo, mas não deve ser o caminho principal para trabalhar com um aluno específico.
- Consulta, histórico e atualização devem coexistir no mesmo fluxo.
- Ações rápidas usam pop-up; formulários médios usam painel lateral; registros complexos usam fluxo guiado.
- Depois de salvar, cancelar ou ocorrer erro, o aluno selecionado deve permanecer no contexto.
- Dados sensíveis continuam protegidos por perfil, bloco, escopo e `contractId`.

## Estado atual por fase

### Fase 1 - Central do Aluno

**Situação: implementada funcionalmente, com validações complementares ainda recomendadas.**

Implementado:

- busca e seleção de aluno;
- rota `/central-do-aluno`;
- ficha centralizada por aluno;
- cabeçalho e aba Resumo/Aluno 360;
- cards de situação atual;
- histórico unificado;
- ações contextuais;
- estados vazio, carregamento e erro;
- preservação das rotas antigas por compatibilidade.

Issues relacionadas: #170, #175, #176, #177 e #178.

Pendências de fechamento operacional:

- validar manualmente todos os perfis e escopos;
- confirmar atualização imediata dos cards após todas as ações contextuais;
- revisar se todas as ações retornam corretamente ao aluno selecionado.

### Fase 2 - Base administrativa e vínculos

**Situação: parcialmente estruturada.**

Implementado:

- matriz de decisão entre Central do Aluno, administração geral e fluxos híbridos;
- documentação de fronteiras para alunos, PRNT, avaliações, professores, serviços, contratos, agenda, documentos, relatórios, configurações e permissões.

Issues relacionadas: #174 e #185.

Pendente:

- criar épica específica para consolidação de cadastros, vínculos, serviços, contratos e permissões base;
- validar na prática os resumos administrativos exibidos na Central.

### Fase 3 - Entrada inicial do aluno

**Situação: ainda não consolidada como fase própria.**

Já existem cadastros, PAR-Q, AHA e dados iniciais no sistema, porém ainda falta uma épica que organize:

- primeiro cadastro;
- questionários iniciais;
- dados de emergência;
- revisão periódica;
- confirmação ou atualização pelo professor;
- pendências exibidas na Central.

### Fase 4 - PRNT completo

**Situação: avançada, mas não integralmente concluída.**

Implementado:

- resumo técnico do PRNT na Central;
- estados pendente, parcial e incompleto;
- alertas de PAR-Q/AHA;
- objetivo ativo;
- histórico de atividade física;
- medicações, restrições, histórico médico e observações no resumo;
- fluxo de dores, desconfortos e acompanhamentos;
- criação, acompanhamento e encerramento de desconfortos sem apagar histórico;
- card contextual de desconfortos na Central.

Issues relacionadas: #171, #180, #181 e #182.

Pendente:

- consolidar fluxos completos e históricos próprios para anamnese, medicamentos, cirurgias, restrições, atividade física e observações categorizadas;
- confirmar integração de todos esses eventos com o histórico unificado;
- ampliar testes específicos de permissão e `contractId`.

### Fase 5 - Antropometria

**Situação: primeiro incremento funcional concluído; fase ainda não concluída.**

Implementado:

- card de avaliações na Central;
- estados inexistente, pendente, em dia e vencida;
- última avaliação, tipo, data, responsável e próxima reavaliação;
- histórico recente por data, tipo, responsável, origem e status;
- ação para nova antropometria preservando `alunoId`;
- bloqueio de troca do aluno quando o fluxo parte da Central;
- validação de aluno, data e professor responsável;
- criação e edição da avaliação antropométrica atual;
- histórico de avaliações anteriores em modo somente leitura;
- comparação lado a lado;
- segmentos configuráveis;
- observações gerais e importáveis;
- retorno para a Central.

Issues relacionadas: #172, #183 e #184.

A issue #172 foi encerrada como conclusão do primeiro recorte funcional. A Fase 5 continua aberta porque ainda faltam:

- ciclo de vida formal da avaliação, incluindo rascunho e concluída;
- critérios de conclusão e medidas obrigatórias por protocolo;
- validação de permissões e isolamento por `contractId`;
- garantia de evento no histórico unificado após conclusão;
- comparação com diferenças absolutas e percentuais;
- gráficos de evolução;
- contrato de dados para laudos futuros;
- suíte específica de testes e validação manual.

Fonte detalhada: `docs/execution-plans/active/2026-07-epic-172-completion-assessment.md`.

### Fase 6 - Adipometria

**Situação: não iniciada como épica própria.**

Pendente:

- protocolos suportados;
- dobras obrigatórias por protocolo;
- regras por idade e sexo;
- percentual de gordura;
- gordura absoluta;
- massa magra;
- histórico e comparação;
- preparação para laudo.

A implementação só deve começar depois de estabilizar o ciclo de vida e a rastreabilidade da antropometria.

### Fase 7 - Treinamento

**Situação: módulos existentes, integração completa com a Central ainda pendente.**

Pendente:

- plano atual e histórico dentro da Central;
- vínculo explícito com objetivos, restrições e desconfortos;
- rotina semanal e treino de hoje no contexto do aluno;
- próxima ação do professor;
- acompanhamento evolutivo integrado.

### Fase 8 - Agenda e frequência

**Situação: pendente como fase integrada.**

Pendente:

- agenda do aluno dentro da Central;
- frequência recente;
- próximos atendimentos;
- reavaliações agendadas;
- alertas de ausência ou baixa frequência.

A agenda geral deve ser preservada.

### Fase 9 - Contratos, serviços e documentos

**Situação: parcialmente existente fora da Central.**

Pendente:

- card administrativo do aluno;
- histórico de contratos;
- serviço ou plano atual;
- documentos e anexos;
- renovações;
- situação administrativa conforme permissão.

### Fase 10 - Relatórios e laudos

**Situação: não iniciar antes da consolidação dos dados históricos.**

Pendente:

- laudo de antropometria;
- laudo de adipometria;
- relatório de evolução;
- visões técnica e resumida;
- geração de PDF;
- histórico de laudos.

## Controle de implementação

| Fase | Issues principais | Estado funcional em `develop` | Próximo passo |
| --- | --- | --- | --- |
| 1. Central do Aluno | #170, #175-#178 | Implementada funcionalmente | Validação manual por perfil e atualização pós-ação |
| 2. Base administrativa | #174, #185 | Parcial e documentada | Criar épica de consolidação administrativa |
| 3. Entrada inicial | sem épica própria | Parcialmente existente | Criar épica de onboarding e revisão periódica |
| 4. PRNT | #171, #180-#182 | Avançada | Completar históricos e permissões dos domínios restantes |
| 5. Antropometria | #172, #183, #184 | Primeiro incremento concluído | Criar subissues de conclusão da Fase 5 |
| 6. Adipometria | sem épica própria | Não iniciada | Aguardar estabilização da antropometria |
| 7. Treinamento | sem épica própria | Integração pendente | Criar épica de treinamento na Central |
| 8. Agenda e frequência | sem épica própria | Integração pendente | Criar épica específica |
| 9. Contratos e documentos | sem épica própria | Parcial fora da Central | Criar épica específica |
| 10. Relatórios e laudos | sem épica própria | Não iniciada | Aguardar dados históricos confiáveis |

## Critérios de pronto por módulo

Um módulo ou bloco da Central só deve ser considerado concluído quando tiver:

- modelo ou fonte de dados definida;
- API ou consulta implementada;
- tela ou bloco de consulta;
- ação de criação ou edição quando aplicável;
- histórico quando aplicável;
- permissão por perfil, bloco, escopo e contrato;
- validações principais;
- estados vazio, carregamento e erro;
- atualização visual após salvar;
- testes relevantes;
- documentação atualizada;
- validação manual descrita.

## Próximo passo recomendado

O próximo passo é concluir a Fase 5 por meio de subissues específicas para:

1. ciclo de vida e critérios de conclusão da antropometria;
2. protocolos e medidas obrigatórias/opcionais;
3. timeline e rastreabilidade;
4. permissões e `contractId`;
5. comparação evolutiva analítica;
6. gráficos;
7. contrato de dados para laudos;
8. testes e validação manual.

Não iniciar adipometria, gráficos avançados ou laudos antes de fechar os itens estruturais de ciclo de vida, protocolos, permissões e rastreabilidade.
