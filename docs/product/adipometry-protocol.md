# Adipometria (ADPT) — protocolo, sexo de cálculo e governança clínica

## Status

Esta é a fonte canônica versionada da adipometria no Sistema ACESSO. A fundação estrutural pode ser implantada sem uma aprovação clínica ativa, mas nenhum protocolo pode calcular ou concluir uma avaliação em um contrato até cumprir simultaneamente os gates de definição e de aprovação descritos abaixo.

O domínio de responsabilidade técnica é `ADIPOMETRY_CLINICAL_RESPONSIBLE`.

## Fronteira do domínio

`AdipometryAssessment` mantém o histórico próprio da ADPT. Registros genéricos de avaliação, antropometria ou prescrição são consumidores auxiliares e não aprovam protocolo, não substituem a ADPT e não autorizam conclusão.

As cinco dobras da ADPT permanecem disponíveis para registro:

| Campo | Ponto | Unidade |
|---|---|---|
| `tricepsMm` | Tricipital | mm |
| `subscapularMm` | Subescapular | mm |
| `suprailiacMm` | Suprailíaca | mm |
| `abdominalMm` | Abdominal | mm |
| `thighMm` | Coxa | mm |

Cada protocolo define quais delas entram no cálculo. Uma dobra não utilizada pode permanecer no histórico, mas sua ausência não bloqueia a conclusão daquele protocolo.

## Estados e aprovação por contrato

A definição global de protocolo continua usando `DRAFT`, `APPROVED` e `DISABLED`. Para `GUEDES_1991_ADULT_YOUNG`, a definição global permanece `DRAFT`: ela é um candidato executável, ainda sem aprovação automática para qualquer contrato.

A disponibilidade efetiva é derivada por contrato:

- `DRAFT`: não existe aprovação clínica válida para a versão no contrato;
- `APPROVED`: o responsável técnico vigente aprovou explicitamente a versão e o snapshot da definição;
- `DISABLED`: a versão foi desativada globalmente e não pode receber nova aprovação nem iniciar novos cálculos.

A designação do responsável não aprova protocolo. A aprovação deve ser realizada pelo próprio profissional designado, autenticado em sua conta, e preserva:

- contrato, protocolo e versão;
- designação vigente usada na aprovação;
- usuário e professor aprovadores;
- declaração explícita;
- data e hora;
- nome e CREF pessoal em snapshot;
- SHA-256 da especificação;
- snapshot integral da definição clínica aprovada.

A aprovação é imutável. Mudanças materiais de fórmula, população, limites, precisão, arredondamento, referência ou vetores exigem nova versão e nova aprovação pelo responsável vigente.

## Responsabilidade técnica

A seção **Responsabilidade técnica** fica em `/settings/contract`.

O usuário `master` pode administrar a designação. O profissional selecionado precisa:

1. pertencer ao mesmo `contractId`;
2. possuir usuário ativo e perfil profissional válido;
3. possuir CREF pessoal preenchido;
4. não possuir desligamento vigente nem status inativo;
5. possuir função compatível com a permissão `settings.contract.adipometryProtocolApproval`, salvo o perfil `master`, que tem acesso total.

Existe no máximo uma designação ativa por contrato e domínio. Uma troca encerra a designação anterior com data, ator e motivo, e cria uma nova linha; o histórico nunca é sobrescrito ou excluído.

Troca ou desligamento do responsável não altera aprovações históricas nem avaliações concluídas. Sem responsável vigente, a estrutura continua disponível, mas o gate de aprovação retorna `MISSING_ADIPOMETRY_CLINICAL_RESPONSIBLE`.

## Protocolo `GUEDES_1991_ADULT_YOUNG`

### Identidade

- código: `GUEDES_1991_ADULT_YOUNG`;
- versão interna: `1.0.0`;
- faixa etária: 18 a 30 anos completos, inclusive, na data da avaliação;
- maturação: não participa da aplicabilidade (`NOT_REQUIRED`);
- sexos de protocolo: `male` e `female`;
- referência: GUEDES, Dartagnan Pinto; GUEDES, Joana Elisabete Ribeiro Pinto. **Proposição de equações para predição de quantidade de gordura corporal em adultos jovens**. *Semina: Ciências Biológicas e da Saúde*, v. 12, n. 2, p. 61–70, 1991. DOI: `10.5433/1679-0367.1991v12n2p61`.

Não apresentar esta versão genericamente como “Guedes para adultos”.

### Sexo usado pelo protocolo

O campo clínico `protocolSex` pertence à avaliação e aceita somente `male` ou `female`.

O sistema preserva separadamente:

- sexo do cadastro no momento da avaliação (`profileSexSnapshot`);
- sexo utilizado pelo protocolo (`protocolSex`);
- origem da decisão;
- usuário e instante de confirmação;
- motivo obrigatório quando houver divergência.

