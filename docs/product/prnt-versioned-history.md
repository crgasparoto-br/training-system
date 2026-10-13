# PRNT: estado atual, histórico versionado e proveniência

## Escopo e fronteira canônica

A issue #384 acrescenta eventos de revisão do prontuário sem criar uma segunda fonte clínica. `ProntuarioRecord` e os agregados filhos continuam fornecendo o **estado atual**. `ProntuarioHistoryEvent` é o log imutável da evolução de cada entidade clínica. A timeline do aluno deve projetar referências aos IDs desse log, sem duplicar snapshots no domínio da timeline.

A separação administrativa é preservada: dados de cadastro, contrato e finanças não entram nos snapshots clínicos; o PRNT não utiliza `AlunoIntakeForm.formResponses` como armazenamento canônico.

## Versão e autoria

Cada evento registra `recordId`, `contractId`, `alunoId`, `entityType`, `entityId`, `version`, `action`, `snapshot`, `actorUserId`, `source` e `createdAt`.

- Uma nova entidade gera `version=1`, `action=created`, `source=prnt-api`.
- Uma edição com mudança real ou encerramento gera a próxima versão na mesma transação da atualização do estado atual.
- Reenvio semanticamente idêntico não cria versão adicional. Omissão de objetivo ativo em salvamento completo equivale a arquivamento, não exclusão.
- Estados `resolved` e `archived` preservam a entidade e sua linha histórica. Em objetivos, `closedAt` distingue o encerramento do último `updatedAt`.
- A migração #384 grava `baseline` do estado encontrado dos registros clínicos anteriores, sem inventar a sequência histórica ausente. `source=legacy-baseline` e `actorUserId=null` identificam origem sem autoria histórica recuperável.
- O banco rejeita `UPDATE` e `DELETE` de `ProntuarioHistoryEvent`. A trilha é append-only; não admite restauração ou edição direta de versões.

Os tipos de evento são `record` (resumo e observações), `goal`, `anamnesisFollowUp`, `activityHistory`, `medicationProcedure`, `painCase`, `painFollowUp` e `discomfortSnapshot`.

Questionários PAR-Q e Anamnese Inicial **permanecem nos fluxos canônicos existentes**, respectivamente `StudentParqSubmission` e `StudentHealthIntake`. Cada submissão histórica de PAR-Q conserva data e versão de catálogo; o acompanhamento profissional vincula `parqSubmissionId` e ganha revisão própria no PRNT. O endpoint de histórico do PRNT não copia as respostas de PAR-Q.

## API e UI

- Estado atual: `GET /api/v1/prontuario/alunos/:alunoId`, projeção protegida por blocos individuais.
- Histórico: `GET /api/v1/prontuario/records/:recordId/history/:entityType`.
- Filtros opcionais de histórico: `entityId`, `version` (inteiro positivo) e `skip`. Consulta limitada a 100 eventos por página; não substitui o estado atual.
- A interface de PRNT exibe versões no painel lateral, por categoria, apenas quando a permissão de resumo e a do respectivo bloco estão presentes. O professor altera o estado de objetivo pelo editor; não apaga versões.

## Segurança e consumidores

A autenticação e `screenKey=physicalAssessment.protocol` antecedem os endpoints. A consulta de histórico exige `physicalAssessment.prnt.summary` e também o `blockKey` clínico da categoria. A API sempre consulta por `contractId` e pelo aluno pertencente ao registro; a interface não substitui essa proteção.

O catálogo atual não registra `physicalAssessment.protocol` como tela que aceita `dataScope` customizável; portanto essa superfície não ganha um escopo configurável implícito nesta issue. Para essa tela, a política vigente é isolamento por contrato e por bloco, sem relaxar a fronteira do tenant.

A Prescrição continua apontando aos registros de origem pelo ID canônico e mantém suas próprias `sourceRefs` e versões; esta issue não permite que a Prescrição edite o PRNT. Um `ProntuarioGoal.id` permanece estável entre revisões, evitando invalidar `CapacityPrescriptionGoalLink`. Quando um consumidor precisar distinguir versões do mesmo objetivo, o par `entityId + version` de `ProntuarioHistoryEvent` oferece a identidade rastreável.

## Validação e implantação

Aplicar a migration antes de iniciar a API atualizada e gerar o Prisma Client. Executar testes de serviços/histórico, `pnpm validate`, as verificações de arquitetura, acesso e documentação, além de inspecionar CI no SHA exato da PR. Não executar mudança em produção nem merge automaticamente.

A recuperação pré-#384 limita-se ao estado persistido na data da migração: versões anteriores que nunca foram gravadas não podem ser reconstruídas com segurança.
