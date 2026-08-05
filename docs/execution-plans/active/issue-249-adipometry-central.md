# Plano: integrar adipometria ADPT à Central do Aluno

## Objetivo

Transformar a aba `Avaliação Física` da Central do Aluno no ponto principal de consulta da adipometria, permitindo visualizar o último resultado vigente, retomar pendências autorizadas, consultar histórico com origem explícita e comparar duas avaliações concluídas.

## Contexto

- Issue #249, dependente das entregas de API (#247) e fluxo guiado web (#248), já incorporadas à `develop`.
- A API `/api/v1/adipometry` é a única fonte de resultados, histórico, revisão vigente e comparação.
- A aba já possui avaliações e uploads legados; a integração ADPT é isolada para que falhas desse domínio não interrompam os demais conteúdos autorizados.
- Referências: `docs/product/adipometry-web.md`, `docs/product/adipometry-central.md`, `docs/architecture/web.md` e `docs/architecture/auth-and-access-control.md`.

## Fora de escopo

- Recalcular resultados antigos no navegador.
- Misturar uploads genéricos ou Antropometria com registros ADPT estruturados.
- Editar ou corrigir avaliações concluídas diretamente na Central.
- Gerar gráficos avançados, laudos ou classificação automática de melhora/piora.
- Alterar contratos, migrations ou fórmulas clínicas.

## Arquivos e módulos principais

- `apps/web/src/components/alunos/AlunoAdipometryEvolutionCard.tsx`
- `apps/web/src/components/alunos/AlunoAdipometryEvolutionCard.test.tsx`
- `apps/web/src/components/alunos/AlunoAdipometryEvolutionTabSection.tsx`
- `apps/web/src/components/alunos/AlunoDetailsTabs.tsx`
- `apps/web/src/components/alunos/AlunoDetailsTabs.adipometry.test.tsx`
- `apps/web/src/services/adipometry.service.ts`
- `docs/product/adipometry-central.md`
- `docs/architecture/auth-and-access-control.md`

## Regras e restrições

- A Central só consulta ADPT quando o usuário possui `students.details.assessments` e `physicalAssessment.adpt.view`.
- Ações de criação e retomada de rascunho exigem `physicalAssessment.adpt.actions.manage`.
- O backend continua responsável por `contractId`, autorização, revisão vigente, valores persistidos e comparação.
- Rascunhos ficam separados do histórico concluído e não entram na comparação.
- Uploads genéricos com nome semelhante a adipometria continuam identificados pela origem e não são tratados como ADPT estruturada.
- Ausência de valor deve aparecer como indisponível, nunca como zero.
- Seções longas usam agrupamento colapsável e a tabela mantém leitura horizontal em telas pequenas.

## Passos de implementação

- [x] Adicionar cliente web para o endpoint de comparação ADPT.
- [x] Criar bloco isolado de resumo, pendências, histórico e comparação na aba `Avaliação Física`.
- [x] Aplicar permissões de visualização e gestão antes de consultar ou exibir ações.
- [x] Adicionar estados de carregamento, vazio, erro localizado, nova tentativa e atualização após retorno à aba.
- [x] Adicionar testes de componente e de montagem na aba para permissão, vazio, resumo, rascunho, comparação e falha.
- [x] Atualizar documentação de produto e acesso.
- [ ] Executar a validação completa no ambiente do repositório e registrar o resultado na PR.

## Critérios de aceite

- [x] A última ADPT concluída mostra data, código, responsável disponível, protocolo/versão e resultados principais.
- [x] Rascunhos aparecem somente para quem possui gestão e podem ser retomados com o aluno preservado.
- [x] Histórico distingue ADPT estruturada de outras avaliações e uploads, com filtro e ordenação estável.
- [x] Comparação aceita duas concluídas, usa a API, mostra dez métricas, unidades, variações e aviso de protocolo diferente.
- [x] Campos ausentes aparecem como `Indisponível`.
- [x] Falha da ADPT não quebra os outros blocos da Central.
- [x] A integração é montada somente na aba `Avaliação Física`, sem duplicação no `Aluno 360`.
- [x] Testes relevantes foram adicionados e a documentação foi atualizada.
- [ ] `pnpm validate` passa no SHA candidato.

## Validação manual

1. Abrir a aba `Avaliação Física` de aluno sem ADPT e confirmar estado vazio e ação contextual conforme permissão.
2. Abrir aluno com concluída e rascunho; conferir resumo, origem, link de detalhe e retomada.
3. Alternar os filtros do histórico e confirmar que upload genérico não vira ADPT estruturada.
4. Selecionar duas concluídas com protocolo igual e depois diferente; conferir tabela, unidades, variações e aviso.
5. Simular falha de listagem e confirmar erro localizado com nova tentativa.
6. Repetir em desktop e viewport móvel, navegando por teclado e validando ausência de overflow da página.

## Decisões e pendências

- A integração é um componente separado do conteúdo legado da aba para reduzir acoplamento e preservar resiliência.
- O nome histórico do responsável é resolvido pelo diretório autorizado; quando não estiver disponível, a interface informa indisponibilidade sem expor identificadores internos.
- A validação completa depende dos workflows existentes porque o ambiente atual não conseguiu clonar o GitHub por indisponibilidade de DNS externo.
