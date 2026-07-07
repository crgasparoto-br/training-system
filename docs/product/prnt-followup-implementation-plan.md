# PRNT: implementação de acompanhamentos

## Contexto

A issue #182 continua aberta porque a documentação do fluxo já foi criada, mas a UI completa de acompanhamento ainda não foi implementada.

## Estado atual observado

- A API já inclui casos de dor com `followUps`.
- A API já preserva `status` e `closedAt` para casos resolvidos ou arquivados.
- A tela do PRNT já permite criar casos de dor e snapshots corporais.
- A tela ainda não expõe de forma clara acompanhamento, encerramento e resumo consolidado para a Central.

## Próxima PR funcional

A próxima PR deve alterar a tela `ProntuarioScreen.tsx` para:

- exibir status do caso;
- permitir incluir acompanhamento com data, intensidade, observação e conduta;
- permitir marcar o caso como resolvido ou arquivado;
- exibir acompanhamentos existentes;
- manter o aluno selecionado depois de salvar;
- atualizar o resumo da Central com casos ativos e último acompanhamento.

## Observação

Este documento não fecha a #182. Ele existe para deixar explícito que a issue precisa de uma PR funcional posterior.