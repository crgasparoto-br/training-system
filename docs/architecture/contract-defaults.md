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

- cria somente padrões ausentes;
- preserva registros existentes, inclusive customizações;
- pode ser executada novamente sem duplicar dados;
- consulta apenas dados do contrato autenticado para decidir o que falta.

### Copiar dados manualmente entre contratos

`POST /api/v1/contracts/copy-data`

A operação de cópia entre tenants é separada do bootstrap e exige `sourceContractId` explícito. Os flags `copyParameters`, `copyExercises` e `copyAssessmentTypes` continuam opcionais e assumem `true`.

Nomes, grupos musculares e observações dos exercícios passam pela recuperação de textos legados CP850 antes da gravação. A comparação com o destino usa o nome normalizado, inclusive para impedir que uma versão corrompida e outra corrigida sejam copiadas como dois exercícios distintos.

Registros históricos persistidos antes dessa regra são saneados pela migration `20260831121000_repair_exercise_library_ptbr_encoding`. A atualização preserva IDs e relações e não renomeia um registro quando o mesmo contrato já possui o nome corrigido.

`POST /api/v1/contracts/clone-data` permanece apenas como compatibilidade temporária: com `sourceContractId`, executa a cópia manual; sem origem, instala os defaults do produto e nunca seleciona outro tenant automaticamente.

## Interface

Em **Configurações > Empresa / prestador**, a ação principal é **Instalar padrões do sistema**. Ela chama `/contracts/install-defaults` e apresenta os contadores de itens instalados e já existentes.

## Configuração

`DEFAULT_CONTRACT_ID` não é necessário para bootstrap, primeiro uso ou reparo de contratos legados e foi removido do `.env.example`.
