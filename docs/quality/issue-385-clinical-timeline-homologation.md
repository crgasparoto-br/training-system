# Homologação da timeline clínica — Issue #385

## Objetivo e fronteira

Verificar PRNT, Anamnese Inicial, PAR-Q, Antropometria e Adipometria na Central do Aluno sem criar uma segunda fonte de verdade e sem revelar informações clínicas a perfis não autorizados.

Esta especificação distingue **validação automatizada** (CI com PostgreSQL descartável) de **homologação visual/operacional** (navegador real com perfis e dados de teste). Nenhuma etapa manual pode ser assinalada como concluída por inferência da CI.

## Gate automatizado

- No `Validate PR` classificado como CRITICAL, PostgreSQL 16 é iniciado e `prisma migrate deploy` é executado.
- `RUN_DATABASE_INTEGRATION_TESTS=true pnpm --filter @corrida/api test` inclui `student-clinical-timeline-postgres.integration.test.ts`; o runner principal `pnpm test` executa o mesmo gate na CI.
- A suíte isola contratos, usuários e alunos, verifica versões PRNT/Anamnese/PAR-Q, conclusão e correção da ADPT, autoria finalizadora, duplicação antropométrica, cursores e ausência de snapshots sensíveis.
- `student-clinical-timeline.service.test.ts` verifica paginação em lotes de até 200 registros, sem `skip`, em históricos repetidos e com timestamps iguais.
- `student-timeline-pagination.test.ts` e `AlunoHistoricoTab.test.ts` verificam deduplicação da interface e URLs de origem.
- `pnpm validate`, `pnpm access:check` e `pnpm docs:check` permanecem obrigatórios. Registrar **SHA exato** e link do workflow em cada execução.

**Segurança:** usar apenas banco descartável e usuários fictícios na CI. Não utilizar credenciais de produção nem executar migrations de teste sobre bases compartilhadas.

## Checklist manual em homologação (ainda requer execução)

| Cenário | Ação em navegador autenticado | Aceite |
| --- | --- | --- |
| PRNT versionado | Abrir Histórico → evento de objetivo atualizado → Abrir registro original | Abre registro, entidade e versão correspondentes, sem exibir outra revisão |
| Anamnese Inicial | Abrir evento de revisão da Anamnese | Painel original abre a revisão indicada |
| PAR-Q | Abrir evento de submissão PAR-Q | Abre exatamente a submissão selecionada |
| Antropometria | Abrir eventos concluído e corrigido | Mostra avaliação e correção correspondentes; não duplica conclusão anterior |
| Adipometria | Concluir R1, realizar correção R2 com outro finalizador e voltar à timeline | R1 e R2 permanecem presentes, com datas e autores corretos |
| Perfil com somente Audit | Negar blocos clínicos e financeiro; abrir Histórico | Não recebe dados ou links clínicos/financeiros, inclusive pela API |
| Permissão parcial | Conceder apenas um bloco PRNT, negar os demais | Só eventos da categoria permitida são carregados |
| Cross-tenant | Autenticar em contrato B e tentar acessar histórico do aluno A | API não retorna eventos do outro contrato |
| Histórico extenso | Gerar mais de 200 eventos, navegar repetidamente em Carregar eventos anteriores | Sem lacunas nem duplicatas; tempo de resposta observado e registrado |
| Falha localizada | Em homologação, indisponibilizar uma fonte controladamente | Demais domínios continuam carregando; aviso parcial e Tentar novamente funcionam |
| Navegação acessível | Testar teclado, zoom 200% e viewport estreita | Histórico e links navegáveis e legíveis |

## Evidência obrigatória para fechamento da homologação

1. URL da execução de CI no último HEAD, com todos os checks obrigatórios verdes.
2. Relatório de execução real do checklist: ambiente, data, identificadores **fictícios**, perfil/permissões, resultado de cada cenário e capturas sem dados sensíveis.
3. Medição do tempo de resposta das páginas 1, intermediária e profunda em um conjunto de histórico volumoso, sem confundir tempo de UI com tempo de banco.
4. Lista de falhas, correções e repetição de testes afetados, caso qualquer cenário reprove.

**Estado:** roteiro e regressões automatizadas implementados. Homologação manual/visual não executada por este documento; a aprovação operacional depende das evidências acima.