Não existe inferência automática silenciosa. Quando cadastro e protocolo divergem, a origem deve ser `professional_override` e o motivo é obrigatório. O snapshot da avaliação concluída preserva ambos os valores e a decisão.

### Equações

Para homens, usam-se tricipital (`TR`), suprailíaca (`SI`) e abdominal (`AB`):

```text
S = TR + SI + AB
D = 1,17136 - 0,06706 × log10(S)
```

Para mulheres, usam-se subescapular (`SB`), suprailíaca (`SI`) e coxa (`CX`):

```text
S = SB + SI + CX
D = 1,16650 - 0,07063 × log10(S)
```

Resultados derivados:

```text
percentualGordura = ((4,95 / D) - 4,50) × 100
gorduraKg = pesoKg × percentualGordura / 100
massaMagraKg = pesoKg - gorduraKg
```

A combinação de dobras é fixa por sexo de protocolo; o frontend não pode permitir seleção livre.

### Unidades, precisão e arredondamento

- peso: kg, até duas casas decimais;
- dobras: mm, uma casa decimal;
- densidade e cálculo interno: oito casas de capacidade;
- total de dobras persistido: uma casa decimal;
- percentual, gordura absoluta e massa magra persistidos: duas casas decimais;
- modo: decimal `HALF_UP`;
- estágio: somente resultados finais, sem arredondamento intermediário.

Entrada com precisão superior à permitida é rejeitada, nunca arredondada silenciosamente.

Controle obrigatório: `roundHalfUp(18.245, 2) = 18.25`.

### Limites operacionais

Peso deve ser positivo e não exceder `999,99 kg`. Não há classificação clínica automática de peso baixo ou elevado.

Para cada dobra informada:

- `0,1` a `45,0 mm`: aceitar sem alerta de capacidade;
- `45,1` a `80,0 mm`: aceitar após confirmação explícita do profissional;
- acima de `80,0 mm`: bloquear.

O alerta é operacional, relacionado à capacidade e à confiabilidade do adipômetro, não um limite clínico da equação.

### Bloqueios matemáticos

Impedem cálculo ou conclusão:

- idade fora de 18–30;
- `protocolSex` ausente, inválido ou não confirmado;
- dobra exigida pelo sexo do protocolo ausente, não positiva ou acima do limite;
- precisão de entrada inválida;
- soma das três dobras não positiva;
- `NaN`, infinito ou valor não numérico;
- densidade não positiva;
- percentual fora de 0–100%;
- gordura absoluta ou massa magra negativa;
- ausência da aprovação clínica do contrato.

## Vetores canônicos

Todos usam `log10`, sem arredondamento intermediário.

### Masculino

```text
idade = 25
peso = 80,00 kg
TR = 12,0 mm
SI = 18,0 mm
AB = 20,0 mm
S = 50,0 mm
D = 1,0574270715092267
% gordura = 18,12
gordura = 14,49 kg
massa magra = 65,51 kg
```

### Feminino

```text
idade = 27
peso = 65,00 kg
SB = 15,0 mm
SI = 20,0 mm
CX = 25,0 mm
S = 60,0 mm
D = 1,0409091771854033
% gordura = 25,55
gordura = 16,60 kg
massa magra = 48,40 kg
```

### Arredondamento

```text
sexo = male
idade = 25
peso = 70,00 kg
TR = 20,0 mm
SI = 30,0 mm
AB = 37,3 mm
S = 87,3 mm
D = 1,0411955848171044
% gordura = 25,42
gordura = 17,79 kg
massa magra = 52,21 kg
```

Também devem existir controles para idades 18 e 30 aceitas, 17 e 31 bloqueadas, sexo ausente bloqueado, sexo não binário sem decisão explícita bloqueado, dobra obrigatória ausente bloqueada, dobra não usada ausente aceita e alerta de capacidade confirmado.

## Histórico, correção e snapshot

Avaliação concluída é imutável pelo fluxo comum e não pode ser apagada fisicamente. Correção cria nova avaliação vinculada à anterior, com motivo e autor, mantendo a anterior concluída e auditável.

O snapshot final preserva:

- protocolo, versão e aprovação do contrato;
- hash e snapshot da definição aprovada;
- data da avaliação e idade calculada;
- sexo cadastral e sexo de protocolo com decisão auditável;
- entradas e unidades;
- três dobras efetivamente usadas;
- regras, limites, precisão e arredondamento;
- confirmação do alerta de capacidade, quando aplicável;
- resultados persistidos;
- versão da implementação e instante do cálculo.

Desativação, troca de responsável ou versões futuras não recalculam histórico.
