# Invariantes operacionais da prescrição por capacidades

Este documento complementa `integrated-prescription-control.md` para a implementação da Issue #136.

## Avaliação física como fonte

Quando uma versão manual de **Flexibilidade** referencia avaliações físicas selecionadas pelo professor, o backend procura medições numéricas associadas às articulações suportadas e preenche ângulos ainda vazios. Valores já revisados manualmente pelo professor prevalecem. O preenchimento automático nunca publica treino nem substitui a validação profissional.

Articulações canônicas mínimas: coluna cervical/pescoço, ombro, cotovelo, punho, dedos, quadril, joelho e tornozelo.

## Objetivos do PRNT

Para uma capacidade, três representações devem permanecer equivalentes:

1. classificação persistida do objetivo;
2. origem técnica `prontuario_goal` da versão;
3. vínculo `linkedProntuarioGoalIds` da versão.

A API rejeita a gravação com conflito quando a classificação ainda não foi salva ou quando os dois conjuntos enviados divergem. Perfis sem acesso ao bloco de objetivos continuam podendo versionar capacidades sem vínculos de PRNT.

## Concorrência e versionamento

O PostgreSQL serializa a alocação de versão por chave lógica usando advisory locks transacionais:

- planejamento: contrato + aluno + nível + código;
- catálogo: contrato + categoria + código.

Duas gravações concorrentes recebem versões distintas. No catálogo, somente a versão mais recente permanece marcada como atual.

## Limites preservados

- nenhuma capacidade publica `Treino de hoje` diretamente;
- avaliações e objetivos permanecem filtrados por contrato e aluno;
- dados derivados são contexto técnico e exigem decisão final do professor.
