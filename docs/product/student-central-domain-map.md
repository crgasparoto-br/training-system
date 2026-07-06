# Mapa de domínios da Central do Aluno

Este documento define a fronteira entre o que pertence à Central do Aluno, o que permanece em áreas administrativas e o que deve funcionar como fluxo híbrido.

Referências:

- #170 — Central do Aluno.
- #174 — separação entre ficha do aluno e administração geral.
- #185 — matriz de decisão de funcionalidades.
- `docs/execution-plans/active/2026-07-student-central-roadmap.md`.
- `docs/product/integrated-prescription-control.md`.

## Regra de decisão

Uma funcionalidade pertence à **Central do Aluno** quando a ação principal depende de um aluno selecionado e precisa preservar contexto clínico, técnico, histórico ou contratual daquele aluno.

Uma funcionalidade pertence à **administração geral** quando configura catálogo, regra, perfil, usuário, agenda global, permissões ou parâmetro reutilizável por vários alunos.

Uma funcionalidade é **híbrida** quando possui cadastro ou gestão principal fora da Central, mas precisa aparecer na ficha do aluno como resumo, vínculo, estado, histórico ou ação contextual.

## Matriz de classificação

| Funcionalidade | Classificação | Ponto principal | Presença esperada na Central | Dados sensíveis/permissões |
| --- | --- | --- | --- | --- |
| Dados cadastrais do aluno | Central do Aluno | Ficha do aluno | Cabeçalho, dados, contato, status e ações contextuais | `students.details`, dados pessoais, `contractId` |
| Busca/seleção de aluno | Central do Aluno | `/central-do-aluno` | Entrada principal para abrir a ficha | Escopo por contrato e função |
| PRNT/anamnese | Central do Aluno | Ficha do aluno | Resumo, seção, histórico técnico e ações de atualização | Saúde, PAR-Q/AHA, medicamentos, lesões, `students.details.health` |
| Objetivos do aluno | Central do Aluno | Aba Saúde/Anamnese ou PRNT | Objetivo ativo, estado pendente, observações e histórico | Dado técnico do PRNT |
| Desconfortos, dores e restrições | Central do Aluno | PRNT dentro da ficha | Resumo, alertas, acompanhamento e histórico por data | Dados sensíveis de saúde |
| Histórico técnico do aluno | Central do Aluno | Ficha do aluno | Linha do tempo de eventos relevantes do aluno | Depende da origem do dado |
| Avaliações físicas | Central do Aluno | Ficha do aluno | Card, última avaliação, histórico e nova avaliação | Dados físicos sensíveis, permissões por bloco |
| Antropometria/adipometria | Central do Aluno | Fluxo guiado a partir da ficha | Nova medição com aluno pré-selecionado e comparação | Dados físicos sensíveis |
| Prescrição/treinos do aluno | Central do Aluno | Ficha do aluno | Treino atual, plano, histórico e ações de acompanhamento | Dados técnicos do professor |
| Professor responsável pelo aluno | Híbrida | Administração de colaboradores/professores | Exibir responsável e vínculo na ficha | Permissão de vínculo e contrato |
| Cadastro geral de professores | Administração geral | Administração | Apenas referência como responsável quando aplicável | Usuários, funções e permissões |
| Catálogo de serviços | Administração geral | Administração/serviços | Apenas serviço contratado/ativo do aluno | Administração comercial |
| Serviço contratado pelo aluno | Híbrida | Contratos/financeiro e ficha | Status, plano, vigência e vínculo no cabeçalho/resumo | Dados financeiros sensíveis |
| Contratos do aluno | Híbrida | Administração/contratos | Status, vigência, pendências e ação contextual | Financeiro, `contractId`, escopo |
| Agenda geral | Administração geral | Agenda | Não deve virar ficha do aluno | Operação global |
| Agenda do aluno | Híbrida | Agenda e ficha do aluno | Próximos eventos, frequência e faltas | Eventos vinculados ao aluno |
| Documentos do aluno | Híbrida | Documentos/arquivos e ficha | Lista de documentos vinculados e ações de anexar/consultar | LGPD, permissões por tipo |
| Relatórios gerais | Administração geral | Relatórios | Central mostra apenas recortes do aluno | Escopo por contrato e papel |
| Relatórios do aluno | Central do Aluno | Ficha do aluno | Indicadores individuais e evolução | Dados técnicos sensíveis |
| Configurações do sistema | Administração geral | Configurações | Não aparecem na ficha, exceto efeitos aplicados | Administração global |
| Funções e permissões | Administração geral | Configurações/Funções | Apenas controlam o que cada perfil vê na ficha | `screenKey`, `blockKey`, `dataScope` |
| Catálogos técnicos | Administração geral | Administração/catálogos | Itens selecionados aparecem em avaliações ou prescrições | Regras compartilhadas |
| Profissional-paciente/vínculos | Híbrida | Administração de vínculos e ficha | Responsável, equipe autorizada e escopo de atendimento | Escopo, privacidade, autorização |
| Integrações externas | Híbrida | Configurações/integrações | Status e dados importados relevantes ao aluno | Consentimento e origem do dado |

## Regras para itens híbridos

1. O cadastro mestre permanece fora da Central.
2. A Central mostra somente o vínculo, resumo, status, histórico ou ação contextual do aluno selecionado.
3. A ação contextual deve preservar `alunoId`, `contractId` e responsável quando aplicável.
4. Dados sensíveis devem respeitar permissões por tela, bloco e escopo.
5. A Central não deve duplicar telas administrativas completas.

## Critérios para novas issues

Toda nova issue da Central do Aluno deve declarar:

- Classificação: Central, Administração ou Híbrida.
- Ponto principal de acesso.
- O que aparece na ficha do aluno.
- Dados sensíveis envolvidos.
- Permissões ou `blockKey` afetados.
- Se há necessidade de histórico/versionamento.

## Decisões atuais

- A matriz fica em documento estável de produto: `docs/product/student-central-domain-map.md`.
- O plano ativo pode referenciar esta matriz, mas não deve duplicá-la integralmente.
- Em caso de conflito, a regra é manter configurações, catálogos e cadastros globais fora da Central.
