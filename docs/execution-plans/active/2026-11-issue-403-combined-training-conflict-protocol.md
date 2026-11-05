# Plano de implementação — issue #403 / protocolo combinado v1

Data: 2026-11-05. Branch: feat/403-combined-clinical-protocol-v1, base develop. É um registro das etapas e dos bloqueios clínicos externos, não um termo de homologação.

- [x] Formalizar as sete decisões com propostas explícitas e estados de governança em docs/product/combined-training-clinical-protocol-v1.md.
- [x] Criar #534 para validação por profissional habilitado, separada do aceite do Product Owner.
- [x] Disponibilizar avaliador de domínio sem efeitos colaterais, fontes versionadas, capacidade e contrato, com regras ativas vazias.
- [x] Especificar cenários de teste discriminantes para regras de exemplo, jamais tratando a fixture como regra clínica real.
- [x] Etapa 2: ligar leitura estruturada ao GET canônico de conflitos da Montagem, com versionamento de fontes e estado explícito `no_active_rules`.
- [x] Etapa 2: impedir que permissão de planos conceda acesso automático a check-in e feedback; preservar escopo de aluno/contrato e datas civis sem hora inventada.
- [ ] Verificar CI exact-HEAD da Etapa 2 (testes de serviço, API, contrato e regressão).
- [ ] Obter homologação real das sete definições em #534, incluindo matrizes de severidade e fontes verificáveis.
- [ ] Carregar regras autorizadas em backend com trilha de configuração/ativação e versionamento de ocorrência.
- [ ] Integrar leitura protegida por permissões e contrato na Montagem Consolidada, reavaliar em mudança de planejamento, execução e revisão de feedback.
- [ ] Expor visão do professor e mensagem do aluno quando segura, preservando capacidades e fontes.
- [ ] Validar testes de API, autorização, cross-tenant, caso real, CI do SHA final e auditoria independente.

**Proibição:** não inferir limiares a partir das propostas, não ativar regra sem assinatura profissional, não automatizar mudanças de treino nem registrar esta issue como fechada.
