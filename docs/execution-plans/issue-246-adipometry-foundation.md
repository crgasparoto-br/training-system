# Plano de execução — issue 246

## Entrega estrutural

- fonte canônica de protocolos e bloqueios clínicos;
- contratos compartilhados sem resultados derivados em comandos do frontend;
- persistência histórica, protocolo versionado, snapshot e auditoria;
- sequência transacional por contrato/aluno;
- imutabilidade e não exclusão de concluídos;
- correção versionada e isolada por contrato;
- documentação de produto e banco.

## Decisões

1. Guedes permanece `DRAFT` e Slaughter `DISABLED`.
2. Nenhum cálculo clínico é implementado ou habilitado nesta issue sem aprovação formal.
3. As cinco dobras são colunas tipadas para impedir pontos arbitrários e facilitar comparação.
4. Resultados usam `Decimal(8,4)` e medidas `Decimal(8,2)`; a regra clínica de arredondamento será registrada no protocolo aprovado.
5. Correção cria novo registro e mantém a versão anterior.
6. A largura mínima do código é três dígitos, sem limite em 999.

## Gate clínico pendente

A habilitação do primeiro protocolo e o encerramento funcional da cadeia de cálculo dependem de:

- fórmula e referência completas;
- população e aplicabilidade aprovadas;
- unidades, limites, alertas, bloqueios, precisão e arredondamento;
- tratamento aprovado para sexo, idade e maturação ausentes/incompatíveis;
- vetores de teste independentes;
- nome e data do aprovador clínico.

## Continuação prevista

Endpoints, autorização, serviço de cálculo, tela, comparação visual e laudo permanecem nas issues filhas do épico #245. Esses trabalhos devem consumir os contratos e invariantes desta fundação, sem aceitar resultados calculados pelo cliente.