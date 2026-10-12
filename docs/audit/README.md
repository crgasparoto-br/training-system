# Auditoria GitHub-native do training-system

O contrato canônico deste repositório é [github-native-contract.json](./github-native-contract.json). O objetivo é auditar PRs usando diretamente a identidade imutável do GitHub, em vez de exigir que cada entrega herde ou reconstrua um pacote `.audit/entregar-issue` de outras issues.

## Fronteira de confiança

- O contrato só autoriza a auditoria GitHub-native quando **já existir na base imutável da PR** (`pull_request.base.sha`), antes do código candidato. A PR que introduz este arquivo não pode se autoisentar do handoff anterior.
- Um arquivo `.audit/entregar-issue/handoff-ready.json` herdado de outra issue/PR é histórico e **não** pode ser usado como certificado do candidato. Com este contrato confiável na base, o transporte legado é dispensado, mas todas as verificações substantivas continuam obrigatórias.
- Conferir `repository`, número de issue **separado** do número da PR, SHA do head, base, merge preview, paths alterados, risco, required checks, comentários anteriores, evidências e validação independente.
- Evidência de CI deve corresponder ao HEAD auditado. Check verde de SHA antigo, descrição textual da PR e certificado criado pelo próprio candidato não substituem verificação remota.

## Gates e proteção

- O check obrigatório exato é `Validate repository`. A origem e a exigência de status estrito em `develop` e `main` devem ser reconsultadas no Ruleset vigente; o JSON por si só não altera rulesets.
- A classificação FAST/STANDARD/CRITICAL e a verificação de merge preview continuam regidas por [ci-validation.md](../architecture/ci-validation.md), `config/ci-risk-policy.json` e `.github/workflows/validate-pr.yml`.
- Auditoria independente **não** é substituída pelo CI. Bloqueadores funcionais, de segurança ou documentação ainda reprovam. Nenhum merge é automático.

## Aplicação à PR #498 / Issue #391

A PR #498 possuía no seu HEAD material `126a76424d191e45951f44bdabccce7e0bb34e5f` um `handoff-ready.json` herdado de `develop` que identifica a **Issue #388 / PR #495**; esse arquivo não certifica a Issue #391. A CI crítica da PR #498 concluiu com sucesso no run [38267090587](https://github.com/crgasparoto-br/training-system/actions/runs/38267090587).

Este contrato só será fonte confiável para #498 **depois de integrado a develop e de nova verificação de base/head/merge preview e CI atual**, em auditoria separada. A publicação desta PR de governança não equivale a aprovação da PR #498.

A homologação manual de treinamento em dispositivos físicos reais (desktop e mobile), com navegação, rascunhos, concorrência, troca de aluno/contrato, revogação de acesso e falha parcial, continua um aceite operacional **externo e não executado por CI/Chromium**. Registrar responsáveis, dispositivo, data, evidência e resultado antes de liberar a funcionalidade.
