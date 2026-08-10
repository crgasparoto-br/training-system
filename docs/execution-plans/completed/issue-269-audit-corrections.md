# Correções da auditoria da issue #269

## Objetivo

Eliminar as pendências encontradas na auditoria dos convites de pré-cadastro sem ampliar o escopo para a landing page ou para a reivindicação autenticada da issue #271.

## Escopo corrigido

- PR #279 redirecionada de `main` para `develop`.
- Geração do convite e transição `LEAD -> INVITED` executadas na mesma transação.
- Convite recém-criado confirmado por leitura pós-commit antes de retornar token e URL brutos.
- Expiração consolidada em acessos públicos e administrativos, inclusive em `expiresAt`.
- Registro de primeiro acesso protegido contra concorrência.
- Revogação concorrente com regeneração não retorna falso sucesso.
- IP e User-Agent sanitizados antes da auditoria pública.
- Rate limiter com limpeza de janelas e limite de chaves em memória.
- Variável de validade documentada no `.env.example`, guia operacional e documentação central de deploy.

## Evidências automatizadas

- Falha diferida no commit de `PreRegistrationInvite` comprova que o serviço não devolve token para convite revertido e que o ciclo do lead também é revertido.
- Leitura administrativa de convite vencido comprova `EXPIRED`, ações permitidas atualizadas e evento único.
- Dois acessos públicos simultâneos comprovam um único `FIRST_ACCESSED`.
- Regeneração e revogação simultâneas comprovam que sucesso de revogação sempre corresponde ao estado `REVOKED`.
- Testes de sanitização comprovam descarte de IP inválido, remoção de controles e limite do User-Agent.
- Saturação do rate limiter comprova falha fechada e reutilização da capacidade após expiração da janela.

## Validação

Comando oficial: `pnpm validate` pelo workflow `Validate PR` do repositório.

O ambiente local da execução não resolveu `github.com`, portanto a validação executável foi delegada ao CI da PR e seus resultados devem permanecer vinculados ao commit final auditado.

## Fora do escopo

- Landing page pública e autenticação/reivindicação, pertencentes à #271.
- Rate limit distribuído entre múltiplas réplicas; requer armazenamento compartilhado quando houver escala horizontal.
- Merge da PR e fechamento da issue.
