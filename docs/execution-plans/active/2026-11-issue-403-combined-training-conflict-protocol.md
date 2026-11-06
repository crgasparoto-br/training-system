# Plano de implementação — issue #403 / protocolo combinado v1

Data: 2026-11-05. Branch: feat/403-combined-clinical-protocol-v1, base develop. É um registro das etapas e dos bloqueios clínicos externos, não um termo de homologação.

- [x] Formalizar as sete decisões com propostas explícitas e estados de governança em docs/product/combined-training-clinical-protocol-v1.md.
- [x] Criar #534 para validação por profissional habilitado, separada do aceite do Product Owner.
- [x] Disponibilizar avaliador de domínio sem efeitos colaterais, fontes versionadas, capacidade e contrato, com regras ativas vazias.
- [x] Especificar cenários de teste discriminantes para regras de exemplo, jamais tratando a fixture como regra clínica real.
- [ ] Obter homologação real das sete definições em #534, incluindo matrizes de severidade e fontes verificáveis.
- [ ] Carregar regras autorizadas em backend com trilha de configuração/ativação e versionamento de ocorrência.
- [ ] Integrar leitura protegida por permissões e contrato na Montagem Consolidada, reavaliar em mudança de planejamento, execução e revisão de feedback.
- [ ] Expor visão do professor e mensagem do aluno quando segura, preservando capacidades e fontes.
- [ ] Validar testes de API, autorização, cross-tenant, caso real, CI do SHA final e auditoria independente.

**Proibição:** não inferir limiares a partir das propostas, não ativar regra sem assinatura profissional, não automatizar mudanças de treino nem registrar esta issue como fechada.


## Etapa 2 — sinais canônicos para avaliação técnica

- [x] Leitura de sessões com vínculo à liberação operacional consolidada e ao aluno/contrato.
- [x] Leitura estruturada das capacidades, check-in e revisão vigente de feedback.
- [x] Endpoint técnico somente leitura com verificação das duas permissões clínicas.
- [x] Dados sem regras clínicas novas ativas, cobertura parcial e fontes versionadas.
- [ ] Homologação das sete regras (#534), integração à pré-liberação e revisão de segurança em cenário real.
- [x] Teste HTTP cross-tenant e validação completa na PR #537 ([run #42219868297](https://github.com/crgasparoto-br/training-system/actions/runs/42219868297), SHA `b3c31beb168987d9be1c1ef19eee9c663a01a820`).
- [ ] Auditoria independente da etapa 2 em contexto separado, sem presumir aprovação apenas pelo merge.


## Remediação da auditoria da PR #537

- [x] A-001 — separar a leitura cíclica/resistida do grafo operacional e flexibilidade/equilíbrio de `WorkoutDayCapacityOperationalBlock` (contrato físico real do banco).
- [x] A-002 — preservar sinais de feedback por sessão sem atribuir a capacidades e reavaliar revisão vigente por escopo.
- [x] A-003 — vincular cada observação à liberação, versão consolidada, versão de prescrição e registro operacional.
- [x] Ampliar controles unitários negativos, de revisão, cross-source e de integridade; acrescentar teste HTTP/PostgreSQL de liberação real com as quatro capacidades.
- [x] A-004 — preservar dor pós-treino, PSR, tontura, fadiga e sono da revisão atual de feedback específica de cada capacidade, sem atribuir sinais de sessão a outras capacidades.
- [x] A-005 — persistir a capacidade cíclica por dia, mesmo com distância somente no template; manter o CHECK de flexibilidade/equilíbrio e bloquear origem/versão incompatível.
- [x] Casos discriminantes: cíclico só por distância em dia distinto de resistido, proveniência de versão, ausência de vazamento entre dias e rejeição de versão divergente.
- [x] Ampliar os testes unitários positivos/negativos e o teste HTTP/PostgreSQL para criação, correção e releitura das quatro capacidades, incluindo isolamento de revisão e texto livre.
- [x] CI terminal da PR #537 no SHA corretivo `b3c31beb168987d9be1c1ef19eee9c663a01a820` ([run #42219868297](https://github.com/crgasparoto-br/training-system/actions/runs/42219868297)).
- [ ] Auditoria independente em contexto separado, sem aceitar comentários de aprovação como parecer formal.

A homologação clínica #534, as regras combinadas e a integração pré-liberação continuam fora desta etapa. Nenhum limiar foi ativado.

## Etapa 3 — revisão segura na Montagem Consolidada (06/11/2026)

Branch: `feat/403-combined-review-integration` a partir da `develop` após merge da PR #537.

- [x] Vincular ao relatório estruturado da Montagem um snapshot combinado
  exclusivamente de fontes de versão persistidas, sem dados sensíveis,
  `coverage=partial`, `mayConcludeNoConflict=false`.
- [x] Projetar a pré-revisão no acordeão de conflitos e conservar o estado
  de revisão após envio, reavaliação, aprovação e troca de versão.
- [x] Consulta clínica histórica por clique, somente com as duas permissões
  de dados sensíveis, sem enviar regras no request ou aplicar mudanças no treino.
- [x] Testes da projeção segura, caso hipotético com dados insuficientes,
  autorização HTTP cross-tenant e transição draft → revisão; testes web de
  ausência de concessão, clique autorizado e descarte após falha.
- [ ] CI terminal no SHA final desta etapa e auditoria independente em contexto
  separado; homologação profissional #534 continua bloqueando ativação.
- [ ] Avaliação de agenda/temporalidade de sessões **futuras** antes da liberação,
  integração da decisão profissional da #406 e conclusão integral de #403.

A composição em revisão nunca é tratada como "sem risco" só porque as regras
combinadas permanecem inativas. Sem merge automático.

## Correção de segurança da auditoria da PR #538 (A-002)

- [x] Vincular cache clínico à identidade do ator, contrato, `dataScope` e grants.
- [x] Invalidar respostas antigas, ocultar montagem na troca de autorização e revalidar pelo backend.
- [x] Cobrir downgrade `contract` -> `self` com permissões clínicas preservadas,
  troca de ator, resposta tardia e restauração sem reuso do histórico.
- [ ] CI do HEAD corretivo e auditoria independente formal em contexto separado.

O escopo não inclui ativação de regras clínicas nem merge da PR.


## Etapa 4 — agenda futura, prova temporal e revisão (#403)

- [x] Consumir agendamentos `scheduled` de `AgendaBooking`
  por aluno/contrato, com janela futura limitada e autorização da Agenda.
- [x] Exigir associação explícita por capacidade e por versão canônica da
  montagem; revalidar `updatedAt` da reserva, status e
  versão atual da prescrição.
- [x] Converter data/hora local usando fuso IANA explicitamente confirmado;
  identificar horários ambíguos/inexistentes (DST) sem inventar instantes.
- [x] Projetar sequência e intervalo entre fim/início de agendamentos
  comprovados, sempre com `coverage=partial`,
  sem severidade ou limite clínico.
- [x] Expor endpoints de prévia e interface de seleção no fluxo do professor,
  incluindo testes de horário e concorrência, isolamento e autorização.
- [ ] CI terminal verde no SHA final e auditoria independente formal.
- [ ] Formalizar fuso autoritativo do contrato, persistência/versão da
  associação e revalidação no mesmo transaction boundary da liberação
  operacional quando houver regra temporal clínica homologada.
- [ ] Homologação externa #534 e ativação controlada das regras.
