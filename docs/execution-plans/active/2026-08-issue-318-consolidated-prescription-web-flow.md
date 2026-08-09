# Plano: issue #318 - fluxo web da Montagem Consolidada

## Objetivo

Entregar o fluxo web do professor para montar, revisar e aprovar a Montagem Consolidada da Prescrição, preservando o contexto do aluno e consumindo exclusivamente os contratos autoritativos da API implementados pela issue #317.

## Contexto

- Issue: #318.
- Dependência #317 concluída em `develop` pela PR #322.
- Fonte de verdade do domínio: `docs/product/consolidated-prescription-model.md`.
- Fonte da experiência web desta entrega: `docs/product/consolidated-prescription-web-flow.md`.
- A Montagem Consolidada é a fronteira entre prescrição por capacidades e a futura saída operacional; esta entrega não publica Treino de hoje.

## Fora de escopo

- Cálculo de conflito no frontend.
- Geração ou publicação do Treino de hoje.
- Feedback pós-treino.
- Decisão técnica automática.
- Reconstrução do Workout Builder.
- Envio de WhatsApp.
- Operações em massa.

## Arquivos e modulos principais

- `apps/web/src/pages/ConsolidatedPrescription.tsx`
- `apps/web/src/pages/ConsolidatedPrescription.test.tsx`
- `apps/web/src/services/consolidated-prescription.service.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/components/alunos/AlunoResumoHubTab.tsx`
- `docs/product/consolidated-prescription-web-flow.md`

## Regras e restricoes

- `contractId`, `dataScope`, ator, versão e transições continuam sendo autoridade do backend.
- Permissões usam os blocos `plans.consolidatedPrescriptions.view`, `manage` e `approve` existentes.
- A UI não promove localmente uma montagem para `approved` antes da resposta da API.
- Toda mutação após a criação usa `expectedCurrentVersion`.
- Um `409` preserva edição local e exige reconciliação explícita.
- O `alunoId` permanece na rota da Central do Aluno durante todo o fluxo.
- Telas longas agrupam seções relacionadas em componentes colapsáveis.

## Passos de implementacao

- [x] Mapear contrato e estados da API da issue #317.
- [x] Criar client web para montagem, conflitos, workflow e histórico.
- [x] Criar rota protegida por aluno e ponto de entrada na Central do Aluno.
- [x] Implementar seções colapsáveis, estados, permissões e concorrência otimista.
- [x] Adicionar testes focados para contexto, aprovação autoritativa e conflito `409`.
- [x] Documentar o fluxo web e seus limites.
- [ ] Executar gates completos do repositório em ambiente com checkout/dependências disponíveis.
- [ ] Registrar evidência visual desktop/mobile em ambiente executável.
- [ ] Realizar auditoria independente em contexto separado após congelar o candidato.

## Criterios de aceite

- [x] Testes relevantes foram adicionados ou atualizados.
- [x] Documentacao foi atualizada.
- [ ] `pnpm validate` passa.
- [x] Riscos conhecidos foram registrados no plano e serão registrados no PR.

## Validacao manual

1. Abrir a Central do Aluno e acessar a montagem sem trocar o aluno selecionado.
2. Validar cabeçalho com aluno, professor, versão, estado, origem e datas.
3. Percorrer as oito seções por teclado em desktop e mobile.
4. Confirmar estado sem montagem e capacidade indisponível.
5. Salvar rascunho com as quatro capacidades e justificativa.
6. Enviar rascunho persistido para revisão.
7. Confirmar que `warning` não aparece como bloqueador crítico e `critical` impede aprovação.
8. Aprovar somente com bloco `approve` e confirmar que a UI só mostra `Aprovada` após resposta do backend.
9. Simular `409`, verificar preservação dos campos locais e usar recarga explícita para reconciliar.
10. Consultar versões históricas em modo somente leitura.
11. Confirmar que usuário sem `view` não recebe ponto de entrada e que ausência de `manage`/`approve` não bloqueia outras áreas autorizadas da ficha do aluno.

## Decisoes e pendencias

- O contrato atual da Montagem Consolidada não expõe edição de exercícios individuais; por isso a UI organiza blocos de capacidade e não cria um editor paralelo.
- A seleção usa a versão ativa pública apenas como candidato; a elegibilidade definitiva é revalidada pelo backend.
- A execução está em modo connector-only porque o ambiente local não conseguiu resolver `github.com`; por isso os gates locais e screenshots permanecem pendentes até execução via CI/ambiente com checkout.
- A entrega não faz merge e permanece pendente de auditoria independente após o candidato final.
