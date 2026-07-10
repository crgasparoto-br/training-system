# Catálogo comercial de serviços

## Objetivo

Definir a arquitetura de produto para a evolução da tela `/settings/services` de um cadastro técnico de serviços e ofertas para uma área de gestão do catálogo comercial da ACESSO.

A tela deve permitir administrar, de forma clara e estruturada:

- serviços e avaliações;
- planos individuais;
- planos combinados;
- opções comerciais e valores;
- conteúdo institucional de cada serviço;
- composição de cada plano;
- ordem e status de exibição.

O documento comercial "Serviços ACESSO 2026" é a referência inicial de conteúdo e organização do catálogo, mas a interface do sistema não deve reproduzir literalmente o PDF. O sistema deve transformar esse conteúdo em dados estruturados, reutilizáveis e versionáveis.

## Problema atual

A tela atual reúne, em uma única visão:

- formulário de criação e edição;
- distinção técnica entre serviço-base e oferta;
- descrição genérica;
- preço mensal e vigência;
- tabela horizontal com todos os registros.

Esse modelo atende parcialmente ofertas simples vinculadas a um serviço, mas não representa adequadamente:

- categorias comerciais diferentes;
- conteúdo separado em "O que é?", "A quem se destina?" e "O que o compõe?";
- múltiplas opções comerciais do mesmo serviço;
- planos compostos por vários serviços;
- quantidades, frequências ou unidades dos componentes;
- ordenação do catálogo;
- valores gratuitos ou sob consulta.

## Princípios de produto

1. A linguagem da interface deve refletir a operação comercial, e não a estrutura técnica do banco.
2. Serviço, opção comercial e composição de plano são conceitos diferentes.
3. Conteúdo institucional deve ser estruturado e editável por seção.
4. Preços e vigências devem pertencer a opções comerciais, não necessariamente ao serviço principal.
5. Planos combinados devem permitir relacionar vários serviços ou opções.
6. O catálogo deve ser navegável antes de ser editável.
7. A ordem de exibição deve ser explícita e controlável.
8. Dados continuam obrigatoriamente isolados por `contractId`.

## Taxonomia do catálogo

Cada item principal deve possuir uma categoria comercial:

- `assessment`: avaliação ou consulta;
- `individual_service`: serviço individual;
- `combined_plan`: plano combinado.

A categoria determina os campos e fluxos disponíveis, mas não deve impedir futuras extensões.

## Estrutura conceitual

### Serviço

Representa o item principal do catálogo.

Campos esperados:

- identificador;
- `contractId`;
- nome;
- código estável;
- categoria;
- resumo curto para cards e seletores;
- conteúdo "O que é?";
- conteúdo "A quem se destina?";
- status ativo/inativo;
- ordem de exibição;
- indicação de origem do sistema quando aplicável;
- datas de criação e atualização.

### Opção comercial

Representa uma forma de contratar um serviço.

Exemplos:

- Plano Essencial 1x por semana;
- Plano Essencial 2x por semana;
- Acesso Run mensal;
- consulta gratuita;
- avaliação sob consulta.

Campos esperados:

- serviço proprietário;
- nome comercial;
- frequência ou periodicidade;
- quantidade opcional;
- unidade opcional;
- tipo de preço: fixo, gratuito ou sob consulta;
- valor monetário quando fixo;
- vigência inicial e final;
- status;
- ordem de exibição.

### Item de composição

Representa um item mostrado na seção "O que o compõe?".

Pode ser:

- texto livre ordenado;
- vínculo com outro serviço;
- vínculo com uma opção comercial;
- quantidade e unidade;
- observação complementar.

Exemplos:

- Plano Essencial 2x por semana;
- 2 sessões de massoterapia e/ou quiropraxia por mês;
- acompanhamento nutricional;
- valores especiais em serviços parceiros.

### Composição de plano

Planos combinados devem relacionar vários serviços ou opções comerciais. Um único `parentServiceId` não é suficiente para esse caso.

A composição precisa preservar:

- plano proprietário;
- serviço ou opção incluída;
- quantidade;
- unidade ou periodicidade;
- observação;
- ordem;
- status.

## Arquitetura da tela

A rota `/settings/services` deve se tornar um hub de gestão do catálogo com três áreas principais.

### Catálogo

Visão inicial com cards ou lista visual.

Cada item deve exibir:

- nome;
- categoria;
- resumo;
- quantidade de opções comerciais;
- preço inicial, gratuito ou sob consulta;
- status;
- ação para abrir detalhes.

Controles esperados:

- busca por nome;
- filtro por categoria;
- filtro por status;
- ordenação;
- criação de novo serviço;
- atualização manual da lista quando necessário.

