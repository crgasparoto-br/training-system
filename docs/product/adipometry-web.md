# Adipometria (ADPT) — fluxo guiado da camada web

A rota `/protocolo-avaliacao-fisica/adipometria` é a interface operacional do professor para criar, retomar, calcular, concluir e corrigir avaliações ADPT. A API montada em `/api/v1/adipometry` permanece autoritativa para segurança, protocolo, cálculo, concorrência, conclusão e histórico.

## Entrada e contexto

- A abertura direta permite selecionar apenas alunos retornados pelas consultas autenticadas do contrato.
- `?alunoId={id}` preserva o aluno recebido pela Central do Aluno e bloqueia troca acidental.
- `?assessmentId={id}` abre exatamente a avaliação solicitada. A tela rejeita combinações em que o registro não pertence ao aluno preservado ou selecionado.
- O professor responsável é derivado da autenticação. A camada web não envia `professorId`, `contractId` ou autor em payloads ADPT.

## Etapas persistidas

O progresso visual usa somente estado retornado pela API:

1. aluno e contexto resolvidos;
2. cabeçalho persistido com data, responsável e protocolo;
3. peso e dobras persistidos no rascunho;
4. prévia atual retornada pelo endpoint de cálculo;
5. avaliação concluída e somente leitura.

Alterar data, protocolo, decisão de sexo, peso, dobra, referência antropométrica ou observação remove a prévia da interface. A conclusão exige nova prévia e o `inputFingerprint` atual.

## Coleta e protocolo

- O rascunho aceita peso em kg e as dobras tricipital, subescapular, suprailíaca, abdominal e coxa em mm.
- A entrada aceita vírgula ou ponto como separador decimal e envia números normalizados para a API.
- Campos vazios permanecem ausentes; o frontend não converte vazio em zero.
- O protocolo e a versão são escolhidos explicitamente entre opções aprovadas retornadas por `GET /protocols/available`.
- Não existe fallback silencioso para protocolo indisponível, desabilitado ou sem aprovação clínica ativa.
- O sexo de referência e a origem da confirmação são explícitos. Divergência pode exigir justificativa e continua sujeita à validação da API.
- Resultados derivados são somente leitura e nunca são enviados como fonte de verdade pelo navegador.

## Ajuda técnica

Cada dobra possui orientação textual e link de vídeo externo aberto com `noopener noreferrer`. O diálogo:

- possui semântica de modal, foco inicial e fechamento por `Esc`;
- mantém navegação por teclado dentro do conteúdo;
- funciona sem imagem configurada;
- não incorpora vídeo nem inicia reprodução automática.

## Antropometria de apoio

Quando disponível, a tela mostra código e data da Antropometria elegível e destaca referências para os pontos médios da tricipital e da coxa. O vínculo é opcional, deve ser salvo explicitamente e nunca copia automaticamente valores ou resultados. Ausência ou falha dessa origem não bloqueia a ADPT.

## Concorrência, erro e correção

- Erros preservam os valores locais do formulário.
- Em conflito `409`, o professor escolhe entre atualizar a referência do servidor mantendo os valores locais ou substituir o formulário pela versão atual do servidor.
- Uma avaliação concluída não é editada diretamente.
- A correção exige permissão específica, categoria e motivo, cria nova revisão e preserva o original.
- Repetir a conclusão usa a idempotência da API e não cria outro registro.

## Permissões

- tela: `physicalAssessment.protocol`;
- consulta: `physicalAssessment.adpt.view`;
- criação, edição, cálculo e conclusão: `physicalAssessment.adpt.actions.manage`;
- correção de concluída: `physicalAssessment.adpt.actions.correctCompleted`.

A ocultação ou desabilitação de controles é apenas experiência de usuário; a API revalida todas as permissões.

## Verificação

Validações mínimas da mudança:

```bash
pnpm --filter @corrida/web test -- adipometry-ui.test.ts
pnpm --filter @corrida/web type-check
pnpm --filter @corrida/web lint
pnpm docs:check
pnpm validate
```

A verificação manual deve cobrir abertura direta e contextual, rascunho incompleto, ajuda por teclado, cálculo com impedimentos, invalidação da prévia, conflito `409`, conclusão, leitura histórica, correção e layout em viewport móvel e desktop.
