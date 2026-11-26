# Instalação de defaults do produto

## Objetivo

O bootstrap de configuração de um contrato deve usar somente fontes versionadas no repositório. Ele não pode escolher outro tenant como origem implícita nem depender de `DEFAULT_CONTRACT_ID`.

## Fontes canônicas

A instalação inicial cobre estas categorias:

- parâmetros de treino: `apps/api/src/common/product-defaults.ts` (`PRODUCT_TRAINING_PARAMETERS`);
- tipos de avaliação: `apps/api/src/common/product-defaults.ts` (`PRODUCT_ASSESSMENT_TYPES`);
- biblioteca inicial de exercícios: `apps/api/src/scripts/exercises-data.json`, mantida diretamente em UTF-8 pt-BR.

O build da API copia o catálogo JSON de exercícios para `dist/scripts/exercises-data.json`, permitindo que o mesmo arquivo seja usado em desenvolvimento e no artefato compilado.

## API

### Instalar ou reparar defaults

`POST /api/v1/contracts/install-defaults`

Requer professor master autenticado. O contrato alvo é sempre o contrato da sessão; não existe parâmetro de contrato de origem.

A resposta informa, por categoria, quantos padrões foram instalados e quantos já existiam. A operação:

- cria somente padrões ausentes e os identifica como **aprovados automaticamente pelo catálogo do produto** (`systemDefault=true`), sem atribuir revisor humano;
- em exercícios padrão já existentes, completa apenas metadados vazios e a URL canônica somente quando a **origem pelo próprio sistema** está comprovada (`systemDefault=true`); registros históricos sem procedência e exercícios personalizados não recebem mídia automaticamente;
- preserva valores existentes e customizações, sem substituir um campo não vazio durante o reparo e sem editar exercícios aplicados a treinos;
- combina ocorrências duplicadas do catálogo de forma não destrutiva: a primeira ocorrência mantém os valores já preenchidos e ocorrências posteriores podem somente completar lacunas;
- aceita `A = Alternado` como valor canônico de `movementType`, preservando `U`, `I` e `O`;
- ignora códigos não suportados, incluindo `B` e `-`, em vez de reinterpretá-los silenciosamente;
- pode ser executada novamente sem duplicar dados;
- consulta apenas dados do contrato autenticado para decidir o que falta.

Chamadas concorrentes para o mesmo contrato devem convergir para o mesmo estado final sem duplicar padrões. A implementação pode substituir o mecanismo interno de lock/transação quando necessário, desde que preserve esse resultado observável e a reexecução continue idempotente. Não existe requisito de produto de manter as três categorias em uma única transação longa apenas por conveniência de implementação.

### Copiar dados manualmente entre contratos

`POST /api/v1/contracts/copy-data`

A operação de cópia entre tenants é separada do bootstrap e exige `sourceContractId` explícito. Os flags `copyParameters`, `copyExercises` e `copyAssessmentTypes` continuam opcionais e assumem `true`.

Nomes, grupos musculares e observações dos exercícios passam pela recuperação de textos legados CP850 antes da gravação. A comparação com o destino usa o nome normalizado, inclusive para impedir que uma versão corrompida e outra corrigida sejam copiadas como dois exercícios distintos.

Registros históricos persistidos antes dessa regra são saneados pela migration `20260831121000_repair_exercise_library_ptbr_encoding`. A atualização preserva IDs e relações e não renomeia um registro quando o mesmo contrato já possui o nome corrigido.

`POST /api/v1/contracts/clone-data` permanece apenas como compatibilidade temporária: com `sourceContractId`, executa a cópia manual; sem origem, instala os defaults do produto e nunca seleciona outro tenant automaticamente.

## Aprovação e direitos de mídia (#570)

Os exercícios padrão são itens publicados do catálogo do próprio produto; sua aprovação automática **não é** uma revisão profissional do exercício ou autorização de uso da mídia. O banco registra `systemDefault` e o evento `system_defaults_install` (ou `system_defaults_approval` na promoção de registros antigos elegíveis). Registros manuais, importações externas e cópias entre contratos continuam entrando como rascunho.

A migration `20261124120000_issue_570_library_content_versions` promove somente exercícios cuja primeira revisão demonstra instalação padrão e cujas revisões posteriores são exclusivamente reparos automáticos; restaura links canônicos ausentes de registros elegíveis, sem alterar mídias personalizadas ou conteúdo já aplicado em treinos. Novas execuções de **Instalar padrões** mantêm essa recuperação idempotente.

Uma edição ou decisão explícita de curadoria humana retira a elegibilidade do registro para reparos automáticos posteriores. A aprovação profissional continua sujeita às validações técnicas e de mídia usuais.

A URL de origem do YouTube aparece para curadoria administrativa; a prévia pública e a divulgação do vídeo no contexto de treinos exigem origem declarada e, para mídia licenciada ou de terceiros, licença/autorização registrada. A opção canônica `Própria` dispensa licença adicional após curadoria explícita (#579). A URL por si só nunca é tratada como prova de direitos.

## Interface

Em **Configurações > Empresa / prestador**, a ação principal é **Instalar padrões do sistema**. Ela chama `/contracts/install-defaults` e apresenta os contadores de itens instalados e já existentes.

## Configuração

`DEFAULT_CONTRACT_ID` não é necessário para bootstrap, primeiro uso ou reparo de contratos legados e foi removido do `.env.example`.


A partir da #582, reparos/reinstalações de catálogo não modificam raízes com versões, candidatos ou registros substituídos. A cópia entre contratos prefere a versão vigente da identidade e mantém o destino como novo rascunho sem herdar autorização de mídia. Cópias legadas com sufixo não são associadas automaticamente.
