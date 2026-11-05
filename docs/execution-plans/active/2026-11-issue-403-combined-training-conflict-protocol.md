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
- [ ] Teste HTTP cross-tenant, validação completa e auditoria independente no SHA final.
