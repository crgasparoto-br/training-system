# Adipometria (ADPT) — fluxo guiado da camada web

A rota `/protocolo-avaliacao-fisica/adipometria` é a interface operacional para criar, retomar, calcular, concluir e corrigir avaliações ADPT. A API montada em `/api/v1/adipometry` permanece autoritativa para segurança, responsável clínico, protocolo, cálculo, concorrência, conclusão e histórico.

## Entrada e contexto

- A abertura direta permite selecionar apenas alunos retornados pelas consultas autenticadas do contrato.
- `?alunoId={id}` representa entrada pela Central do Aluno, preserva esse aluno e bloqueia troca acidental.
- Uma seleção feita na abertura direta permanece estado da própria tela e não passa a simular origem pela Central após navegação ou recarga.
- `?assessmentId={id}` abre exatamente a avaliação solicitada. A tela rejeita combinações em que o registro não pertence ao aluno preservado ou selecionado.

## Ator e responsável clínico

O ator auditável é sempre derivado da sessão autenticada. O responsável clínico é um professor ativo do mesmo contrato:

- a API lista somente responsáveis elegíveis do contrato autenticado;
- o professor autenticado é usado como padrão somente quando continua elegível;
- sem padrão válido, a criação permanece bloqueada até seleção explícita;
- professor inativo, desligado, de outro contrato ou inacessível é rejeitado pela API;
- avaliações históricas preservam o responsável registrado sem expor identificadores internos quando o cadastro deixou de estar elegível.

A camada web não envia `contractId` nem autor de auditoria. Na criação, envia apenas o identificador do responsável escolhido, que é revalidado no backend.

## Etapas persistidas

O progresso visual usa somente estado retornado pela API:

1. aluno e contexto resolvidos;
2. cabeçalho persistido com data, responsável e protocolo;
3. peso e dobras persistidos no rascunho;
4. prévia atual retornada pelo endpoint de cálculo;
5. avaliação concluída e somente leitura.

Alterar data, protocolo, decisão de sexo, peso, dobra, referência antropométrica ou observação remove a prévia e a confirmação local de alerta. No banco, mudança de qualquer fonte clínica da ADPT também limpa a confirmação persistida de capacidade do adipômetro, evitando reutilização por outro cliente ou sessão.

## Coleta e protocolo

- O rascunho aceita peso em kg e as dobras tricipital, subescapular, suprailíaca, abdominal e coxa em mm.
- A entrada aceita vírgula ou ponto como separador decimal e envia números normalizados para a API.
- Campos nunca informados permanecem ausentes.
- Limpar uma medida já persistida envia `null` como remoção explícita; vazio não é convertido em zero.
- O protocolo e a versão são escolhidos explicitamente entre opções aprovadas retornadas por `GET /protocols/available`.
- Não existe fallback silencioso para protocolo indisponível, desabilitado ou sem aprovação clínica ativa.
- O sexo de referência e a origem da confirmação são explícitos. Divergência pode exigir justificativa e continua sujeita à validação da API.
- Resultados derivados são somente leitura e nunca são enviados como fonte de verdade pelo navegador.

## Ajuda técnica

Cada dobra possui orientação textual e link de vídeo externo aberto com `noopener noreferrer`. O diálogo:

- possui semântica de modal, foco inicial e fechamento por `Esc`;
- mantém navegação por teclado dentro do conteúdo;
- restaura o foco ao acionador;
- funciona sem imagem configurada;
- não incorpora vídeo nem inicia reprodução automática.

## Antropometria de apoio

Quando disponível, a tela mostra código e data da Antropometria elegível e destaca referências para os pontos médios da tricipital e da coxa. O vínculo é opcional, deve ser salvo explicitamente e nunca copia automaticamente valores ou resultados. Ausência ou falha dessa origem não bloqueia a ADPT.

## Concorrência, estado e correção

- Erros preservam os valores locais do formulário.
- Em conflito `409`, o profissional escolhe entre substituir o formulário pela versão atual do servidor ou atualizar a referência do servidor mantendo os valores locais.
- Uma avaliação concluída não é editada diretamente.
- A correção exige permissão específica, categoria e motivo, cria nova revisão e preserva o original.
- Estados de revisão são apresentados separadamente como rascunho, concluída, substituída, cancelada ou invalidada.
- Repetir a conclusão usa a idempotência da API e não cria outro registro.

## Permissões

- tela: `physicalAssessment.protocol`;
- consulta: `physicalAssessment.adpt.view`;
- criação, edição, cálculo e conclusão: `physicalAssessment.adpt.actions.manage`;
- correção de concluída: `physicalAssessment.adpt.actions.correctCompleted`.

A ocultação ou desabilitação de controles é apenas experiência de usuário; a API revalida todas as permissões e o vínculo do responsável.

## Verificação

Validações mínimas da mudança:

```bash
pnpm --filter @corrida/web test -- adipometry-ui.test.ts adipometry-screen-utils.test.ts AdipometryScreen.test.tsx AdipometryDialogs.test.tsx AdipometryView.test.ts AdipometryViewSections.test.ts
pnpm --filter @corrida/api test -- adipometry-responsible-professor.test.ts adipometry-web-remediation.routes.test.ts adipometry-capacity-confirmation-migration.test.ts
pnpm --filter @corrida/web type-check
pnpm --filter @corrida/api type-check
pnpm lint
pnpm access:check
pnpm docs:check
pnpm validate
```

A validação visual deve cobrir a rota autenticada em 1440×900, 1366×768 e 390×844, incluindo rascunho, impedimento clínico, conflito, ajuda por teclado, confirmação de conclusão e histórico. O registro deve identificar SHA, viewport, cenário e resultado; evidência de outra rota não satisfaz este gate.
