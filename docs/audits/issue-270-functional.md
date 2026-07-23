# Auditoria funcional — issue 270

Data: 2026-07-22

Branch auditada: `feat/270-pre-registration-admin`

Pull request: #280

## Parecer

A implementação atende ao fluxo administrativo solicitado para leads e pré-matrículas, mantendo alunos ativos fora do módulo e preservando a separação entre dados comerciais e respostas clínicas.

## Matriz de verificação

| Requisito | Resultado | Evidência principal |
| --- | --- | --- |
| Lista, criação, detalhe e edição em rotas recarregáveis separadas | Aprovado | Rotas `/pre-matriculas`, `/pre-matriculas/nova`, `/pre-matriculas/:id` e `/pre-matriculas/:id/editar` registradas em `apps/web/src/App.tsx`. |
| Permissões granulares no frontend e na API | Aprovado | Tela, ações e escopos adicionados em `packages/types/access-control.ts`; middleware por tela/bloco e nova validação no serviço. |
| Isolamento por contrato e escopo `self`, `managed` ou `contract` | Aprovado | Todas as consultas administrativas incluem `contractId` e o filtro de escopo calculado pelo controle de acesso. |
| Cadastro mínimo de lead | Aprovado | Nome, origem e telefone ou e-mail são validados na interface e na rota da API. |
| Deduplicação | Aprovado | CPF bloqueia; e-mail/telefone exigem revisão e confirmação; candidatos acessíveis podem ser abertos; candidatos fora do escopo permanecem anonimizados. |
| Lista operacional completa | Aprovado | Exibe etapa, convite, progresso, origem, responsável, última atividade, alerta do PAR-Q e próxima ação. |
| Busca, filtros, ordenação e paginação no backend | Aprovado | Filtros por texto, etapa, convite, responsável, origem, períodos, revisão pendente e alerta do PAR-Q são enviados à API. |
| Ficha administrativa sem respostas clínicas | Aprovado | A projeção retorna somente estados resumidos, nomes de pendências e indicador de alerta; `responses` do PAR-Q e conteúdo clínico não são selecionados. |
| Convites seguros | Aprovado | Link bruto somente na resposta de geração, cópia automática com fallback, confirmação para substituir, motivo e confirmação para revogar, primeiro acesso e validade exibidos. |
| Descarte e reabertura | Aprovado | Descarte revoga convite ativo antes da transição e registra motivo; reabertura preserva histórico e não reativa convite antigo. |
| Revisão e preparação da matrícula | Aprovado | Revisão utiliza a transição canônica para `READY_FOR_ENROLLMENT`; contratação e ativação permanecem no fluxo existente. |
| Aluno já ativo | Aprovado | A API devolve conflito estruturado com destino da Central do Aluno e a interface redireciona sem expor erro técnico. |
| Concorrência e dados desatualizados | Aprovado | Conflitos conhecidos provocam recarga do estado atual e mensagem orientativa; há ação explícita de atualização. |
| Estados de interface | Aprovado | Carregamento, vazio, sem resultados, falha recuperável, cópia malsucedida e convite expirado possuem tratamento visível. |
| Testes automatizados | Aprovado | Cobertura de catálogo/perfis de acesso e dos controles de substituição, revogação e fallback de cópia do convite. |

## Observações de risco

- O descarte usa um fluxo coordenado seguro: primeiro revoga o convite e depois executa a transição canônica. Se a segunda etapa sofrer conflito concorrente, o convite permanece revogado, que é o estado mais restritivo; a interface recarrega o registro para orientar a correção.
- A ordenação por última atividade usa os campos administrativos atualizados pelo ciclo, onboarding e operações relacionadas. A data exibida é calculada pela atividade mais recente disponível na projeção.
- Observações comerciais e unidade permanecem na projeção administrativa do perfil canônico e não são tratadas como respostas clínicas.

## Conclusão

A issue está funcionalmente pronta para revisão da pull request. O merge continua condicionado à autorização explícita do responsável pelo repositório.