### Combinações e valores

Visão comercial consolidada, separada em:

- avaliações e consultas;
- serviços individuais;
- planos combinados.

Deve permitir identificar rapidamente:

- opções sem preço;
- valores vencidos;
- serviços sem opção ativa;
- planos sem composição;
- valores gratuitos ou sob consulta.

A edição pode ocorrer em modal ou painel lateral, sem exigir uma tabela horizontal extensa.

### Detalhes do serviço

A edição de um serviço deve ser dividida em seções ou abas.

#### Visão geral

- nome;
- código;
- categoria;
- resumo;
- status;
- ordem.

#### Apresentação

- "O que é?";
- "A quem se destina?";
- "O que o compõe?".

"O que o compõe?" deve ser uma lista reordenável e não um único texto longo.

#### Opções e preços

- opções comerciais;
- preço e tipo de preço;
- frequência;
- vigência;
- status;
- ordenação.

#### Composição

Disponível principalmente para planos combinados.

Deve permitir incluir vários serviços ou opções, com quantidade, unidade, observação e ordem.

## Fluxo de criação

Ao iniciar um novo cadastro, o usuário deve escolher:

- avaliação ou consulta;
- serviço individual;
- plano combinado.

O formulário deve se adaptar ao tipo escolhido.

Não deve expor como decisão principal os termos técnicos "serviço-base" e "oferta".

## Conteúdo inicial de referência

O catálogo inicial possui nove itens comerciais:

1. Consultas de Avaliação Física;
2. Plano Essencial | Personal Trainer;
3. Acesso Run;
4. Consultoria On-line;
5. Plano Vida Saudável;
6. Plano Performance e Saúde;
7. Plano Longevidade e Saúde;
8. Plano Vida sem Dor;
9. Plano Tratamento da Obesidade.

A migração ou carga desses dados deve ser idempotente e respeitar dados já existentes no contrato.

## Escopo da primeira evolução

Incluído:

- modelo estruturado de catálogo;
- categorias;
- conteúdo institucional por seção;
- opções comerciais;
- tipos de preço;
- composição de planos;
- nova navegação da tela;
- carga inicial baseada no material comercial;
- testes e documentação.

Fora do escopo inicial:

- geração automática do PDF comercial;
- publicação de página pública de vendas;
- conteúdo institucional de instalações, parceiros e monitoramento que não pertença diretamente a um serviço;
- checkout, cobrança recorrente ou integração financeira;
- alteração automática de contratos de alunos existentes.

## Requisitos de segurança e acesso

- Toda consulta e mutação deve ser limitada ao `contractId` autenticado.
- A rota continua protegida pela `screenKey` `settings.services`.
- Ações sensíveis adicionais devem usar `blockKey` caso a implementação separe consulta, edição de conteúdo, edição de preço ou ativação.
- O backend deve validar vínculos entre registros do mesmo contrato.
- O frontend não deve ser a única barreira de autorização.

## Migração e compatibilidade

A evolução deve preservar os registros atuais de serviços e ofertas.

A estratégia de implementação deve:

1. mapear serviço-base atual para serviço principal;
2. mapear ofertas atuais para opções comerciais;
3. preservar preços, vigências, status e códigos;
4. impedir relacionamento entre contratos diferentes;
5. permitir rollout incremental sem quebrar o campo "Serviço de Interesse" do aluno;
6. manter compatibilidade de API durante a transição ou atualizar todos os consumidores no mesmo conjunto de entregas.

## Critérios globais de aceite

- O catálogo permite representar os nove itens do material comercial.
- Um serviço possui categoria, resumo e as três seções institucionais.
- Um serviço pode possuir zero ou várias opções comerciais.
- Uma opção pode ter preço fixo, gratuito ou sob consulta.
- Um plano combinado pode possuir vários componentes.
- Componentes e opções podem ser reordenados.
- A tela principal permite localizar e compreender o catálogo sem abrir o formulário de edição.
- O cadastro de aluno continua consumindo apenas serviços válidos e ativos conforme a regra definida na implementação.
- Nenhum dado pode ser consultado ou relacionado fora do `contractId`.
- Migrações e carga inicial são idempotentes.
- Testes cobrem modelo, API, permissões e principais fluxos de interface.

## Referências relacionadas

- `ARCHITECTURE.md`;
- `docs/architecture/database.md`;
- `docs/architecture/api.md`;
- `docs/architecture/web.md`;
- `docs/architecture/auth-and-access-control.md`;
- `docs/product/access-control.md`;
- `docs/execution-plans/active/2026-07-services-commercial-catalog.md`.
